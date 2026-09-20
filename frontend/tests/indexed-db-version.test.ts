import assert from 'node:assert/strict';
import { safeIndexedDbVersion } from '../src/lib/indexedDbVersion';

assert.equal(safeIndexedDbVersion(0, 2, false), 2);
assert.equal(safeIndexedDbVersion(2, 2, false), 2);
assert.equal(safeIndexedDbVersion(3, 2, false), 3, 'an existing newer database must never be downgraded');
assert.equal(safeIndexedDbVersion(3, 2, true), 4, 'a newer database missing required stores must be upgraded again');
console.log('IndexedDB version compatibility tests passed.');
