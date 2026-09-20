export type RecoverableQueuedMutation = {
  formatVersion?: number;
  localSequence?: number;
  id?: string;
  mutationId?: string;
  userId?: string;
  companyId?: string;
  entityId?: string;
  table?: string;
  updatedAt?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
};

type QueueMetadata = { formatVersion?: number; queueGeneration?: number; nextLocalSequence?: number };

const mutationIdentity = (mutation: RecoverableQueuedMutation) => String(mutation.mutationId ?? mutation.id ?? '');

function effectiveKey(mutation: RecoverableQueuedMutation) {
  const userId = String(mutation.userId ?? '');
  const companyId = String(mutation.companyId ?? mutation.payload?.workspace_id ?? '');
  if (!userId || !companyId) return null;
  if (mutation.table === 'app_state_snapshots') {
    const domain = String(mutation.payload?.domain ?? mutation.entityId ?? '');
    return domain ? `${userId}:${companyId}:${domain}` : null;
  }
  return String(mutation.table ?? '').startsWith('truck') ? `truck:${userId}:${companyId}` : null;
}

/** Build a non-destructive repair for APKs that accidentally routed a valid
 * outbox to IndexedDB after SQLite had already been selected. Existing native
 * mutations remain unless the legacy copy has the same ID and a newer stamp. */
export function planSplitStoreRecovery(
  nativeQueue: RecoverableQueuedMutation[],
  legacyQueue: RecoverableQueuedMutation[],
  legacyRecords: Map<string, unknown>,
  nativeMetadata: QueueMetadata | null = null,
) {
  if (!legacyQueue.length) return { entries: [] as Array<{ key: string; value: unknown }>, recoveredMutationCount: 0 };
  const merged = [...nativeQueue];
  const indexes = new Map(merged.map((mutation, index) => [mutationIdentity(mutation), index]));
  for (const mutation of legacyQueue) {
    const id = mutationIdentity(mutation);
    if (!id) continue;
    const index = indexes.get(id);
    if (index === undefined) {
      indexes.set(id, merged.length);
      merged.push(mutation);
    } else if (String(mutation.updatedAt ?? '') > String(merged[index].updatedAt ?? '')) {
      merged[index] = mutation;
    }
  }
  const largestExistingSequence = merged.reduce((largest, mutation) => Math.max(largest, Number(mutation.localSequence) || 0), 0);
  let nextLocalSequence = Math.max(
    largestExistingSequence + 1,
    Number.isSafeInteger(nativeMetadata?.nextLocalSequence) && Number(nativeMetadata?.nextLocalSequence) > 0
      ? Number(nativeMetadata?.nextLocalSequence)
      : 1,
  );
  const normalizedQueue = merged.map((mutation) => {
    const localSequence = Number.isSafeInteger(mutation.localSequence) && Number(mutation.localSequence) > 0
      ? Number(mutation.localSequence)
      : nextLocalSequence++;
    nextLocalSequence = Math.max(nextLocalSequence, localSequence + 1);
    return { ...mutation, formatVersion: 2, localSequence };
  });
  const metadata = {
    formatVersion: 2,
    queueGeneration: (Number.isSafeInteger(nativeMetadata?.queueGeneration) && Number(nativeMetadata?.queueGeneration) >= 0 ? Number(nativeMetadata?.queueGeneration) : 0) + 1,
    nextLocalSequence,
  };
  const entries: Array<{ key: string; value: unknown }> = [
    { key: 'sync-queue-v1', value: normalizedQueue },
    { key: 'sync-queue-meta-v2', value: metadata },
  ];
  const copied = new Set<string>();
  for (const mutation of legacyQueue) {
    const key = effectiveKey(mutation);
    if (!key || copied.has(key) || !legacyRecords.has(key)) continue;
    entries.push({ key, value: legacyRecords.get(key) });
    copied.add(key);
  }
  return { entries, recoveredMutationCount: legacyQueue.length };
}
