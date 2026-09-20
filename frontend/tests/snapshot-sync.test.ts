import assert from 'node:assert/strict';
import { acknowledgeSnapshotMutation, enqueueMutationsAtomic, SYNC_QUEUE_KEY, type QueuedMutation } from '../src/lib/syncQueue';
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
const atomicWrites: Array<Array<{ key: string; value: unknown }>> = [];
let releaseRpc!: () => void;
let rpcStarted!: () => void;
const rpcReady = new Promise<void>((resolve) => { rpcStarted = resolve; });
const rpcRelease = new Promise<void>((resolve) => { releaseRpc = resolve; });
offlineStore.read = (async <T>(key: string) => (durable.get(key) as T | undefined) ?? null) as typeof offlineStore.read;
offlineStore.write = (async (key: string, value: unknown) => { durable.set(key, value); }) as typeof offlineStore.write;
offlineStore.writeAtomic = (async (records: Array<{ key: string; value: unknown }>) => { atomicWrites.push(records); records.forEach(({ key, value }) => durable.set(key, value)); }) as typeof offlineStore.writeAtomic;
offlineStore.writeMetadata = (async () => undefined) as typeof offlineStore.writeMetadata;
let rpcCount = 0;
supabase.rpc = (async (_name: string, params: { target_payload: unknown }) => {
  rpcCount += 1;
  if (rpcCount === 1) { rpcStarted(); await rpcRelease; }
  return { data: [{ status: rpcCount === 1 ? 'already_applied' : 'written', revision: 2, payload: params.target_payload }], error: null };
}) as unknown as typeof supabase.rpc;
try {
  const sync = syncWorkspaceQueues('workspace-a');
  await rpcReady;
  await enqueueMutationsAtomic([{
    mutationId: 'new-snapshot', userId: 'user-a', companyId: 'workspace-a', entityType: 'app_state_snapshot', entityId: 'cash_book:state', baseRevision: 1,
    table: 'app_state_snapshots', operation: 'upsert', payload: { workspace_id: 'workspace-a', domain: 'cash_book:state', base_payload: { transactions: [{ id: 'old' }] }, payload: { transactions: [{ id: 'new' }] }, expected_revision: 1, affected_client_ids: ['new'] },
  }], [{ key: storageKey, value: { transactions: [{ id: 'new' }] } }]);
  releaseRpc();
  await sync;
  const queue = durable.get(SYNC_QUEUE_KEY) as QueuedMutation[];
  assert.deepEqual(queue.map((item) => item.mutationId), ['new-snapshot']);
  assert.equal(queue[0].payload.expected_revision, 2, 'the newer successor must rebase onto the older acknowledgement');
  assert.deepEqual(durable.get(storageKey), { transactions: [{ id: 'new' }] }, 'the delayed older acknowledgement must not hide the newer effective value');
  assert.deepEqual(durable.get(`${storageKey}:confirmed`), { transactions: [{ id: 'old' }] }, 'already-applied receipts update the confirmed layer');
  assert.ok(atomicWrites.some((writes) => writes.some((write) => write.key === SYNC_QUEUE_KEY)
    && writes.some((write) => write.key === storageKey)), 'snapshot acknowledgement removes the mutation and updates cache layers in one atomic write');

  const acknowledgementTarget: QueuedMutation = {
    ...oldMutation,
    id: 'ack-target',
    mutationId: 'ack-target',
    localSequence: 10,
    payload: {
      workspace_id: 'workspace-a', domain: 'cash_book:state',
      payload: { transactions: [{ id: 'local', amount: 1 }] }, expected_revision: 1,
    },
  };
  const newerLocalSnapshot: QueuedMutation = {
    ...oldMutation,
    id: 'newer-local',
    mutationId: 'newer-local',
    localSequence: 11,
    payload: {
      workspace_id: 'workspace-a', domain: 'cash_book:state',
      base_payload: { transactions: [{ id: 'local', amount: 1 }] },
      payload: { transactions: [{ id: 'local', amount: 2 }] }, expected_revision: 1,
    },
  };
  const unrelatedSnapshot: QueuedMutation = {
    ...oldMutation,
    id: 'unrelated-payroll',
    mutationId: 'unrelated-payroll',
    entityId: 'payroll:state',
    localSequence: 12,
    payload: { workspace_id: 'workspace-a', domain: 'payroll:state', payload: { employees: [] }, expected_revision: 7 },
  };
  durable.set(SYNC_QUEUE_KEY, [acknowledgementTarget, newerLocalSnapshot, unrelatedSnapshot]);
  durable.set(`${storageKey}:confirmed`, { transactions: [{ id: 'local', amount: 1 }] });
  durable.set(`${storageKey}:confirmed:revision`, 1);
  await acknowledgeSnapshotMutation('ack-target', { transactions: [{ id: 'local', amount: 1 }, { id: 'remote', amount: 99 }] }, 2, {
    effectiveKey: storageKey,
    revisionKey: `${storageKey}:revision`,
    confirmedKey: `${storageKey}:confirmed`,
    confirmedRevisionKey: `${storageKey}:confirmed:revision`,
  });
  const rebasedQueue = durable.get(SYNC_QUEUE_KEY) as QueuedMutation[];
  const rebasedCash = rebasedQueue.find((item) => item.mutationId === 'newer-local');
  const untouchedPayroll = rebasedQueue.find((item) => item.mutationId === 'unrelated-payroll');
  assert.deepEqual((durable.get(storageKey) as { transactions: unknown[] }).transactions, [
    { id: 'local', amount: 2 }, { id: 'remote', amount: 99 },
  ], 'a successor must preserve remote records outside its local delta');
  assert.equal(rebasedCash?.payload.expected_revision, 2, 'only the acknowledged snapshot entity is rebased');
  assert.deepEqual(rebasedCash?.payload.payload, { transactions: [
    { id: 'local', amount: 2 }, { id: 'remote', amount: 99 },
  ] });
  assert.equal(untouchedPayroll?.payload.expected_revision, 7, 'an acknowledgement must not rebase another snapshot domain');
} finally {
  offlineStore.read = originalRead;
  offlineStore.write = originalWrite;
  offlineStore.writeAtomic = originalWriteAtomic;
  offlineStore.writeMetadata = originalWriteMetadata;
  supabase.rpc = originalRpc;
}

console.log('Snapshot delayed-acknowledgement tests passed.');
