import assert from 'node:assert/strict';
import { DATABASE_VERSION, evaluateNativeDatabaseHealth, shouldBootstrapNativeSchema } from '../src/lib/sqliteStore';
import { NativeStoreError, isNativeStoreError } from '../src/lib/nativeStoreErrors';
import { createRetryableSingleFlight } from '../src/lib/retryableSingleFlight';

const empty = evaluateNativeDatabaseHealth({ actualVersion: 0, tables: {}, completedVersions: [] });
assert.equal(shouldBootstrapNativeSchema(empty), true, 'first install is the only bootstrap case');

const missingMarker = evaluateNativeDatabaseHealth({
  actualVersion: DATABASE_VERSION,
  tables: {
    records: ['key', 'value', 'updated_at'],
    metadata: ['key', 'value', 'updated_at'],
    schema_migrations: ['version', 'state', 'completed_at'],
  },
  completedVersions: [],
});
assert.equal(missingMarker.healthy, false, 'a current-version database without its completion marker is rejected');
assert.equal(shouldBootstrapNativeSchema(missingMarker), false, 'a damaged current-version database is never bootstrapped');

const missingTable = evaluateNativeDatabaseHealth({ actualVersion: DATABASE_VERSION, tables: { records: ['key', 'value', 'updated_at'] }, completedVersions: [DATABASE_VERSION] });
assert.equal(missingTable.healthy, false, 'a missing required table is rejected');
const future = evaluateNativeDatabaseHealth({ actualVersion: DATABASE_VERSION + 1, tables: {}, completedVersions: [] });
assert.equal(future.healthy, false, 'an unsupported future schema is rejected');

const keyError = new NativeStoreError('KEY_UNAVAILABLE', 'key unavailable');
assert.equal(isNativeStoreError(keyError), true);
assert.equal(keyError.code, 'KEY_UNAVAILABLE');

let attempts = 0;
const readyAfterRetry = createRetryableSingleFlight(async () => {
  attempts += 1;
  return attempts > 1;
}, (ready) => ready);
assert.equal(await readyAfterRetry(), false);
assert.equal(await readyAfterRetry(), true);
assert.equal(attempts, 2, 'retryable initialization must not latch false');

console.log('Native store lifecycle tests passed.');
