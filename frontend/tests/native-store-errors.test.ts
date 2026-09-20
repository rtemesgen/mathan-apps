import assert from 'node:assert/strict';
import { NativeStoreError, isNativeStoreError } from '../src/lib/nativeStoreErrors';

const error = new NativeStoreError('RECORD_INVALID', 'Stored record is not valid JSON');
assert.equal(error.code, 'RECORD_INVALID');
assert.equal(error.message, 'Stored record is not valid JSON');
assert.equal(isNativeStoreError(error), true);
assert.equal(isNativeStoreError(new Error('other failure')), false);

console.log('Native store error tests passed.');
