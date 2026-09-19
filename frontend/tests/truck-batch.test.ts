import assert from 'node:assert/strict';
import { validateTruckBatchResponse } from '../src/lib/truckBatch';

const request = [
  { id: 'row-1', mutation_id: 'mutation-1' },
  { id: 'row-2', mutation_id: 'mutation-2' },
];

const valid = validateTruckBatchResponse('batch-1', request, {
  status: 'written',
  batch_id: 'batch-1',
  rows: [
    { id: 'row-2', last_mutation_id: 'mutation-2' },
    { id: 'row-1', last_mutation_id: 'mutation-1' },
  ],
});
assert.deepEqual(valid.map((row) => row.id), ['row-2', 'row-1']);

assert.throws(
  () => validateTruckBatchResponse('batch-1', request, {
    status: 'already_applied',
    batch_id: 'batch-1',
    rows: [{ id: 'row-1', last_mutation_id: 'mutation-1' }],
  }),
  /row count/i,
  'a partial receipt must not settle a complete batch',
);

assert.throws(
  () => validateTruckBatchResponse('batch-1', request, {
    status: 'written',
    batch_id: 'batch-other',
    rows: request.map((row) => ({ id: row.id, last_mutation_id: row.mutation_id })),
  }),
  /batch identity/i,
  'a response for another batch must not settle this batch',
);

assert.throws(
  () => validateTruckBatchResponse('batch-1', request, {
    status: 'written',
    batch_id: 'batch-1',
    rows: [
      { id: 'row-1', last_mutation_id: 'mutation-1' },
      { id: 'row-2', last_mutation_id: 'different-mutation' },
    ],
  }),
  /mutation identity/i,
  'a row acknowledged under another mutation identity must not settle the batch',
);

console.log('Truck batch response validation tests passed.');
