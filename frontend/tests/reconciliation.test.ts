import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const moduleUrl = new URL('../src/lib/reconciliation.ts', import.meta.url);
assert.equal(existsSync(fileURLToPath(moduleUrl)), true, 'the confirmed/effective reconciliation module must exist');

const { affectedEntityIds, deriveEntitySyncStatuses, replayRowMutations, threeWayMergeSnapshot } = await import(moduleUrl.href);

const base = {
  books: [{ id: 'book-a', name: 'Original' }],
  transactions: [{ id: 'tx-old', amount: 10 }],
};
const remote = {
  books: [{ id: 'book-a', name: 'Original' }, { id: 'book-remote', name: 'Remote book' }],
  transactions: [{ id: 'tx-old', amount: 10 }, { id: 'tx-remote', amount: 20 }],
};
const local = {
  books: [{ id: 'book-a', name: 'Offline rename' }, { id: 'book-local', name: 'Offline book' }],
  transactions: [{ id: 'tx-local', amount: 30 }],
};

const merged = threeWayMergeSnapshot(base, remote, local) as typeof local;
assert.deepEqual(new Set(merged.books.map((item) => item.id)), new Set(['book-a', 'book-remote', 'book-local']), 'unrelated remote and local records must coexist');
assert.equal(merged.books.find((item) => item.id === 'book-a')?.name, 'Offline rename', 'a local edit wins for the same entity');
assert.deepEqual(new Set(merged.transactions.map((item) => item.id)), new Set(['tx-remote', 'tx-local']), 'a local delete is replayed without deleting unrelated remote rows');
assert.deepEqual(new Set(affectedEntityIds(base, local)), new Set(['book-a', 'book-local', 'tx-old', 'tx-local']));

const replayed = replayRowMutations(
  [{ id: 'server', amount: 10 }, { id: 'deleted', amount: 5 }],
  [
    { entityId: 'local', operation: 'create', payload: { id: 'local', amount: 20 } },
    { entityId: 'server', operation: 'update', payload: { id: 'server', amount: 15 } },
    { entityId: 'deleted', operation: 'delete', payload: { id: 'deleted' } },
  ],
);
assert.deepEqual(replayed, [{ id: 'server', amount: 15 }, { id: 'local', amount: 20 }]);

const statuses = deriveEntitySyncStatuses([
  { mutationId: 'm1', table: 'truck_transactions', entityId: 'tx-1', syncStatus: 'pending', payload: {} },
  { mutationId: 'm2', table: 'truck_owners', entityId: 'owner-1', syncStatus: 'syncing', payload: {} },
  { mutationId: 'm3', table: 'app_state_snapshots', entityId: 'cash_book:state', syncStatus: 'conflicted', payload: { affected_client_ids: ['book-1', 'cash-1'] } },
]);
assert.equal(statuses.get('truck_transactions:tx-1')?.state, 'pending');
assert.equal(statuses.get('truck_owners:owner-1')?.state, 'sending');
assert.equal(statuses.get('app_state_snapshots:book-1')?.state, 'needs_attention');
assert.equal(statuses.get('app_state_snapshots:cash-1')?.state, 'needs_attention');

console.log('Confirmed/effective reconciliation tests passed.');
