import assert from 'node:assert/strict';
import { MAX_EMBEDDED_ATTACHMENT_BYTES, validateEmbeddedAttachmentSize } from '../src/lib/attachmentPolicy';

assert.equal(MAX_EMBEDDED_ATTACHMENT_BYTES, 5 * 1024 * 1024);
assert.equal(validateEmbeddedAttachmentSize(1), null);
assert.equal(validateEmbeddedAttachmentSize(MAX_EMBEDDED_ATTACHMENT_BYTES), null);
assert.match(validateEmbeddedAttachmentSize(MAX_EMBEDDED_ATTACHMENT_BYTES + 1) ?? '', /5MB/i);
assert.match(validateEmbeddedAttachmentSize(Number.POSITIVE_INFINITY) ?? '', /5MB/i);
console.log('Embedded attachment policy tests passed.');
