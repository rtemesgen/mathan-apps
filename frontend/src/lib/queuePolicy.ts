export type QueuePolicyEntry = {
  mutationId: string;
  table: string;
  companyId: string;
  entityId: string;
  syncStatus: 'pending' | 'retrying' | 'conflicted' | 'error';
};

function entityKey(entry: Pick<QueuePolicyEntry, 'table' | 'companyId' | 'entityId'>) {
  return `${entry.table}:${entry.companyId}:${entry.entityId}`;
}

/** Replace only unresolved edits for the same record; conflicts/errors remain visible. */
export function mergeQueuedMutation<T extends QueuePolicyEntry>(queue: T[], next: T) {
  const exact = queue.findIndex((entry) => entry.mutationId === next.mutationId);
  const coalescible = queue.findIndex((entry) => entityKey(entry) === entityKey(next) && (entry.syncStatus === 'pending' || entry.syncStatus === 'retrying'));
  const index = exact >= 0 ? exact : coalescible;
  if (index < 0) return [...queue, next];
  return queue.map((entry, entryIndex) => entryIndex === index ? next : entry);
}
