import assert from 'node:assert/strict';
import { createUuid } from '../src/lib/uuid';

const uuid = createUuid({ getRandomValues: (bytes) => {
  bytes.fill(0);
  return bytes;
} });
assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

assert.equal(createUuid({ randomUUID: () => 'provided-uuid' }), 'provided-uuid');
console.log('UUID compatibility tests passed.');
