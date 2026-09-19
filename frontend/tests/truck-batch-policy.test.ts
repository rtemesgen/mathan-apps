import assert from 'node:assert/strict';
import { validateQueuedTransactionBatch } from '../src/lib/truckBatchPolicy';

const member = (index: number, size = 2) => ({
  mutationId: `m-${index}`,
  companyId: 'workspace-a',
  table: 'truck_transactions',
  operation: 'create' as const,
  payload: { batch_id: 'batch-a', batch_index: index, batch_size: size, id: `row-${index}`, mutation_id: `m-${index}` },
});

const valid = validateQueuedTransactionBatch([member(1), member(0)]);
assert.equal(valid.ok, true);
if (valid.ok) assert.deepEqual(valid.members.map((item) => item.payload.batch_index), [0, 1]);

assert.equal(validateQueuedTransactionBatch([member(0), member(0)]).ok, false, 'duplicate indexes are rejected');
assert.equal(validateQueuedTransactionBatch([member(0, 3), member(1, 3)]).ok, false, 'missing batch members are rejected');
assert.equal(validateQueuedTransactionBatch([{ ...member(0), payload: { ...member(0).payload, batch_id: 'other' } }, member(1)]).ok, false, 'mixed batch identities are rejected');

console.log('Truck batch policy tests passed.');
