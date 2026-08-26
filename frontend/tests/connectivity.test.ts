import assert from 'node:assert/strict';
import { isConnectivityFailure, withConnectionTimeout } from '../src/lib/connectivity';
import { isPermanentSyncError } from '../src/lib/offlineSync';

assert.equal(isConnectivityFailure({ name: 'AbortError' }), true);
assert.equal(isConnectivityFailure({ code: 'PGRST001', message: 'database unavailable' }), true);
assert.equal(isConnectivityFailure({ status: 503, message: 'service unavailable' }), true);
assert.equal(isConnectivityFailure({ code: '42501', message: 'permission denied' }), false);
assert.equal(isConnectivityFailure({ code: '23503', message: 'invalid foreign key' }), false);
assert.equal(isPermanentSyncError({ code: '42501', message: 'permission denied' }), true);
assert.equal(isPermanentSyncError({ code: '23503', message: 'foreign key violation' }), true);
assert.equal(isPermanentSyncError({ code: 'PGRST001', message: 'database unavailable' }), false);
assert.equal(await withConnectionTimeout(Promise.resolve('ok'), 100), 'ok');
await assert.rejects(withConnectionTimeout(new Promise<string>(() => undefined), 5), /timed out/i);
console.log('Connectivity classification and timeout tests passed.');
