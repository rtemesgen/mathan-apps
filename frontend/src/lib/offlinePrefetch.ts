import { supabase } from './supabase';
import { offlineStore } from './localStore';
import { getQueuedMutations, reconcilePendingSnapshotMutation, type QueuedMutation } from './syncQueue';
import { syncWorkspaceQueues } from './offlineSync';
import { deleteOffline, listOfflineKeys } from './localStore';
import { shouldApplyRemoteSnapshot, withSnapshotStorageLock } from './repositories/snapshotRepository';
import { refreshTruckDataFromCloud } from '../apps/truck/truckRepository';
import { canAttemptBackend, withConnectionTimeout } from './connectivity';
import { diagnostic } from './diagnostics';
import { clearCacheRepair } from './cacheRepair';
import { affectedEntityIds, threeWayMergeSnapshot } from './reconciliation';

type SnapshotRow = { domain: string; payload: unknown; revision: number };

export function cacheKeysSafeToClear(keys: string[], workspaceId: string, userId: string, pending: QueuedMutation[]) {
  const pendingTables = new Set(pending.filter((item) => item.companyId === workspaceId).map((item) => item.table));
  return keys.filter((key) => {
    if (!(key.startsWith(`${userId}:${workspaceId}:cash_book:`) || key.startsWith(`${userId}:${workspaceId}:payroll:`) || key === `truck:${userId}:${workspaceId}`)) return false;
    if (key === `truck:${userId}:${workspaceId}`) return !['trucks', 'truck_owners', 'truck_customers', 'truck_transactions'].some((table) => pendingTables.has(table));
    return !pendingTables.has('app_state_snapshots');
  });
}

/** Rebuild only settled server-cache records; the durable outbox is never a
 * cache key and is deliberately left untouched. Records with pending work are
 * retained until reconciliation has completed so reset cannot hide edits. */
export async function rebuildWorkspaceCache(workspaceId: string, userId: string) {
  const queued = await getQueuedMutations();
  const keys = (await listOfflineKeys()).filter((key) =>
    key.startsWith(`${userId}:${workspaceId}:cash_book:`)
    || key.startsWith(`${userId}:${workspaceId}:payroll:`)
    || key === `truck:${userId}:${workspaceId}`,
  );
  const deletable = cacheKeysSafeToClear(keys, workspaceId, userId, queued);
  await Promise.all(deletable.map((key) => deleteOffline(key)));
  if (canAttemptBackend()) {
    await prefetchWorkspaceData(workspaceId, userId);
    await syncWorkspaceQueues(workspaceId).catch(() => undefined);
    await prefetchWorkspaceData(workspaceId, userId);
  }
  return { cleared: deletable.length, pendingPreserved: keys.length - deletable.length };
}

/** Warm every app cache for a workspace without requiring the user to open each app. */
export async function prefetchWorkspaceData(workspaceId: string, userId: string) {
  if (!canAttemptBackend()) return;
  const serverRefreshAt = new Date().toISOString();
  const snapshots = await withConnectionTimeout(supabase.from('app_state_snapshots').select('domain,payload,revision').eq('workspace_id', workspaceId));
  if (snapshots.error) throw snapshots.error;
  {
    for (const row of (snapshots.data as SnapshotRow[] | null) ?? []) {
      const separator = row.domain.indexOf(':');
      if (separator < 1) continue;
      const domain = row.domain.slice(0, separator);
      const key = row.domain.slice(separator + 1);
      if (domain === 'cash_book' || domain === 'payroll') {
        const storageKey = `${userId}:${workspaceId}:${domain}:${key}`;
        await withSnapshotStorageLock(storageKey, async () => {
          // App resume can prefetch while a local save is still being queued.
          // The lock makes the queue visible before this cloud response is
          // considered, and the checks below prevent an older cloud snapshot
          // from replacing the user's durable local state.
          const queued = await getQueuedMutations();
          const pending = queued.filter((mutation) => mutation.companyId === workspaceId
            && mutation.table === 'app_state_snapshots'
            && mutation.entityId === row.domain);
          const localRevision = (await offlineStore.read<number>(`${storageKey}:revision`)) ?? 0;
          await offlineStore.writeAtomic([
            { key: `${storageKey}:confirmed`, value: row.payload },
            { key: `${storageKey}:confirmed:revision`, value: row.revision },
          ]);
          if (pending.length) {
            const latest = pending.at(-1);
            if (pending.length === 1 && latest?.syncStatus === 'pending' && !latest.lastAttemptAt && latest.payload.base_payload !== undefined) {
              const merged = threeWayMergeSnapshot(latest.payload.base_payload, row.payload, latest.payload.payload);
              await reconcilePendingSnapshotMutation(latest.mutationId, merged, row.revision, affectedEntityIds(row.payload, merged), [
                { key: storageKey, value: merged },
                { key: `${storageKey}:revision`, value: row.revision },
              ]);
            }
            return;
          }
          if (!shouldApplyRemoteSnapshot(row.revision, localRevision, false)) return;
          await offlineStore.writeAtomic([
            { key: storageKey, value: row.payload },
            { key: `${storageKey}:revision`, value: row.revision },
          ]);
        });
      }
    }
  }

  // Use Truck's serialized repository refresh so prefetch shares its cache
  // lock and pending/conflict protection. A parallel direct write could race
  // a local Truck save before its queue entry became visible.
  await refreshTruckDataFromCloud(workspaceId, userId).catch(() => undefined);
  await offlineStore.writeMetadata(`cache:${userId}:${workspaceId}`, {
    schemaVersion: 1,
    userId,
    companyId: workspaceId,
    lastServerRefreshAt: serverRefreshAt,
  });
  await Promise.all([
    clearCacheRepair(userId, workspaceId, 'cash_book'),
    clearCacheRepair(userId, workspaceId, 'payroll'),
    clearCacheRepair(userId, workspaceId, 'truck'),
  ]);
  diagnostic('cache-refreshed', { workspaceId, userId });
}
