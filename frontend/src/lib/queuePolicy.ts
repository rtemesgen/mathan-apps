export type QueuePolicyEntry = {
  mutationId: string;
  table: string;
  companyId: string;
  entityId: string;
  syncStatus: 'pending' | 'syncing' | 'retrying' | 'conflicted' | 'error' | 'completed';
  operation?: 'create' | 'update' | 'upsert' | 'delete';
};

function entityKey(entry: Pick<QueuePolicyEntry, 'table' | 'companyId' | 'entityId'>) {
  return `${entry.table}:${entry.companyId}:${entry.entityId}`;
}

/** Replace only unresolved edits for the same record; conflicts/errors remain visible. */
export function mergeQueuedMutation<T extends QueuePolicyEntry>(queue: T[], next: T) {
  const exact = queue.findIndex((entry) => entry.mutationId === next.mutationId);
  const coalescible = queue.findIndex((entry) => entityKey(entry) === entityKey(next) && (entry.syncStatus === 'pending' || entry.syncStatus === 'syncing' || entry.syncStatus === 'retrying'));
  // An entity created and deleted before its first sync never needs to reach
  // Supabase. Removing both queue entries avoids a guaranteed missing-row
  // failure and preserves the user's intended final state.
  if (next.operation === 'delete' && coalescible >= 0 && queue[coalescible].operation === 'create') {
    return queue.filter((_, entryIndex) => entryIndex !== coalescible);
  }
  const index = exact >= 0 ? exact : coalescible;
  if (index < 0) return [...queue, next];
  return queue.map((entry, entryIndex) => entryIndex === index ? next : entry);
}
