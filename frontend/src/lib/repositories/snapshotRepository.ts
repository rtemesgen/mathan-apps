import { offlineStore } from '../localStore';
import { supabase } from '../supabase';
import { getQueuedMutations } from '../syncQueue';
import { syncQueue } from '../offlineSync';
import { reportPersistenceNotice, type PersistenceState } from './types';
import { emitSyncStatus } from '../toast';
import { isConnectivityFailure, withConnectionTimeout } from '../connectivity';
import { diagnostic } from '../diagnostics';
import { recordCacheRepair } from '../cacheRepair';
import { saveOfflineFallback } from '../durablePersistence';

export type SnapshotRepositoryContext = {
  storageKey: string;
  workspaceId?: string;
  userId?: string;
  standalone: boolean;
  domain: 'cash_book' | 'payroll';
  key: string;
};

export type LegacySnapshotGroup<T> = {
  keys: string[];
  combine: (values: Record<string, unknown>) => T;
  merge?: (current: T, legacy: T) => T;
};

/** Cloud data may replace a local snapshot only when it is newer and settled. */
export function shouldApplyRemoteSnapshot(remoteRevision: number, localRevision: number, hasPendingMutation: boolean) {
  return !hasPendingMutation && remoteRevision > localRevision;
}

export function effectiveSnapshotRevision(durableRevision: number | null | undefined, fallbackRevision: number) {
  return durableRevision ?? fallbackRevision;
}

const snapshotTails = new Map<string, Promise<void>>();

/** Serialize every operation that can read or replace one snapshot record. */
export function withSnapshotStorageLock<T>(storageKey: string, operation: () => Promise<T>) {
  const previous = snapshotTails.get(storageKey) ?? Promise.resolve();
  const result = previous.then(operation, operation);
  const tail = result.then(() => undefined, () => undefined);
  snapshotTails.set(storageKey, tail);
  return result.finally(() => { if (snapshotTails.get(storageKey) === tail) snapshotTails.delete(storageKey); });
}

export async function readSnapshot<T>(storageKey: string, initialValue: T) {
  const value = await offlineStore.read<T>(storageKey);
  const revision = (await offlineStore.read<number>(`${storageKey}:revision`)) ?? 0;
  return { value: value ?? initialValue, revision, exists: value !== null };
}

/** Upgrade split parent/child caches into one local canonical record. Sources
 * are copied, never removed, so an interrupted APK upgrade remains recoverable. */
export async function readCanonicalSnapshot<T>(storageKey: string, initialValue: T, legacy?: LegacySnapshotGroup<T>) {
  const current = await readSnapshot(storageKey, initialValue);
  if (current.exists || !legacy) return current;
  const prefix = storageKey.slice(0, storageKey.lastIndexOf(':') + 1);
  const entries = await Promise.all(legacy.keys.map(async (key) => [key, await offlineStore.read<unknown>(`${prefix}${key}`)] as const));
  if (!entries.some(([, value]) => value !== null)) return current;
  const value = legacy.combine(Object.fromEntries(entries));
  await offlineStore.writeAtomic([{ key: storageKey, value }, { key: `${storageKey}:revision`, value: 0 }]);
  return { value, revision: 0, exists: true };
}

/** Fresh installs can still open workspaces whose server data predates the
 * canonical state snapshot. The legacy rows are projected into the same local
 * representation used by offline writes and all UI selectors. */
export async function hydrateLegacySnapshotGroup<T>(context: SnapshotRepositoryContext, legacy: LegacySnapshotGroup<T>, current: T) {
  if (!context.workspaceId || context.standalone || !navigator.onLine) return undefined;
  const values: Record<string, unknown> = {};
  let found = false;
  for (const key of legacy.keys) {
    const { data, error } = await withConnectionTimeout(supabase.from('app_state_snapshots').select('payload').eq('workspace_id', context.workspaceId).eq('domain', `${context.domain}:${key}`).maybeSingle());
    if (error) throw error;
    const row = data as unknown as { payload?: unknown } | null;
    if (row?.payload !== undefined) { values[key] = row.payload; found = true; }
  }
  if (!found) return undefined;
  const migrated = legacy.combine(values);
  const value = legacy.merge ? legacy.merge(current, migrated) : migrated;
  await offlineStore.writeAtomic([{ key: context.storageKey, value }, { key: `${context.storageKey}:revision`, value: 0 }]);
  return value;
}

