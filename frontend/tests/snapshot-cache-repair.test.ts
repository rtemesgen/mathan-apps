import assert from 'node:assert/strict';
import { offlineStore } from '../src/lib/localStore';
import { SYNC_QUEUE_KEY, type QueuedMutation } from '../src/lib/syncQueue';
import { supabase } from '../src/lib/supabase';
import { persistSnapshot } from '../src/lib/repositories/snapshotRepository';

Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
const durable = new Map<string, unknown>([
  ['user-a:workspace-a:cash_book:state:revision', 1],
  ['user-a:workspace-a:cash_book:state:confirmed', { transactions: [{ id: 'old' }] }],
]);
const originalRead = offlineStore.read;
const originalWriteAtomic = offlineStore.writeAtomic;
const originalWriteMetadata = offlineStore.writeMetadata;
const originalRpc = supabase.rpc;
let failNextAtomicWrite = true;
let acceptedMutationId = '';
offlineStore.read = (async <T>(key: string) => (durable.get(key) as T | undefined) ?? null) as typeof offlineStore.read;
offlineStore.writeAtomic = (async (records: Array<{ key: string; value: unknown }>) => {
  if (failNextAtomicWrite) { failNextAtomicWrite = false; throw new Error('simulated cache commit failure'); }
  records.forEach(({ key, value }) => durable.set(key, value));
}) as typeof offlineStore.writeAtomic;
offlineStore.writeMetadata = (async () => undefined) as typeof offlineStore.writeMetadata;
supabase.rpc = (async (_name: string, params: { mutation_id: string }) => {
  acceptedMutationId = params.mutation_id;
  return { data: [{ status: 'written', revision: 2, payload: { transactions: [{ id: 'new' }] } }], error: null };
}) as unknown as typeof supabase.rpc;
try {
  await assert.rejects(persistSnapshot({ storageKey: 'user-a:workspace-a:cash_book:state', workspaceId: 'workspace-a', userId: 'user-a', standalone: false, domain: 'cash_book', key: 'state' }, { transactions: [{ id: 'new' }] }, 1), /simulated cache commit failure/);
  const queue = durable.get(SYNC_QUEUE_KEY) as QueuedMutation[];
  assert.equal(queue.length, 1, 'an accepted server mutation must remain retryable after local cache failure');
  assert.equal(queue[0].mutationId, acceptedMutationId, 'retry must preserve the server receipt identity');
  assert.deepEqual((durable.get('user-a:workspace-a:cash_book:state') as { transactions: Array<{ id: string }> }).transactions, [{ id: 'new' }]);
} finally {
  offlineStore.read = originalRead;
  offlineStore.writeAtomic = originalWriteAtomic;
  offlineStore.writeMetadata = originalWriteMetadata;
  supabase.rpc = originalRpc;
}

console.log('Snapshot cache-repair receipt test passed.');
