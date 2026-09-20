/** Embedded data URLs are duplicated in snapshots, queues and recovery
 * records. Keep the input bounded until native capacity measurements justify
 * a separate attachment-file store. */
export const MAX_EMBEDDED_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export function validateEmbeddedAttachmentSize(bytes: number) {
  return Number.isFinite(bytes) && bytes >= 0 && bytes <= MAX_EMBEDDED_ATTACHMENT_BYTES
    ? null
    : 'File size exceeds 5MB limit.';
}
