import assert from 'node:assert/strict';
import {
  createRecoveryBatch,
  createRecoveryDeleteBatch,
  parseRecoveryRecord,
  selectRecoveredValue,
  type RecoveryRecord,
} from '../src/lib/recoveryJournal';

const legacy = parseRecoveryRecord(JSON.stringify({ 'cash:state': { version: 1 } }));
assert.deepEqual(legacy['cash:state'], { value: { version: 1 }, commitId: 'legacy-v1' });

const existing: RecoveryRecord = {
  'other:state': { value: { keep: true }, commitId: 'old' },
};
const batch = createRecoveryBatch(existing, [
  { key: 'cash:state', value: { version: 2 } },
  { key: 'sync-queue-v1', value: [{ mutationId: 'm-1' }] },
], 'commit-2');
assert.equal(batch['cash:state'].commitId, 'commit-2');
assert.equal(batch['sync-queue-v1'].commitId, 'commit-2');
assert.deepEqual(batch['other:state'].value, { keep: true });

assert.deepEqual(
  selectRecoveredValue(batch['cash:state'], undefined, { version: 1 }, undefined),
  { version: 2 },
  'an uncommitted journal wins over an older primary value',
);
assert.deepEqual(
  selectRecoveredValue(batch['cash:state'], { commitId: 'commit-2' }, { version: 2 }, undefined),
  { version: 2 },
  'a matching receipt selects the committed primary value',
);
assert.deepEqual(
  selectRecoveredValue(batch['cash:state'], { commitId: 'commit-2' }, undefined, undefined),
  null,
  'a committed receipt with a missing primary does not resurrect the journal',
);
assert.deepEqual(
  selectRecoveredValue(undefined, undefined, undefined, { version: 0 }),
  { version: 0 },
  'legacy fallback remains available when no recovery journal exists',
);
const deletion = createRecoveryDeleteBatch(batch, ['cash:state'], 'delete-1');
assert.equal(deletion['cash:state'].deleted, true);
assert.equal(selectRecoveredValue(deletion['cash:state'], undefined, { version: 2 }, undefined), null, 'an uncommitted delete tombstone prevents resurrection');
assert.equal(selectRecoveredValue(undefined, { commitId: 'delete-1', deleted: true }, { version: 2 }, { version: 1 }), null, 'a committed delete receipt suppresses stale fallback data');

console.log('Local-store recovery journal tests passed.');
