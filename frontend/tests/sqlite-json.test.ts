import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { isJsonSafe, isJsonSerializable, jsonHash, jsonValue } from '../src/lib/sqliteJson';

if (typeof globalThis.CryptoKey === 'undefined') {
  Object.defineProperty(globalThis, 'CryptoKey', { value: webcrypto.CryptoKey, configurable: true });
}

const key = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']);
assert.equal(isJsonSafe({ backupKey: key }), false, 'CryptoKey values must remain in IndexedDB');
assert.equal(isJsonSerializable({ backupKey: key }), false);
assert.equal(jsonValue({ backupKey: key }), null);
assert.equal(isJsonSerializable({ records: [{ id: 'one', amount: 12.5 }] }), true);
assert.equal(isJsonSerializable(new Map([['id', 'one']])), false);
assert.equal(isJsonSerializable({ amount: 1n }), false);

const cyclic: Record<string, unknown> = {};
cyclic.self = cyclic;
assert.equal(isJsonSerializable(cyclic), false);
assert.equal(await jsonHash({ id: 'one', amount: 12.5 }), await jsonHash({ id: 'one', amount: 12.5 }));

console.log('SQLite JSON safety tests passed.');
