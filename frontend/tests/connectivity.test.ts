import assert from 'node:assert/strict';
import * as connectivity from '../src/lib/connectivity';
import { isPermanentSyncError } from '../src/lib/offlineSync';

const { isConnectivityFailure, withConnectionTimeout } = connectivity;
assert.equal(typeof connectivity.canAttemptBackend, 'function', 'false-online Android sessions need a shared backend reachability circuit breaker');

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
connectivity.markBackendReachable();
assert.equal(connectivity.canAttemptBackend(true, 1_000), true);
connectivity.markBackendUnreachable(1_000, 5_000);
assert.equal(connectivity.canAttemptBackend(true, 5_999), false);
assert.equal(connectivity.canAttemptBackend(true, 6_000), true);
assert.equal(connectivity.canAttemptBackend(false, 6_000), false);
connectivity.markBackendReachable();
console.log('Connectivity classification and timeout tests passed.');
