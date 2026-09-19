import assert from 'node:assert/strict';
import { enqueueMutationsAtomic, SYNC_QUEUE_KEY, type QueuedMutation } from '../src/lib/syncQueue';
import { offlineStore } from '../src/lib/localStore';
import { supabase } from '../src/lib/supabase';
import { syncWorkspaceQueues } from '../src/lib/offlineSync';

Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
const storageKey = 'user-a:workspace-a:cash_book:state';
const oldMutation: QueuedMutation = {
  id: 'old-snapshot', mutationId: 'old-snapshot', userId: 'user-a', companyId: 'workspace-a', entityType: 'app_state_snapshot', entityId: 'cash_book:state',
  baseRevision: 1, table: 'app_state_snapshots', operation: 'upsert', payload: { workspace_id: 'workspace-a', domain: 'cash_book:state', payload: { transactions: [{ id: 'old' }] }, expected_revision: 1, affected_client_ids: ['old'] },
  queuedAt: '2026-09-19T00:00:00.000Z', updatedAt: '2026-09-19T00:00:00.000Z', baseServerUpdatedAt: null, lastAttemptAt: null, syncStartedAt: null, syncAttemptId: null, leaseExpiresAt: null, syncStatus: 'pending', retryCount: 0,
};
const durable = new Map<string, unknown>([[SYNC_QUEUE_KEY, [oldMutation]], [storageKey, { transactions: [{ id: 'old' }] }]]);
const originalRead = offlineStore.read;
const originalWrite = offlineStore.write;
const originalWriteAtomic = offlineStore.writeAtomic;
const originalWriteMetadata = offlineStore.writeMetadata;
const originalRpc = supabase.rpc;
let releaseRpc!: () => void;
let rpcStarted!: () => void;
const rpcReady = new Promise<void>((resolve) => { rpcStarted = resolve; });
const rpcRelease = new Promise<void>((resolve) => { releaseRpc = resolve; });
offlineStore.read = (async <T>(key: string) => (durable.get(key) as T | undefined) ?? null) as typeof offlineStore.read;
offlineStore.write = (async (key: string, value: unknown) => { durable.set(key, value); }) as typeof offlineStore.write;
offlineStore.writeAtomic = (async (records: Array<{ key: string; value: unknown }>) => { records.forEach(({ key, value }) => durable.set(key, value)); }) as typeof offlineStore.writeAtomic;
offlineStore.writeMetadata = (async () => undefined) as typeof offlineStore.writeMetadata;
let rpcCount = 0;
supabase.rpc = (async (_name: string, params: { target_payload: unknown }) => {
  rpcCount += 1;
  if (rpcCount === 1) { rpcStarted(); await rpcRelease; }
  return { data: [{ status: 'written', revision: 2, payload: params.target_payload }], error: null };
}) as unknown as typeof supabase.rpc;
try {
  const sync = syncWorkspaceQueues('workspace-a');
  await rpcReady;
  await enqueueMutationsAtomic([{
    mutationId: 'new-snapshot', userId: 'user-a', companyId: 'workspace-a', entityType: 'app_state_snapshot', entityId: 'cash_book:state', baseRevision: 1,
    table: 'app_state_snapshots', operation: 'upsert', payload: { workspace_id: 'workspace-a', domain: 'cash_book:state', payload: { transactions: [{ id: 'new' }] }, expected_revision: 1, affected_client_ids: ['new'] },
  }], [{ key: storageKey, value: { transactions: [{ id: 'new' }] } }]);
  releaseRpc();
  await sync;
  const queue = durable.get(SYNC_QUEUE_KEY) as QueuedMutation[];
  assert.deepEqual(queue.map((item) => item.mutationId), ['new-snapshot']);
  assert.equal(queue[0].payload.expected_revision, 2, 'the newer successor must rebase onto the older acknowledgement');
  assert.deepEqual(durable.get(storageKey), { transactions: [{ id: 'new' }] }, 'the delayed older acknowledgement must not hide the newer effective value');
} finally {
  offlineStore.read = originalRead;
  offlineStore.write = originalWrite;
  offlineStore.writeAtomic = originalWriteAtomic;
  offlineStore.writeMetadata = originalWriteMetadata;
  supabase.rpc = originalRpc;
}

console.log('Snapshot delayed-acknowledgement tests passed.');
