export type EntitySyncState = 'pending' | 'sending' | 'needs_attention';

export type EntitySyncStatus = {
  table: string;
  entityId: string;
  mutationId: string;
  state: EntitySyncState;
};

type Identified = { id: string };
type RowMutation = {
  entityId: string;
  operation: 'create' | 'update' | 'upsert' | 'delete';
  payload: Record<string, unknown>;
};
type SyncMutation = {
  mutationId: string;
  table: string;
  entityId: string;
  syncStatus: string;
  payload: Record<string, unknown>;
};

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const identified = (value: unknown): value is Identified => !!value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string';

function mergeIdentifiedArray(base: Identified[], remote: Identified[], local: Identified[]) {
  const baseById = new Map(base.map((item) => [item.id, item]));
  const localById = new Map(local.map((item) => [item.id, item]));
  const locallyChanged = new Set([...new Set([...baseById.keys(), ...localById.keys()])]
    .filter((id) => !same(baseById.get(id), localById.get(id))));
  const result = remote.flatMap((item) => {
    if (!locallyChanged.has(item.id)) return [item];
    const localItem = localById.get(item.id);
    return localItem ? [localItem] : [];
  });
  const present = new Set(result.map((item) => item.id));
  for (const item of local) {
    if (locallyChanged.has(item.id) && !present.has(item.id)) {
      result.push(item);
      present.add(item.id);
    }
  }
  return result;
}

/** Merge a local snapshot delta onto a newer server snapshot. Collections of
 * UUID-backed entities are merged by ID; other values use local changes only
 * when they differ from the last confirmed baseline. */
export function threeWayMergeSnapshot<T>(base: T, remote: T, local: T): T {
  if (!base || !remote || !local || typeof base !== 'object' || typeof remote !== 'object' || typeof local !== 'object') {
    return (same(base, local) ? remote : local) as T;
  }
  const baseRecord = base as Record<string, unknown>;
  const remoteRecord = remote as Record<string, unknown>;
  const localRecord = local as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...remoteRecord };
  for (const key of new Set([...Object.keys(baseRecord), ...Object.keys(remoteRecord), ...Object.keys(localRecord)])) {
    const baseValue = baseRecord[key];
    const remoteValue = remoteRecord[key];
    const localValue = localRecord[key];
    if (Array.isArray(baseValue) && Array.isArray(remoteValue) && Array.isArray(localValue)
      && [...baseValue, ...remoteValue, ...localValue].every(identified)) {
      merged[key] = mergeIdentifiedArray(baseValue, remoteValue, localValue);
    } else if (!same(baseValue, localValue)) merged[key] = localValue;
  }
  return merged as T;
}

/** IDs touched between two snapshots, used to show record-level pending state. */
export function affectedEntityIds(base: unknown, next: unknown) {
  if (!base || !next || typeof base !== 'object' || typeof next !== 'object') return [];
  const before = base as Record<string, unknown>;
  const after = next as Record<string, unknown>;
  const affected = new Set<string>();
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const left = before[key];
    const right = after[key];
    if (!Array.isArray(left) || !Array.isArray(right) || ![...left, ...right].every(identified)) continue;
    const leftById = new Map(left.map((item) => [item.id, item]));
    const rightById = new Map(right.map((item) => [item.id, item]));
    for (const id of new Set([...leftById.keys(), ...rightById.keys()])) {
      if (!same(leftById.get(id), rightById.get(id))) affected.add(id);
    }
  }
  return [...affected];
}

/** Replay durable row operations over a newly fetched confirmed collection. */
export function replayRowMutations<T extends Identified>(confirmed: T[], mutations: RowMutation[]) {
  const effective = confirmed.map((item) => ({ ...item })) as T[];
  for (const mutation of mutations) {
    const index = effective.findIndex((item) => item.id === mutation.entityId);
    if (mutation.operation === 'delete') {
      if (index >= 0) effective.splice(index, 1);
      continue;
    }
    const row = { ...(index >= 0 ? effective[index] : {}), ...mutation.payload, id: mutation.entityId } as T;
    if (index >= 0) effective[index] = row;
    else effective.push(row);
  }
  return effective;
}

export function deriveEntitySyncStatuses(mutations: SyncMutation[]) {
  const statuses = new Map<string, EntitySyncStatus>();
  for (const mutation of mutations) {
    const state: EntitySyncState = mutation.syncStatus === 'syncing'
      ? 'sending'
      : mutation.syncStatus === 'conflicted' || mutation.syncStatus === 'error'
        ? 'needs_attention'
        : 'pending';
    const entityIds = mutation.table === 'app_state_snapshots' && Array.isArray(mutation.payload.affected_client_ids)
      ? mutation.payload.affected_client_ids.map(String)
      : [mutation.entityId];
    for (const entityId of entityIds) statuses.set(`${mutation.table}:${entityId}`, {
      table: mutation.table,
      entityId,
      mutationId: mutation.mutationId,
      state,
    });
  }
  return statuses;
}
