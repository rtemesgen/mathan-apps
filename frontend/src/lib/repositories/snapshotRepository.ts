import { offlineStore } from '../localStore';
import { supabase } from '../supabase';
import { enqueueMutationsAtomic, getQueuedMutations } from '../syncQueue';
import { syncQueue } from '../offlineSync';
import { reportPersistenceNotice, type PersistenceState } from './types';
import { emitSyncStatus } from '../toast';

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
    const payload = context.workspaceId ? { workspace_id: context.workspaceId, domain: `${context.domain}:${context.key}`, payload: value, expected_revision: revision } : null;
    if (context.standalone) await offlineStore.write(context.storageKey, value);
    else {
      if (!payload || !context.workspaceId) throw new Error('A workspace is required to save this record.');
      const mutationId = crypto.randomUUID();
      await enqueueMutationsAtomic([{
        mutationId, userId: context.userId ?? 'unknown', companyId: context.workspaceId,
        entityType: 'app_state_snapshot', entityId: payload.domain, baseRevision: revision,
        table: 'app_state_snapshots', operation: 'upsert', payload: { ...payload, mutation_id: mutationId },
      }], [{ key: context.storageKey, value }]);
    }
    if (context.standalone) {
      reportPersistenceNotice({ app: context.domain, state: 'offline saved' });
      return 'offline saved';
    }
    if (!context.workspaceId) throw new Error('A workspace is required to save this record.');
    const persistence: PersistenceState = navigator.onLine ? 'saved locally' : 'offline saved';
    reportPersistenceNotice({ app: context.domain, state: persistence });
    emitSyncStatus(navigator.onLine ? 'syncing' : 'offline');
    if (navigator.onLine) void syncQueue(context.workspaceId).catch(() => undefined);
    return persistence;
  });
}

export async function hydrateSnapshot<T>(context: SnapshotRepositoryContext, revision: number) {
  if (!context.workspaceId || context.standalone || !navigator.onLine) return { value: undefined as T | undefined, revision };
  return withSnapshotStorageLock(context.storageKey, async () => {
    // Hydration must never wait for a network flush. The local snapshot is
    // already available to the app, and sync can continue in the background.
    // Waiting here made app switching and reopening feel like a save was stuck
    // whenever another queued mutation was retrying.
    void syncQueue(context.workspaceId!).catch(() => undefined);
    const currentLocalRevision = (await offlineStore.read<number>(`${context.storageKey}:revision`)) ?? revision;
    const { data } = await supabase.from('app_state_snapshots').select('payload, revision').eq('workspace_id', context.workspaceId).eq('domain', `${context.domain}:${context.key}`).maybeSingle();
    const remote = data as unknown as { payload?: T; revision?: number } | null;
    const queued = await getQueuedMutations();
    const relevant = queued.filter((mutation) => mutation.companyId === context.workspaceId && mutation.table === 'app_state_snapshots' && mutation.entityId === `${context.domain}:${context.key}`);
    if (relevant.some((mutation) => mutation.syncStatus === 'conflicted' || mutation.syncStatus === 'error')) reportPersistenceNotice({ app: context.domain, state: 'sync conflict' });
    else if (relevant.length > 0) reportPersistenceNotice({ app: context.domain, state: 'sync pending' });
    if (remote?.revision === undefined || !shouldApplyRemoteSnapshot(remote.revision, currentLocalRevision, relevant.length > 0)) return { value: undefined as T | undefined, revision: currentLocalRevision };
    await offlineStore.write(`${context.storageKey}:revision`, remote.revision);
    if (remote.payload === undefined) return { value: undefined as T | undefined, revision: remote.revision };
    await offlineStore.write(context.storageKey, remote.payload);
    return { value: remote.payload, revision: remote.revision };
  });
}
