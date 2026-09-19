import assert from 'node:assert/strict';
import { offlineStore } from '../src/lib/localStore';
import { replaceConflictedMutationUnitAtomically, validateQueuedMutationScope, type QueuedMutation } from '../src/lib/syncQueue';

const mutation = (id: string, updatedAt = '2026-09-19T00:00:00.000Z'): QueuedMutation => ({
  id, mutationId: id, userId: 'user-a', companyId: 'workspace-a', entityType: 'truck_transaction', entityId: id,
  baseRevision: 0, table: 'truck_transactions', operation: 'create', payload: { id, batch_id: 'batch-a', batch_index: Number(id.slice(-1)), batch_size: 2 },
  queuedAt: updatedAt, updatedAt, baseServerUpdatedAt: null, lastAttemptAt: '2026-09-19T00:01:00.000Z',
  syncStartedAt: null, syncAttemptId: null, leaseExpiresAt: null, syncStatus: 'conflicted', retryCount: 0,
});

let durableQueue: QueuedMutation[] = [mutation('m1'), mutation('m2'), { ...mutation('later'), mutationId: 'later', id: 'later', entityId: 'later', payload: { id: 'later' }, syncStatus: 'pending', lastAttemptAt: null }];
const originalRead = offlineStore.read;
const originalWriteAtomic = offlineStore.writeAtomic;
offlineStore.read = (async (key: string) => key === 'sync-queue-v1' ? durableQueue : null) as typeof offlineStore.read;
offlineStore.writeAtomic = (async (records: Array<{ key: string; value: unknown }>) => {
  for (const record of records) {
    if (record.key === 'sync-queue-v1') durableQueue = record.value as QueuedMutation[];
  }
}) as typeof offlineStore.writeAtomic;
try {
  assert.equal(validateQueuedMutationScope(mutation('scope-ok'), 'user-a'), true, 'a queued mutation may be reviewed only by its owning user');
  assert.equal(validateQueuedMutationScope(mutation('scope-unknown'), 'user-b'), false, 'a queued mutation from another user cannot be reviewed');
  assert.equal(validateQueuedMutationScope({ ...mutation('legacy'), userId: 'unknown' }, 'user-a'), false, 'legacy unscoped mutations cannot be guessed into an active session');

  const replaced = await replaceConflictedMutationUnitAtomically(
    ['m1', 'm2'],
    [
      { ...mutation('replacement-1'), id: 'replacement-1', mutationId: 'replacement-1', entityId: 'm1', syncStatus: 'pending', lastAttemptAt: null, payload: { id: 'm1', batch_id: 'batch-b', batch_index: 0, batch_size: 2 } },
      { ...mutation('replacement-2'), id: 'replacement-2', mutationId: 'replacement-2', entityId: 'm2', syncStatus: 'pending', lastAttemptAt: null, payload: { id: 'm2', batch_id: 'batch-b', batch_index: 1, batch_size: 2 } },
    ],
    [{ key: 'truck:confirmed:user-a:workspace-a', value: { transactions: [] } }],
    { m1: '2026-09-19T00:00:00.000Z', m2: '2026-09-19T00:00:00.000Z' },
  );
  assert.equal(replaced, true);
  assert.deepEqual(durableQueue.map((item) => item.mutationId), ['replacement-1', 'replacement-2', 'later'], 'a batch is replaced as one queue unit and later edits survive');
  assert.equal(await replaceConflictedMutationUnitAtomically(['replacement-1', 'm2'], [], [], { 'replacement-1': 'stale', m2: 'stale' }), false, 'a changed member prevents partial replacement');
} finally {
  offlineStore.read = originalRead;
  offlineStore.writeAtomic = originalWriteAtomic;
}

console.log('Conflict-resolution queue-unit tests passed.');
