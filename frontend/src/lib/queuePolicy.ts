export type QueuePolicyEntry = {
  mutationId: string;
  table: string;
  companyId: string;
  entityId: string;
  syncStatus: 'pending' | 'syncing' | 'retrying' | 'conflicted' | 'error' | 'completed';
  operation?: 'create' | 'update' | 'upsert' | 'delete';
  lastAttemptAt?: string | null;
  retryCount?: number;
  syncStartedAt?: string | null;
  syncAttemptId?: string | null;
};

function entityKey(entry: Pick<QueuePolicyEntry, 'table' | 'companyId' | 'entityId'>) {
  return `${entry.table}:${entry.companyId}:${entry.entityId}`;
}

/** Replace only unresolved edits for the same record; conflicts/errors remain visible. */
export function mergeQueuedMutation<T extends QueuePolicyEntry>(queue: T[], next: T) {
  const exact = queue.findIndex((entry) => entry.mutationId === next.mutationId);
  // Once a network attempt starts, its mutation ID must remain durable: the
  // server may have accepted it even if the client has not received the
  // response. Coalesce only never-attempted pending edits. Later edits queue
  // behind syncing/retrying work and are rebased after acknowledgement.
  const neverAttempted = (entry: QueuePolicyEntry) => entry.syncStatus === 'pending'
    && !entry.lastAttemptAt
    && !(entry.retryCount && entry.retryCount > 0)
    && !entry.syncStartedAt
    && !entry.syncAttemptId;
  const coalescible = neverAttempted(next)
    ? queue.findIndex((entry) => entityKey(entry) === entityKey(next) && neverAttempted(entry))
    : -1;
  // An entity created and deleted before its first sync never needs to reach
  // Supabase. Removing both queue entries avoids a guaranteed missing-row
  // failure and preserves the user's intended final state.
  if (next.operation === 'delete' && coalescible >= 0 && queue[coalescible].operation === 'create') {
    return queue.filter((_, entryIndex) => entryIndex !== coalescible);
  }
  const index = exact >= 0 ? exact : coalescible;
  if (index < 0) return [...queue, next];
  const previous = queue[index];
  if (index === coalescible && previous.operation === 'create' && next.operation !== 'delete') {
    const merged = { ...previous, ...next, operation: 'create' } as T;
    if ('baseServerUpdatedAt' in previous || 'baseServerUpdatedAt' in next) {
      (merged as T & { baseServerUpdatedAt?: string | null }).baseServerUpdatedAt = null;
    }
    return queue.map((entry, entryIndex) => entryIndex === index ? merged : entry);
  }
  return queue.map((entry, entryIndex) => entryIndex === index ? next : entry);
}