export async function persistSnapshot<T>(context: SnapshotRepositoryContext, value: T, revision: number): Promise<PersistenceState> {
  return withSnapshotStorageLock(context.storageKey, async () => {
    // The background sync worker records the server revision directly in the
    // durable store. The React hook can still hold the revision from its last
    // render, so always use the newest durable revision before creating a
    // mutation. This prevents a rapid edit immediately after a successful
    // sync from being queued against an already-obsolete base revision.
    const durableRevision = effectiveSnapshotRevision(await offlineStore.read<number>(`${context.storageKey}:revision`), revision);
    const payload = context.workspaceId ? { workspace_id: context.workspaceId, domain: `${context.domain}:${context.key}`, payload: value, expected_revision: durableRevision } : null;
    // Allocate before the first request so an ambiguous timeout can be
    // retried through the outbox with the same server receipt identity.
    const mutationId = payload ? crypto.randomUUID() : null;
    if (context.standalone) await offlineStore.write(context.storageKey, value);
    else if (navigator.onLine) {
      if (!payload || !context.workspaceId) throw new Error('A workspace is required to save this record.');
      // Do not let a new online edit leapfrog an older offline edit for the
      // same snapshot. Reconnection must settle the queued version first.
      let queued = await getQueuedMutations();
      let relevant = queued.filter((mutation) => mutation.companyId === context.workspaceId && mutation.table === 'app_state_snapshots' && mutation.entityId === payload.domain);
      if (relevant.length > 0) {
        try { await syncQueue(context.workspaceId); } catch { /* the queue remains the source of truth */ }
        queued = await getQueuedMutations();
        relevant = queued.filter((mutation) => mutation.companyId === context.workspaceId && mutation.table === 'app_state_snapshots' && mutation.entityId === payload.domain);
        if (relevant.length > 0) {
          // A slow, conflicted, or leased earlier mutation must not make the
          // local repository read-only. Persist the new effective snapshot
          // and its stable outbox entry together; queue coalescing preserves
          // unresolved conflicts while replacing only retryable edits for the
          // same snapshot.
          if (!mutationId) throw new Error('A mutation identity is required to save this record.');
          const queueUserId = context.userId ?? context.storageKey.split(':')[0] ?? 'unknown';
          await saveOfflineFallback({
            mutationId, userId: queueUserId, companyId: context.workspaceId,
            entityType: 'app_state_snapshot', entityId: payload.domain, baseRevision: durableRevision,
            table: 'app_state_snapshots', operation: 'upsert', payload: { ...payload, mutation_id: mutationId },
          }, [{ key: context.storageKey, value }]);
          reportPersistenceNotice({ app: context.domain, state: 'sync pending' });
          diagnostic('local-write-queued', { app: context.domain, workspaceId: context.workspaceId, operation: 'snapshot', reason: 'earlier-mutation-unresolved' });
          return 'saved locally';
        }
      }
      try {
        diagnostic('online-save-attempt', { app: context.domain, workspaceId: context.workspaceId, operation: 'snapshot' });
        const { data, error } = await withConnectionTimeout(supabase.rpc('write_app_state_snapshot', {
          target_workspace: context.workspaceId,
          target_domain: payload.domain,
          expected_revision: durableRevision,
          target_payload: value,
          audit_action: 'snapshot_written_online',
          affected_client_ids: [],
          mutation_id: mutationId,
        }));
        const result = (data as Array<{ status: string; revision: number; payload: unknown }> | null)?.[0];
        if (error) throw error;
        if (!result || result.status === 'conflict') {
          reportPersistenceNotice({ app: context.domain, state: 'sync conflict' });
          throw new Error('The online data changed before this save. Refresh and review the latest data.');
        }
        try {
          await offlineStore.writeAtomic([{ key: context.storageKey, value }, { key: `${context.storageKey}:revision`, value: result.revision }]);
        } catch (cacheError) {
          // Supabase already accepted this mutation. Never route a cache-only
          // failure through the offline queue, which could replay the write.
          await recordCacheRepair(context.userId ?? context.storageKey.split(':')[0] ?? 'unknown', context.workspaceId, payload.domain);
          throw cacheError;
        }
        diagnostic('online-save-success', { app: context.domain, workspaceId: context.workspaceId, operation: 'snapshot' });
      } catch (error) {
        if (!isConnectivityFailure(error)) throw error;
        if (!mutationId) throw new Error('A mutation identity is required to save this record.');
        const queueUserId = context.userId ?? context.storageKey.split(':')[0] ?? 'unknown';
        await saveOfflineFallback({
          mutationId, userId: queueUserId, companyId: context.workspaceId,
          entityType: 'app_state_snapshot', entityId: payload.domain, baseRevision: durableRevision,
          table: 'app_state_snapshots', operation: 'upsert', payload: { ...payload, mutation_id: mutationId },
        }, [{ key: context.storageKey, value }]);
        reportPersistenceNotice({ app: context.domain, state: 'offline saved' });
        diagnostic('offline-fallback', { app: context.domain, workspaceId: context.workspaceId, operation: 'snapshot' });
        emitSyncStatus('offline');
        return 'offline saved';
      }
    }
    else {
      if (!payload || !context.workspaceId) throw new Error('A workspace is required to save this record.');
      if (!mutationId) throw new Error('A mutation identity is required to save this record.');
      // Keep the queue's user identity aligned with the snapshot storage key
      // even during the short auth/workspace transition at app startup.
      // Otherwise the sync worker could write the acknowledged payload to an
      // `unknown:` key while the UI reads the real user-scoped key.
      const queueUserId = context.userId ?? context.storageKey.split(':')[0] ?? 'unknown';
      await saveOfflineFallback({
        mutationId, userId: queueUserId, companyId: context.workspaceId,
        entityType: 'app_state_snapshot', entityId: payload.domain, baseRevision: durableRevision,
        table: 'app_state_snapshots', operation: 'upsert', payload: { ...payload, mutation_id: mutationId },
      }, [{ key: context.storageKey, value }]);
    }
    if (context.standalone) {
      reportPersistenceNotice({ app: context.domain, state: 'offline saved' });
      return 'offline saved';
    }
    if (!context.workspaceId) throw new Error('A workspace is required to save this record.');
    const persistence: PersistenceState = navigator.onLine ? 'saved' : 'offline saved';
    reportPersistenceNotice({ app: context.domain, state: persistence });
    // A direct online save is already complete. Only offline saves need a
    // queue/status event and a later synchronization pass.
    if (!navigator.onLine) emitSyncStatus('offline');
    return persistence;
  });
}

