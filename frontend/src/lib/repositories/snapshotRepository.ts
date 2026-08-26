import { offlineStore } from '../localStore';
import { supabase } from '../supabase';
import { enqueueMutationsAtomic, getQueuedMutations } from '../syncQueue';
import { syncQueue } from '../offlineSync';
import { reportPersistenceNotice, type PersistenceState } from './types';
import { emitSyncStatus } from '../toast';
import { isConnectivityFailure, withConnectionTimeout } from '../connectivity';
import { diagnostic } from '../diagnostics';

export type SnapshotRepositoryContext = {
  storageKey: string;
  workspaceId?: string;
  userId?: string;
  standalone: boolean;
  domain: 'cash_book' | 'payroll';
  key: string;
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
  return { value: value ?? initialValue, revision };
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
          reportPersistenceNotice({ app: context.domain, state: relevant.some((mutation) => mutation.syncStatus === 'conflicted' || mutation.syncStatus === 'error') ? 'sync conflict' : 'sync pending' });
          throw new Error('An earlier offline change is still syncing. Your new entry was kept in the form for retry.');
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
          mutation_id: null,
        }));
        const result = (data as Array<{ status: string; revision: number; payload: unknown }> | null)?.[0];
        if (error) throw error;
        if (!result || result.status === 'conflict') {
          reportPersistenceNotice({ app: context.domain, state: 'sync conflict' });
          throw new Error('The online data changed before this save. Refresh and review the latest data.');
        }
        await offlineStore.writeAtomic([{ key: context.storageKey, value }, { key: `${context.storageKey}:revision`, value: result.revision }]);
        diagnostic('online-save-success', { app: context.domain, workspaceId: context.workspaceId, operation: 'snapshot' });
      } catch (error) {
        if (!isConnectivityFailure(error)) throw error;
        const mutationId = crypto.randomUUID();
        const queueUserId = context.userId ?? context.storageKey.split(':')[0] ?? 'unknown';
        await enqueueMutationsAtomic([{
          mutationId, userId: queueUserId, companyId: context.workspaceId,
          entityType: 'app_state_snapshot', entityId: payload.domain, baseRevision: durableRevision,
          table: 'app_state_snapshots', operation: 'upsert', payload: { ...payload, mutation_id: mutationId },
        }], [{ key: context.storageKey, value }]);
        reportPersistenceNotice({ app: context.domain, state: 'offline saved' });
        diagnostic('offline-fallback', { app: context.domain, workspaceId: context.workspaceId, operation: 'snapshot' });
        emitSyncStatus('offline');
        return 'offline saved';
      }
    }
    else {
      if (!payload || !context.workspaceId) throw new Error('A workspace is required to save this record.');
      const mutationId = crypto.randomUUID();
      // Keep the queue's user identity aligned with the snapshot storage key
      // even during the short auth/workspace transition at app startup.
      // Otherwise the sync worker could write the acknowledged payload to an
      // `unknown:` key while the UI reads the real user-scoped key.
      const queueUserId = context.userId ?? context.storageKey.split(':')[0] ?? 'unknown';
      await enqueueMutationsAtomic([{
        mutationId, userId: queueUserId, companyId: context.workspaceId,
        entityType: 'app_state_snapshot', entityId: payload.domain, baseRevision: durableRevision,
        table: 'app_state_snapshots', operation: 'upsert', payload: { ...payload, mutation_id: mutationId },
      }], [{ key: context.storageKey, value }]);
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
  if (!context.workspaceId || context.standalone || !navigator.onLine) return { value: undefined as T | undefined, revision };
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
      if (relevant.length > 0) return { value: undefined as T | undefined, revision: (await offlineStore.read<number>(`${context.storageKey}:revision`)) ?? revision };
    }
    const currentLocalRevision = (await offlineStore.read<number>(`${context.storageKey}:revision`)) ?? revision;
    const { data } = await withConnectionTimeout(supabase.from('app_state_snapshots').select('payload, revision').eq('workspace_id', context.workspaceId).eq('domain', `${context.domain}:${context.key}`).maybeSingle());
    const remote = data as unknown as { payload?: T; revision?: number } | null;
    if (remote?.revision === undefined || !shouldApplyRemoteSnapshot(remote.revision, currentLocalRevision, false)) return { value: undefined as T | undefined, revision: currentLocalRevision };
    await offlineStore.write(`${context.storageKey}:revision`, remote.revision);
    if (remote.payload === undefined) return { value: undefined as T | undefined, revision: remote.revision };
    await offlineStore.write(context.storageKey, remote.payload);
    return { value: remote.payload, revision: remote.revision };
  });
}
