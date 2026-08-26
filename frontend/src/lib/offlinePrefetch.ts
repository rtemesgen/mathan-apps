import { supabase } from './supabase';
import { offlineStore } from './localStore';
import { getQueuedMutations } from './syncQueue';
import { shouldApplyRemoteSnapshot, withSnapshotStorageLock } from './repositories/snapshotRepository';
import { refreshTruckDataFromCloud } from '../apps/truck/truckRepository';

type SnapshotRow = { domain: string; payload: unknown; revision: number };

/** Warm every app cache for a workspace without requiring the user to open each app. */
export async function prefetchWorkspaceData(workspaceId: string, userId: string) {
  if (!navigator.onLine) return;
  const snapshots = await supabase.from('app_state_snapshots').select('domain,payload,revision').eq('workspace_id', workspaceId);
  if (!snapshots.error) {
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
          const pending = queued.some((mutation) => mutation.companyId === workspaceId
            && mutation.table === 'app_state_snapshots'
            && mutation.entityId === row.domain);
          const localRevision = (await offlineStore.read<number>(`${storageKey}:revision`)) ?? 0;
          if (!shouldApplyRemoteSnapshot(row.revision, localRevision, pending)) return;
          await offlineStore.write(storageKey, row.payload);
          await offlineStore.write(`${storageKey}:revision`, row.revision);
        });
      }
    }
  }

  // Use Truck's serialized repository refresh so prefetch shares its cache
  // lock and pending/conflict protection. A parallel direct write could race
  // a local Truck save before its queue entry became visible.
  await refreshTruckDataFromCloud(workspaceId, userId).catch(() => undefined);
}