export async function hydrateSnapshot<T>(context: SnapshotRepositoryContext, revision: number) {
  if (!context.workspaceId || context.standalone || !navigator.onLine) return { value: undefined as T | undefined, revision, found: false };
  return withSnapshotStorageLock(context.storageKey, async () => {
    // Online mode is cloud-first, but only after queued offline changes have
    // had a chance to reach the server. This prevents a cloud read racing the
    // queue and briefly/ permanently replacing an offline snapshot.
    let queued = await getQueuedMutations();
    let relevant = queued.filter((mutation) => mutation.companyId === context.workspaceId && mutation.table === 'app_state_snapshots' && mutation.entityId === `${context.domain}:${context.key}`);
    if (relevant.length > 0) {
      reportPersistenceNotice({ app: context.domain, state: relevant.some((mutation) => mutation.syncStatus === 'conflicted' || mutation.syncStatus === 'error') ? 'sync conflict' : 'sync pending' });
      try { await syncQueue(context.workspaceId); } catch { /* local data remains the safe source */ }
      queued = await getQueuedMutations();
      relevant = queued.filter((mutation) => mutation.companyId === context.workspaceId && mutation.table === 'app_state_snapshots' && mutation.entityId === `${context.domain}:${context.key}`);
      if (relevant.length > 0) return { value: undefined as T | undefined, revision: (await offlineStore.read<number>(`${context.storageKey}:revision`)) ?? revision, found: true };
    }
    const currentLocalRevision = (await offlineStore.read<number>(`${context.storageKey}:revision`)) ?? revision;
    diagnostic('supabase-fetch-start', { app: context.domain, workspaceId: context.workspaceId, entity: context.key });
    const { data, error } = await withConnectionTimeout(supabase.from('app_state_snapshots').select('payload, revision').eq('workspace_id', context.workspaceId).eq('domain', `${context.domain}:${context.key}`).maybeSingle());
    if (error) {
      diagnostic('supabase-fetch-error', { app: context.domain, workspaceId: context.workspaceId, entity: context.key, code: error.code ?? 'unknown' });
      throw error;
    }
    const remote = data as unknown as { payload?: T; revision?: number } | null;
    diagnostic('supabase-fetch-success', { app: context.domain, workspaceId: context.workspaceId, entity: context.key, empty: remote === null });
    if (remote?.revision === undefined || !shouldApplyRemoteSnapshot(remote.revision, currentLocalRevision, false)) return { value: undefined as T | undefined, revision: currentLocalRevision, found: remote !== null };
    await offlineStore.write(`${context.storageKey}:revision`, remote.revision);
    if (remote.payload === undefined) return { value: undefined as T | undefined, revision: remote.revision, found: true };
    await offlineStore.write(context.storageKey, remote.payload);
    return { value: remote.payload, revision: remote.revision, found: true };
  });
}
