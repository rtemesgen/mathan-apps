import { readOffline, writeOffline } from './localStore';

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

function withQueueLock<T>(operation: () => Promise<T>) {
  const result = queueTail.then(operation, operation);
  queueTail = result.then(() => undefined, () => undefined);
  return result;
}

export async function enqueueMutation(mutation: Partial<Pick<QueuedMutation, 'mutationId' | 'userId' | 'companyId' | 'entityType' | 'entityId' | 'baseRevision'>> & Omit<QueuedMutation, 'id' | 'mutationId' | 'userId' | 'companyId' | 'entityType' | 'entityId' | 'baseRevision' | 'queuedAt' | 'syncStatus' | 'retryCount'>) {
  return withQueueLock(async () => {
    const queue = (await readOffline<QueuedMutation[]>(KEY)) ?? [];
    const mutationId = mutation.mutationId ?? crypto.randomUUID();
    const companyId = mutation.companyId ?? String(mutation.payload.workspace_id ?? '');
    const entityId = mutation.entityId ?? String(mutation.payload.id ?? mutation.payload.client_id ?? mutation.payload.domain ?? '');
    const fingerprint = mutation.mutationId ? `mutation:${mutation.mutationId}` : `${mutation.table}:${companyId}:${entityId}`;
    const next: QueuedMutation = { ...mutation, id: mutationId, mutationId, userId: mutation.userId ?? 'unknown', companyId, entityType: mutation.entityType ?? mutation.table, entityId, baseRevision: mutation.baseRevision ?? Number(mutation.payload.expected_revision ?? 0), queuedAt: new Date().toISOString(), syncStatus: 'pending', retryCount: 0 };
    const existing = queue.findIndex((item) => (item.mutationId ? `mutation:${item.mutationId}` : `${item.table}:${item.companyId ?? String(item.payload.workspace_id ?? '')}:${item.entityId ?? String(item.payload.id ?? item.payload.domain ?? '')}`) === fingerprint);
    if (existing >= 0) queue[existing] = next; else queue.push(next);
    await writeOffline(KEY, queue);
  });
}

export async function getQueuedMutations() {
  await queueTail;
  const queue = (await readOffline<QueuedMutation[]>(KEY)) ?? [];
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

export async function replaceQueue(queue: QueuedMutation[]) { return withQueueLock(() => writeOffline(KEY, queue)); }
