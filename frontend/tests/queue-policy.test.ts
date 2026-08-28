import assert from 'node:assert/strict';
import { mergeQueuedMutation, type QueuePolicyEntry } from '../src/lib/queuePolicy';
import { orderQueuedMutations } from '../src/lib/offlineSync';
import { isSyncEligible, queuedMutationCompanyId, recoverQueuedMutation, rebaseSnapshotMutation, scopeQueuedMutationForUser, type QueuedMutation } from '../src/lib/syncQueue';
import { cacheKeysSafeToClear } from '../src/lib/offlinePrefetch';

const entry = (mutationId: string, entityId: string, syncStatus: QueuePolicyEntry['syncStatus'] = 'pending', operation?: QueuePolicyEntry['operation']): QueuePolicyEntry => ({ mutationId, table: 'truck_transactions', companyId: 'workspace-a', entityId, syncStatus, operation });

const first = entry('one', 'transaction-a');
const replacement = entry('two', 'transaction-a');
const second = entry('three', 'transaction-b');
assert.deepEqual(mergeQueuedMutation([first], replacement), [replacement], 'unresolved edits for one entity should coalesce');
assert.deepEqual(mergeQueuedMutation([first], second), [first, second], 'different entities must remain separate');
assert.deepEqual(mergeQueuedMutation([entry('active', 'transaction-a', 'syncing')], replacement), [entry('active', 'transaction-a', 'syncing'), replacement], 'an in-flight mutation keeps its stable identity while a later edit queues behind it');
assert.deepEqual(mergeQueuedMutation([entry('uncertain', 'transaction-a', 'retrying')], replacement), [entry('uncertain', 'transaction-a', 'retrying'), replacement], 'a mutation with an uncertain server outcome is not replaced');
assert.deepEqual(mergeQueuedMutation([entry('conflict', 'transaction-a', 'conflicted')], replacement), [entry('conflict', 'transaction-a', 'conflicted'), replacement], 'conflicts must remain visible');
assert.deepEqual(mergeQueuedMutation([entry('create', 'transaction-a', 'pending', 'create')], entry('delete', 'transaction-a', 'pending', 'delete')), [], 'offline create followed by delete should cancel both operations');
assert.deepEqual(mergeQueuedMutation([first], entry('one', 'transaction-a', 'pending')), [entry('one', 'transaction-a', 'pending')], 'the same mutation id replaces its existing queue row');

const mutation = (table: string, entityType: string, queuedAt: string): QueuedMutation => ({ id: crypto.randomUUID(), mutationId: crypto.randomUUID(), userId: 'user-a', companyId: 'company-a', entityType, entityId: crypto.randomUUID(), baseRevision: 0, table, operation: 'upsert', payload: {}, queuedAt, updatedAt: queuedAt, baseServerUpdatedAt: null, lastAttemptAt: null, syncStartedAt: null, syncAttemptId: null, leaseExpiresAt: null, syncStatus: 'pending', retryCount: 0 });
const queuedSnapshot = mutation('app_state_snapshots', 'app_state_snapshot', '2026-01-01');
queuedSnapshot.entityId = 'cash_book:state';
queuedSnapshot.payload = { workspace_id: 'company-a', domain: 'cash_book:state', payload: { transactions: [{ id: 'tx-new' }] }, expected_revision: 4 };
queuedSnapshot.baseRevision = 4;
const rebasedSnapshot = rebaseSnapshotMutation(queuedSnapshot, 5);
assert.equal(rebasedSnapshot.baseRevision, 5, 'a newer queued snapshot must rebase onto the acknowledged revision');
assert.equal(rebasedSnapshot.payload.expected_revision, 5, 'the RPC payload must carry the acknowledged revision');
assert.deepEqual(rebasedSnapshot.payload.payload, queuedSnapshot.payload.payload, 'rebasing must preserve the newer local snapshot payload');

const ordered = orderQueuedMutations([
  mutation('truck_transactions', 'truck_transaction', '2026-01-03'),
  mutation('truck_owners', 'truck_owner', '2026-01-02'),
  mutation('trucks', 'truck', '2026-01-01'),
]);
assert.deepEqual(ordered.map((item) => item.table), ['trucks', 'truck_owners', 'truck_transactions'], 'parent Truck mutations synchronize before dependent transactions');
const syncing = mutation('trucks', 'truck', '2026-01-01');
syncing.syncStatus = 'syncing';
assert.equal(recoverQueuedMutation(syncing).syncStatus, 'pending', 'interrupted syncing mutations recover as pending after restart');
const leased = { ...syncing, leaseExpiresAt: '2026-01-01T00:02:00.000Z', syncStartedAt: '2026-01-01T00:00:00.000Z', syncAttemptId: 'worker:attempt' };
assert.equal(recoverQueuedMutation(leased, Date.parse('2026-01-01T00:01:00.000Z')).syncStatus, 'syncing', 'an active lease must not be stolen by another worker');
const recoveredLease = recoverQueuedMutation(leased, Date.parse('2026-01-01T00:03:00.000Z'));
assert.equal(recoveredLease.syncStatus, 'pending', 'an expired syncing lease must recover to pending');
assert.equal(recoveredLease.syncAttemptId, null, 'lease recovery clears the abandoned attempt identity');
assert.equal(isSyncEligible(leased, Date.parse('2026-01-01T00:01:00.000Z')), false, 'an active syncing lease is not eligible for duplicate processing');
assert.equal(isSyncEligible(leased, Date.parse('2026-01-01T00:03:00.000Z')), true, 'an expired syncing lease is eligible for retry');
assert.equal(isSyncEligible({ syncStatus: 'error' }), false, 'permanent errors require an explicit manual retry');
assert.equal(isSyncEligible({ syncStatus: 'conflicted' }), false, 'conflicts require review instead of automatic retry');
assert.equal(isSyncEligible({ syncStatus: 'retrying' }), true, 'transient failures remain eligible for retry');
assert.equal(queuedMutationCompanyId({ companyId: '', payload: { workspace_id: 'company-b' } }), 'company-b', 'legacy queue rows recover their company scope from payload');
const legacyScoped = { ...mutation('trucks', 'truck', '2026-01-01'), companyId: '', userId: 'unknown', payload: { workspace_id: 'company-b' } };
assert.equal(scopeQueuedMutationForUser(legacyScoped, 'user-b', new Set(['company-b'])).userId, 'user-b', 'legacy outbox identity is repaired only after its company membership is resolved');
assert.equal(scopeQueuedMutationForUser(legacyScoped, 'user-a', new Set(['company-a'])).userId, 'unknown', 'an outbox row is never assigned across company boundaries');
const cacheKeys = ['user-a:company-a:cash_book:books', 'user-a:company-a:payroll:employees', 'truck:user-a:company-a', 'user-a:company-b:cash_book:books'];
const truckPending = mutation('truck_transactions', 'truck_transaction', '2026-01-01');
assert.deepEqual(cacheKeysSafeToClear(cacheKeys, 'company-a', 'user-a', [truckPending]), ['user-a:company-a:cash_book:books', 'user-a:company-a:payroll:employees'], 'cache rebuild preserves the truck cache while company-A Truck edits are pending');
assert.deepEqual(cacheKeysSafeToClear(cacheKeys, 'company-a', 'user-a', []), cacheKeys.slice(0, 3), 'cache rebuild clears only the active user/company cache');

console.log('Queue policy tests passed.');
