import { offlineStore } from './localStore';
import { mergeQueuedMutation } from './queuePolicy';
import { emitSyncProgress } from './toast';

export interface QueuedMutation {
  id: string;
  mutationId: string;
  userId: string;
  companyId: string;
  entityType: string;
  entityId: string;
  baseRevision: number;
  table: string;
  operation: 'upsert' | 'delete';
  payload: Record<string, unknown>;
  queuedAt: string;
  syncStatus: 'pending' | 'retrying' | 'conflicted' | 'error';
  retryCount: number;
  lastError?: string;
}
const KEY = 'sync-queue-v1';
let queueTail: Promise<void> = Promise.resolve();

export type QueuedMutationInput = Partial<Pick<QueuedMutation, 'mutationId' | 'userId' | 'companyId' | 'entityType' | 'entityId' | 'baseRevision'>>
  & Omit<QueuedMutation, 'id' | 'mutationId' | 'userId' | 'companyId' | 'entityType' | 'entityId' | 'baseRevision' | 'queuedAt' | 'syncStatus' | 'retryCount'>;

function withQueueLock<T>(operation: () => Promise<T>) {
  const result = queueTail.then(operation, operation);
  queueTail = result.then(() => undefined, () => undefined);
  return result;
}

function queuedMutation(mutation: QueuedMutationInput): QueuedMutation {
  const mutationId = mutation.mutationId ?? crypto.randomUUID();
  const companyId = mutation.companyId ?? String(mutation.payload.workspace_id ?? '');
  const entityId = mutation.entityId ?? String(mutation.payload.id ?? mutation.payload.client_id ?? mutation.payload.domain ?? '');
  return { ...mutation, id: mutationId, mutationId, userId: mutation.userId ?? 'unknown', companyId, entityType: mutation.entityType ?? mutation.table, entityId, baseRevision: mutation.baseRevision ?? Number(mutation.payload.expected_revision ?? 0), queuedAt: new Date().toISOString(), syncStatus: 'pending', retryCount: 0 };
}

/** Persist local records and their mutations in one durable storage transaction. */
export async function enqueueMutationsAtomic(mutations: QueuedMutationInput[], records: Array<{ key: string; value: unknown }>) {
  return withQueueLock(async () => {
    const queue = (await offlineStore.read<QueuedMutation[]>(KEY)) ?? [];
    const nextQueue = mutations.reduce((current, mutation) => mergeQueuedMutation(current, queuedMutation(mutation)), queue);
    await offlineStore.writeAtomic([...records, { key: KEY, value: nextQueue }]);
    // Keep Settings' pending/error counters current even when the device is
    // offline and no sync worker will emit a later progress event. This is a
    // progress event, not a toast; AppToast only reacts to attention states.
    const workspaceIds = [...new Set(mutations.map((mutation) => mutation.companyId ?? String(mutation.payload.workspace_id ?? '')).filter(Boolean))];
    for (const workspaceId of workspaceIds) {
      const relevant = nextQueue.filter((item) => item.companyId === workspaceId || String(item.payload.workspace_id ?? '') === workspaceId);
      emitSyncProgress({
        workspaceId,
        total: relevant.length,
        completed: 0,
        pending: relevant.length,
        errors: relevant.filter((item) => item.syncStatus === 'error' || item.syncStatus === 'conflicted').length,
        status: typeof navigator !== 'undefined' && navigator.onLine ? 'syncing' : 'offline',
      });
    }
  });
}

export async function enqueueMutation(mutation: QueuedMutationInput) {
  return enqueueMutationsAtomic([mutation], []);
}

export async function getQueuedMutations() {
  await queueTail;
  const queue = (await offlineStore.read<QueuedMutation[]>(KEY)) ?? [];
  return queue.map((item) => ({
    ...item,
    mutationId: item.mutationId ?? item.id,
    userId: item.userId ?? 'unknown',
    companyId: item.companyId ?? String(item.payload.workspace_id ?? ''),
    entityType: item.entityType ?? item.table,
    entityId: item.entityId ?? String(item.payload.id ?? item.payload.domain ?? ''),
    baseRevision: item.baseRevision ?? Number(item.payload.expected_revision ?? 0),
    syncStatus: item.syncStatus ?? 'pending',
    retryCount: item.retryCount ?? 0,
  }));
}

export async function hasPendingMutationsForWorkspace(workspaceId: string, tables?: string[]) {
  const allowedTables = tables ? new Set(tables) : null;
  const queue = await getQueuedMutations();
  return queue.some((mutation) => {
    const companyId = mutation.companyId || String(mutation.payload.workspace_id ?? '');
    return companyId === workspaceId && (!allowedTables || allowedTables.has(mutation.table));
  });
}

export async function getWorkspaceMutationStatus(workspaceId: string, tables?: string[]) {
  const allowedTables = tables ? new Set(tables) : null;
  const queue = await getQueuedMutations();
  const relevant = queue.filter((mutation) => {
    const companyId = mutation.companyId || String(mutation.payload.workspace_id ?? '');
    return companyId === workspaceId && (!allowedTables || allowedTables.has(mutation.table));
  });
  if (relevant.some((mutation) => mutation.syncStatus === 'conflicted' || mutation.syncStatus === 'error')) return 'conflict' as const;
  return relevant.length ? 'pending' as const : null;
}

export async function replaceQueue(queue: QueuedMutation[], processedMutationIds: string[] = []) {
  return withQueueLock(async () => {
    const latest = (await offlineStore.read<QueuedMutation[]>(KEY)) ?? [];
    const processed = new Set(processedMutationIds);
    const additions = latest.filter((mutation) => !processed.has(mutation.mutationId ?? mutation.id));
    const merged = additions.reduce((current, mutation) => mergeQueuedMutation(current, mutation), queue);
    await offlineStore.write(KEY, merged);
  });
}
