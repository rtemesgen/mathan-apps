import { readOffline, writeOffline } from './localStore';

export interface QueuedMutation { id: string; table: string; operation: 'upsert' | 'delete'; payload: Record<string, unknown>; queuedAt: string; }
const KEY = 'sync-queue-v1';

export async function enqueueMutation(mutation: Omit<QueuedMutation, 'id' | 'queuedAt'>) {
  const queue = (await readOffline<QueuedMutation[]>(KEY)) ?? [];
  const fingerprint = `${mutation.table}:${String(mutation.payload.workspace_id ?? '')}:${String(mutation.payload.domain ?? '')}`;
  const next = { ...mutation, id: crypto.randomUUID(), queuedAt: new Date().toISOString() };
  const existing = queue.findIndex((item) => `${item.table}:${String(item.payload.workspace_id ?? '')}:${String(item.payload.domain ?? '')}` === fingerprint);
  if (existing >= 0) queue[existing] = next; else queue.push(next);
  await writeOffline(KEY, queue);
}

export async function getQueuedMutations() { return (await readOffline<QueuedMutation[]>(KEY)) ?? []; }
export async function replaceQueue(queue: QueuedMutation[]) { await writeOffline(KEY, queue); }
