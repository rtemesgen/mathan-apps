import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { decryptAdminBackup } from '../src/admin/adminBackup.ts';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

const encoder = new TextEncoder();
const bytesToBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

async function fixture(passphrase: string) {
  const unsigned = {
    format: 'mathan-system-backup', schema_version: '1', exported_at: '2026-08-16T00:00:00.000Z',
    users: [], workspaces: [{ id: '11111111-1111-1111-1111-111111111111', name: 'Test Company' }], attachments: [],
  };
  const checksum = Buffer.from(await webcrypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(unsigned)))).toString('hex');
  const archive = { ...unsigned, checksum };
  const salt = webcrypto.getRandomValues(new Uint8Array(16)); const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const material = await webcrypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 300000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const encrypted = new Uint8Array(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(archive))));
  return JSON.stringify({ format: 'mathan-encrypted-backup', version: '1', created_at: archive.exported_at, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 300000, salt: bytesToBase64(salt) }, cipher: { name: 'AES-GCM', iv: bytesToBase64(iv), data: bytesToBase64(encrypted) } });
}

const passphrase = 'correct horse battery staple';
const encrypted = await fixture(passphrase);
const restored = await decryptAdminBackup(encrypted, passphrase);
assert.equal(restored.workspaces[0].name, 'Test Company');
await assert.rejects(() => decryptAdminBackup(encrypted, 'incorrect recovery phrase'), /incorrect|damaged/i);

const damaged = JSON.parse(encrypted);
damaged.cipher.data = `${damaged.cipher.data.slice(0, -4)}AAAA`;
await assert.rejects(() => decryptAdminBackup(JSON.stringify(damaged), passphrase), /incorrect|damaged/i);

console.log('Admin backup encryption tests passed.');
