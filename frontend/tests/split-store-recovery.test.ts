import assert from 'node:assert/strict';
import { planSplitStoreRecovery } from '../src/lib/splitStoreRecovery';

const older = { mutationId: 'cash-1', id: 'cash-1', userId: 'user-a', companyId: 'workspace-a', entityId: 'cash_book:state', table: 'app_state_snapshots', updatedAt: '2026-08-29T10:00:00.000Z', payload: { domain: 'cash_book:state' } };
const newer = { ...older, updatedAt: '2026-08-29T11:00:00.000Z', retryCount: 2 };
const truck = { mutationId: 'truck-1', id: 'truck-1', userId: 'user-a', companyId: 'workspace-a', entityId: 'transaction-1', table: 'truck_transactions', updatedAt: '2026-08-29T11:01:00.000Z', payload: { id: 'transaction-1' } };
const cashState = { books: [], transactions: [{ id: 'cash-entry-1' }] };
const truckState = { trucks: [], owners: [], customers: [], transactions: [{ id: 'transaction-1' }] };

const plan = planSplitStoreRecovery(
  [older],
  [newer, truck],
  new Map<string, unknown>([
    ['user-a:workspace-a:cash_book:state', cashState],
    ['truck:user-a:workspace-a', truckState],
  ]),
);
assert.equal(plan.recoveredMutationCount, 2);
assert.deepEqual(plan.entries.find((entry) => entry.key === 'sync-queue-v1')?.value, [newer, truck]);
assert.deepEqual(plan.entries.find((entry) => entry.key === 'user-a:workspace-a:cash_book:state')?.value, cashState);
assert.deepEqual(plan.entries.find((entry) => entry.key === 'truck:user-a:workspace-a')?.value, truckState);

const noLegacyQueue = planSplitStoreRecovery([older], [], new Map());
assert.deepEqual(noLegacyQueue.entries, [], 'an empty legacy outbox must never overwrite a newer SQLite queue');

console.log('Split IndexedDB/SQLite recovery planning tests passed.');
