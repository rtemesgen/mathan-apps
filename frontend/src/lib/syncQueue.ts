import { readOffline, writeOffline } from './localStore';

export interface QueuedMutation { id: string; table: string; operation: 'upsert' | 'delete'; payload: Record<string, unknown>; queuedAt: string; }
const KEY = 'sync-queue-v1';

export async function enqueueMutation(mutation: Omit<QueuedMutation, 'id' | 'queuedAt'>) {
  const queue = (await readOffline<QueuedMutation[]>(KEY)) ?? [];
  queue.push({ ...mutation, id: crypto.randomUUID(), queuedAt: new Date().toISOString() });
  await writeOffline(KEY, queue);
}

export async function getQueuedMutations() { return (await readOffline<QueuedMutation[]>(KEY)) ?? []; }
export async function replaceQueue(queue: QueuedMutation[]) { await writeOffline(KEY, queue); }

