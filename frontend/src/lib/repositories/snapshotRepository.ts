import { offlineStore } from '../localStore';
import { supabase } from '../supabase';
import { enqueueMutation, getQueuedMutations } from '../syncQueue';
import { syncQueue } from '../offlineSync';
import { reportPersistenceNotice, type PersistenceState } from './types';
import { persistBeforeQueue } from './mutationLifecycle';
import { emitSyncStatus } from '../toast';

export type SnapshotRepositoryContext = {
  storageKey: string;
  workspaceId?: string;
  userId?: string;
  standalone: boolean;
  domain: 'cash_book' | 'payroll';
  key: string;
};

const snapshotTails = new Map<string, Promise<void>>();

function withSnapshotLock<T>(storageKey: string, operation: () => Promise<T>) {
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
  return withSnapshotLock(context.storageKey, async () => {
    const payload = context.workspaceId ? { workspace_id: context.workspaceId, domain: `${context.domain}:${context.key}`, payload: value, expected_revision: revision } : null;
    await persistBeforeQueue(
      () => offlineStore.write(context.storageKey, value),
      async () => {
        if (context.standalone) return;
        if (!payload || !context.workspaceId) throw new Error('A workspace is required to save this record.');
        const mutationId = crypto.randomUUID();
        await enqueueMutation({ mutationId, userId: context.userId ?? 'unknown', companyId: context.workspaceId, entityType: 'app_state_snapshot', entityId: payload.domain, baseRevision: revision, table: 'app_state_snapshots', operation: 'upsert', payload: { ...payload, mutation_id: mutationId } });
      },
    );
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
  return withSnapshotLock(context.storageKey, async () => {
    await syncQueue(context.workspaceId!);
    const { data } = await supabase.from('app_state_snapshots').select('payload, revision').eq('workspace_id', context.workspaceId).eq('domain', `${context.domain}:${context.key}`).maybeSingle();
    const remote = data as unknown as { payload?: T; revision?: number } | null;
    const queued = await getQueuedMutations();
    const relevant = queued.filter((mutation) => mutation.companyId === context.workspaceId && mutation.table === 'app_state_snapshots' && mutation.entityId === `${context.domain}:${context.key}`);
    if (relevant.some((mutation) => mutation.syncStatus === 'conflicted' || mutation.syncStatus === 'error')) reportPersistenceNotice({ app: context.domain, state: 'sync conflict' });
    else if (relevant.length > 0) reportPersistenceNotice({ app: context.domain, state: 'sync pending' });
    if (relevant.length > 0 || remote?.revision === undefined || remote.revision <= revision) return { value: undefined as T | undefined, revision };
    await offlineStore.write(`${context.storageKey}:revision`, remote.revision);
    if (remote.payload === undefined) return { value: undefined as T | undefined, revision: remote.revision };
    await offlineStore.write(context.storageKey, remote.payload);
    return { value: remote.payload, revision: remote.revision };
  });
}
