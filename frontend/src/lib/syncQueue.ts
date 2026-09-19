import { offlineStore } from './localStore';
import { mergeQueuedMutation } from './queuePolicy';
import { emitSyncProgress } from './toast';
import { supabase } from './supabase';
import { withConnectionTimeout } from './connectivity';
import { threeWayMergeSnapshot, affectedEntityIds } from './reconciliation';

export interface QueuedMutation {
  formatVersion?: 2;
  localSequence?: number;
  intentBase?: unknown;
  supersedesMutationId?: string;
  batchId?: string;
  batchSize?: number;
  batchIndex?: number;
  id: string;
  mutationId: string;
  userId: string;
  companyId: string;
  entityType: string;
  entityId: string;
  baseRevision: number;
  table: string;
  operation: 'create' | 'update' | 'upsert' | 'delete';
  payload: Record<string, unknown>;
  queuedAt: string;
  updatedAt: string;
  baseServerUpdatedAt: string | null;
  lastAttemptAt: string | null;
  syncStartedAt: string | null;
  syncAttemptId: string | null;
  leaseExpiresAt: string | null;
  syncStatus: 'pending' | 'syncing' | 'retrying' | 'conflicted' | 'error' | 'completed';
  retryCount: number;
  errorCode?: string;
  errorMessage?: string;
  lastError?: string;
}
export const SYNC_QUEUE_KEY = 'sync-queue-v1';
export const SYNC_QUEUE_META_KEY = 'sync-queue-meta-v2';
const KEY = SYNC_QUEUE_KEY;
export type QueueMetadataV2 = { formatVersion: 2; queueGeneration: number; nextLocalSequence: number };
export const SYNC_LEASE_MS = 60_000;
let queueTail: Promise<void> = Promise.resolve();

export type QueuedMutationInput = Partial<Pick<QueuedMutation, 'mutationId' | 'userId' | 'companyId' | 'entityType' | 'entityId' | 'baseRevision' | 'baseServerUpdatedAt'>>
  & Omit<QueuedMutation, 'id' | 'mutationId' | 'userId' | 'companyId' | 'entityType' | 'entityId' | 'baseRevision' | 'baseServerUpdatedAt' | 'queuedAt' | 'updatedAt' | 'lastAttemptAt' | 'syncStartedAt' | 'syncAttemptId' | 'leaseExpiresAt' | 'syncStatus' | 'retryCount' | 'errorCode' | 'errorMessage'>;

function leaseExpired(item: Pick<QueuedMutation, 'syncStatus'> & { leaseExpiresAt?: string | null }, now = Date.now()) {
  if (item.syncStatus !== 'syncing') return false;
  const expiresAt = item.leaseExpiresAt ? Date.parse(item.leaseExpiresAt) : Number.NaN;
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

export function recoverQueuedMutation(item: QueuedMutation, now = Date.now()): QueuedMutation {
  return leaseExpired(item, now)
    ? { ...item, syncStatus: 'pending', updatedAt: new Date(now).toISOString(), syncStartedAt: null, syncAttemptId: null, leaseExpiresAt: null }
    : item;
}
export function queuedMutationCompanyId(mutation: Pick<QueuedMutation, 'companyId' | 'payload'>) {
  return mutation.companyId || String(mutation.payload.workspace_id ?? '');
}

/** Rebase a newer full snapshot after an earlier snapshot has been
 * acknowledged. This preserves the newer local payload while preventing a
 * reconnect race from submitting it against an obsolete revision. */
export function rebaseSnapshotMutation(mutation: QueuedMutation, revision: number): QueuedMutation {
  return mutation.table === 'app_state_snapshots' && mutation.syncStatus === 'pending' && !mutation.lastAttemptAt
    ? { ...mutation, baseRevision: revision, payload: { ...mutation.payload, expected_revision: revision } }
    : mutation;
}

export function isSyncEligible(mutation: Pick<QueuedMutation, 'syncStatus'> & { leaseExpiresAt?: string | null }, now = Date.now()) {
  return mutation.syncStatus === 'pending' || mutation.syncStatus === 'retrying' || leaseExpired(mutation, now);
}

function withQueueLock<T>(operation: () => Promise<T>) {
  const result = queueTail.then(operation, operation);
  queueTail = result.then(() => undefined, () => undefined);
  return result;
}

export async function waitForQueueIdle() { await queueTail; }

function queuedMutation(mutation: QueuedMutationInput, localSequence: number): QueuedMutation {
  const mutationId = mutation.mutationId ?? crypto.randomUUID();
  const companyId = mutation.companyId ?? String(mutation.payload.workspace_id ?? '');
  const entityId = mutation.entityId ?? String(mutation.payload.id ?? mutation.payload.client_id ?? mutation.payload.domain ?? '');
  const now = new Date().toISOString();
  return {
    ...mutation,
    formatVersion: 2,
    localSequence,
    intentBase: mutation.intentBase ?? mutation.payload.base_payload,
    batchId: mutation.batchId ?? (mutation.payload.batch_id ? String(mutation.payload.batch_id) : undefined),
    batchSize: mutation.batchSize ?? (mutation.payload.batch_size === undefined ? undefined : Number(mutation.payload.batch_size)),
    batchIndex: mutation.batchIndex ?? (mutation.payload.batch_index === undefined ? undefined : Number(mutation.payload.batch_index)),
    id: mutationId,
    mutationId,
    userId: mutation.userId ?? 'unknown',
    companyId,
    entityType: mutation.entityType ?? mutation.table,
    entityId,
    baseRevision: mutation.baseRevision ?? Number(mutation.payload.expected_revision ?? 0),
    queuedAt: now,
    updatedAt: now,
    baseServerUpdatedAt: mutation.baseServerUpdatedAt ?? null,
    lastAttemptAt: null,
    syncStartedAt: null,
    syncAttemptId: null,
    leaseExpiresAt: null,
    syncStatus: 'pending',
    retryCount: 0,
  };
}

function normalizeQueuedMutation(item: Partial<QueuedMutation> & { table: string; operation: QueuedMutation['operation']; payload: Record<string, unknown> }, fallbackSequence = 0): QueuedMutation {
  const queuedAt = item.queuedAt ?? item.updatedAt ?? new Date(0).toISOString();
  const entityType = item.entityType ?? item.table;
  const entityId = item.entityId ?? String(item.payload.id ?? item.payload.client_id ?? item.payload.domain ?? '');
  // Older queue records may not have had mutationId or id. Derive an identity
  // from immutable row information rather than generating a new ID on every
  // restart, which would defeat idempotent retries.
  const mutationId = item.mutationId ?? item.id ?? `${item.table}:${entityId}:${queuedAt}`;
  const normalized: QueuedMutation = {
    ...item,
    formatVersion: 2,
    localSequence: Number.isSafeInteger(item.localSequence) && Number(item.localSequence) > 0 ? Number(item.localSequence) : fallbackSequence,
    intentBase: item.intentBase ?? item.payload.base_payload,
    batchId: item.batchId ?? (item.payload.batch_id ? String(item.payload.batch_id) : undefined),
    batchSize: item.batchSize ?? (item.payload.batch_size === undefined ? undefined : Number(item.payload.batch_size)),
    batchIndex: item.batchIndex ?? (item.payload.batch_index === undefined ? undefined : Number(item.payload.batch_index)),
    id: mutationId,
    mutationId,
    userId: item.userId ?? 'unknown',
    companyId: item.companyId ?? String(item.payload.workspace_id ?? ''),
    entityType,
    entityId,
    baseRevision: item.baseRevision ?? Number(item.payload.expected_revision ?? 0),
    queuedAt,
    updatedAt: item.updatedAt ?? queuedAt,
    baseServerUpdatedAt: item.baseServerUpdatedAt ?? null,
    lastAttemptAt: item.lastAttemptAt ?? null,
    syncStartedAt: item.syncStartedAt ?? item.lastAttemptAt ?? null,
    syncAttemptId: item.syncAttemptId ?? null,
    leaseExpiresAt: item.leaseExpiresAt ?? null,
    syncStatus: String(item.syncStatus ?? 'pending') === 'failed' ? 'error' : String(item.syncStatus ?? 'pending') === 'synced' ? 'completed' : item.syncStatus ?? 'pending',
    retryCount: item.retryCount ?? 0,
  };
  return normalized;
}

function normalizeQueueMetadata(raw: unknown, queue: QueuedMutation[]): QueueMetadataV2 {
  const candidate = raw && typeof raw === 'object' ? raw as Partial<QueueMetadataV2> : {};
  const largestSequence = queue.reduce((largest, mutation) => Math.max(largest, mutation.localSequence ?? 0), 0);
  const nextLocalSequence = Number.isSafeInteger(candidate.nextLocalSequence) && Number(candidate.nextLocalSequence) > largestSequence
    ? Number(candidate.nextLocalSequence)
    : largestSequence + 1;
  return {
    formatVersion: 2,
    queueGeneration: Number.isSafeInteger(candidate.queueGeneration) && Number(candidate.queueGeneration) >= 0 ? Number(candidate.queueGeneration) : 0,
    nextLocalSequence,
  };
}

async function loadQueueState() {
  const rawQueue = (await offlineStore.read<QueuedMutation[]>(KEY)) ?? [];
  const queue = rawQueue.map((item, index) => normalizeQueuedMutation(item, index + 1));
  const metadata = normalizeQueueMetadata(await offlineStore.read<QueueMetadataV2>(SYNC_QUEUE_META_KEY), queue);
  return { queue, metadata };
}

async function persistQueueState(queue: QueuedMutation[], metadata: QueueMetadataV2, records: Array<{ key: string; value: unknown }> = []) {
  const nextMetadata: QueueMetadataV2 = { ...metadata, queueGeneration: metadata.queueGeneration + 1 };
  await offlineStore.writeAtomic([...records, { key: KEY, value: queue }, { key: SYNC_QUEUE_META_KEY, value: nextMetadata }]);
  return nextMetadata;
}

/** Persist local records and their mutations in one durable storage transaction. */
export async function enqueueMutationsAtomic(mutations: QueuedMutationInput[], records: Array<{ key: string; value: unknown }>) {
  return withQueueLock(async () => {
    const { queue, metadata } = await loadQueueState();
    let nextLocalSequence = metadata.nextLocalSequence;
    const nextQueue = mutations.reduce((current, mutation) => mergeQueuedMutation(current, queuedMutation(mutation, nextLocalSequence++)), queue);
    await offlineStore.writeAtomic([...records, { key: KEY, value: nextQueue }, { key: SYNC_QUEUE_META_KEY, value: { ...metadata, queueGeneration: metadata.queueGeneration + 1, nextLocalSequence } }]);
    // Keep Settings' pending/error counters current even when the device is
    // offline and no sync worker will emit a later progress event. This is a
    // progress event, not a toast; AppToast only reacts to attention states.
    const workspaceIds = [...new Set(mutations.map((mutation) => mutation.companyId ?? String(mutation.payload.workspace_id ?? '')).filter(Boolean))];
    for (const workspaceId of workspaceIds) {
      const relevant = nextQueue.filter((item) => item.companyId === workspaceId || String(item.payload.workspace_id ?? '') === workspaceId);
      emitSyncProgress({
        workspaceId,
        total: relevant.length,
        completed: 0,
        pending: relevant.length,
        errors: relevant.filter((item) => item.syncStatus === 'error' || item.syncStatus === 'conflicted').length,
        status: typeof navigator !== 'undefined' && navigator.onLine ? 'syncing' : 'offline',
      });
    }
  });
}

export async function enqueueMutation(mutation: QueuedMutationInput) {
  return enqueueMutationsAtomic([mutation], []);
}

export async function getQueuedMutations() {
  await queueTail;
  const queue = (await offlineStore.read<QueuedMutation[]>(KEY)) ?? [];
  return queue.map((item, index) => recoverQueuedMutation(normalizeQueuedMutation(item, index + 1)));
}

/** Durably reclaim mutations left in `syncing` by a killed process. Active
 * leases remain untouched so another WebView/tab cannot process them twice. */
export async function recoverStaleQueuedMutations(now = Date.now()) {
  return withQueueLock(async () => {
    const raw = (await offlineStore.read<QueuedMutation[]>(KEY)) ?? [];
    const normalized = raw.map((item, index) => normalizeQueuedMutation(item, index + 1));
    const recovered = normalized.map((item) => recoverQueuedMutation(item, now));
    const changed = recovered.some((item, index) => item.syncStatus !== raw[index]?.syncStatus || item.leaseExpiresAt !== raw[index]?.leaseExpiresAt || item.syncAttemptId !== raw[index]?.syncAttemptId);
    if (changed) {
      const metadata = normalizeQueueMetadata(await offlineStore.read<QueueMetadataV2>(SYNC_QUEUE_META_KEY), recovered);
      await persistQueueState(recovered, metadata);
    }
    return recovered;
  });
}

/** Older outbox rows predate persisted auth identity. Scope only rows whose
 * company is one of the signed-in user's resolved memberships; never guess
 * across companies and never discard an unresolvable row. */
export async function scopeLegacyQueuedMutations(userId: string, workspaceIds: string[]) {
  return withQueueLock(async () => {
    const allowed = new Set(workspaceIds);
    const raw = (await offlineStore.read<QueuedMutation[]>(KEY)) ?? [];
    const queue = raw.map((item, index) => normalizeQueuedMutation(item, index + 1));
    let changed = false;
    const scoped = queue.map((mutation) => {
      const next = scopeQueuedMutationForUser(mutation, userId, allowed);
      if (next !== mutation) {
        changed = true;
      }
      return next;
    });
    if (changed) {
      const metadata = normalizeQueueMetadata(await offlineStore.read<QueueMetadataV2>(SYNC_QUEUE_META_KEY), scoped);
      await persistQueueState(scoped, metadata);
    }
    return scoped;
  });
}

export function scopeQueuedMutationForUser(mutation: QueuedMutation, userId: string, workspaceIds: Set<string>) {
  return (mutation.userId === 'unknown' || !mutation.userId) && workspaceIds.has(queuedMutationCompanyId(mutation))
    ? { ...mutation, userId, updatedAt: new Date().toISOString() }
    : mutation;
}

/** Atomically lease eligible mutations before network I/O. The persisted
 * lease makes a mid-request process death recoverable on the next startup. */
export async function claimQueuedMutations(workspaceIds: string[], workerId: string, now = Date.now(), leaseMs = SYNC_LEASE_MS) {
  return withQueueLock(async () => {
    const allowed = new Set(workspaceIds);
    const raw = (await offlineStore.read<QueuedMutation[]>(KEY)) ?? [];
    const queue = raw.map((item, index) => recoverQueuedMutation(normalizeQueuedMutation(item, index + 1), now));
    const startedAt = new Date(now).toISOString();
    const leaseExpiresAt = new Date(now + leaseMs).toISOString();
    const claimedIds = new Set(queue
      .filter((mutation) => allowed.has(queuedMutationCompanyId(mutation)) && isSyncEligible(mutation, now))
      .map((mutation) => mutation.mutationId));
    const leased = queue.map((mutation) => claimedIds.has(mutation.mutationId)
      ? { ...mutation, syncStatus: 'syncing' as const, syncStartedAt: startedAt, syncAttemptId: `${workerId}:${mutation.mutationId}`, leaseExpiresAt, lastAttemptAt: startedAt, updatedAt: startedAt }
      : mutation);
    if (claimedIds.size || leased.some((item, index) => item.syncStatus !== raw[index]?.syncStatus)) {
      const metadata = normalizeQueueMetadata(await offlineStore.read<QueueMetadataV2>(SYNC_QUEUE_META_KEY), leased);
      await persistQueueState(leased, metadata);
    }
    return { queue: leased, claimed: leased.filter((mutation) => claimedIds.has(mutation.mutationId)) };
  });
}

export async function hasPendingMutationsForWorkspace(workspaceId: string, tables?: string[]) {
  const allowedTables = tables ? new Set(tables) : null;
  const queue = await getQueuedMutations();
  return queue.some((mutation) => {
    const companyId = queuedMutationCompanyId(mutation);
    return companyId === workspaceId && (!allowedTables || allowedTables.has(mutation.table));
  });
}

export async function getWorkspaceMutationStatus(workspaceId: string, tables?: string[]) {
  const allowedTables = tables ? new Set(tables) : null;
  const queue = await getQueuedMutations();
  const relevant = queue.filter((mutation) => {
    const companyId = queuedMutationCompanyId(mutation);
    return companyId === workspaceId && (!allowedTables || allowedTables.has(mutation.table));
  });
  if (relevant.some((mutation) => mutation.syncStatus === 'conflicted' || mutation.syncStatus === 'error')) return 'conflict' as const;
  return relevant.length ? 'pending' as const : null;
}

export async function replaceQueue(queue: QueuedMutation[], processedMutationIds: string[] = [], acknowledgedSnapshotRevisions: Map<string, number> = new Map()) {
  return withQueueLock(async () => {
    const { queue: latest, metadata } = await loadQueueState();
    const processed = new Set(processedMutationIds);
    const rebase = (mutation: QueuedMutation): QueuedMutation => {
      const snapshotKey = `${queuedMutationCompanyId(mutation)}:${String(mutation.payload.domain ?? mutation.entityId)}`;
      const revision = acknowledgedSnapshotRevisions.get(snapshotKey);
      return revision === undefined ? mutation : rebaseSnapshotMutation(mutation, revision);
    };
    const rebasedQueue = queue.map(rebase);
    const additions = latest
      .filter((mutation) => !processed.has(mutation.mutationId ?? mutation.id))
      .map((mutation, index) => rebase(normalizeQueuedMutation(mutation, index + 1)));
    const merged = additions.reduce((current, mutation) => mergeQueuedMutation(current, mutation), rebasedQueue);
    await persistQueueState(merged, metadata);
  });
}

/** Rebase a never-attempted snapshot mutation onto a freshly fetched server
 * revision while committing the merged effective snapshot in the same local
 * transaction. Attempted mutations are immutable because the server may have
 * accepted their original mutation ID and payload. */
export async function reconcilePendingSnapshotMutation(
  mutationId: string,
  value: unknown,
  revision: number,
  affectedClientIds: string[],
  records: Array<{ key: string; value: unknown }>,
) {
  return withQueueLock(async () => {
    const raw = (await offlineStore.read<QueuedMutation[]>(KEY)) ?? [];
    const queue = raw.map((item, index) => normalizeQueuedMutation(item, index + 1));
    const target = queue.find((mutation) => mutation.mutationId === mutationId);
    if (!target || target.table !== 'app_state_snapshots' || target.syncStatus !== 'pending' || target.lastAttemptAt) return false;
    const next = queue.map((mutation) => mutation.mutationId === mutationId ? {
      ...mutation,
      baseRevision: revision,
      payload: {
        ...mutation.payload,
        payload: value,
        expected_revision: revision,
        base_payload: mutation.payload.base_payload,
        affected_client_ids: affectedClientIds,
      },
      updatedAt: new Date().toISOString(),
    } : mutation);
    const metadata = normalizeQueueMetadata(await offlineStore.read<QueueMetadataV2>(SYNC_QUEUE_META_KEY), next);
    await persistQueueState(next, metadata, records);
    return true;
  });
}

/** Remove one successfully acknowledged snapshot and update its confirmed and
 * effective layers in the same durable transaction. The server call happens
 * before this function; if the local commit fails, the original mutation
 * remains retryable with its original identity. */
export async function acknowledgeSnapshotMutation(
  mutationId: string,
  acknowledgedPayload: unknown,
  revision: number,
  recordKeys: {
    effectiveKey: string;
    revisionKey: string;
    confirmedKey: string;
    confirmedRevisionKey: string;
  },
  extraRecords: Array<{ key: string; value: unknown }> = [],
) {
  return withQueueLock(async () => {
    const { queue, metadata } = await loadQueueState();
    const target = queue.find((mutation) => mutation.mutationId === mutationId);
    if (!target || target.table !== 'app_state_snapshots') return false;

    const snapshotKey = `${queuedMutationCompanyId(target)}:${String(target.payload.domain ?? target.entityId)}`;
    const remaining = queue
      .filter((mutation) => mutation.mutationId !== mutationId)
      .map((mutation) => mutation.localSequence > target.localSequence
        ? rebaseSnapshotMutation(mutation, revision)
        : mutation);
    const successor = remaining
      .filter((mutation) => mutation.table === 'app_state_snapshots'
        && `${queuedMutationCompanyId(mutation)}:${String(mutation.payload.domain ?? mutation.entityId)}` === snapshotKey
        && mutation.syncStatus !== 'completed')
      .sort((left, right) => (right.localSequence ?? 0) - (left.localSequence ?? 0))[0];
    const effectivePayload = successor?.payload.payload ?? acknowledgedPayload;
    await persistQueueState(remaining, metadata, [
      ...extraRecords,
      { key: recordKeys.effectiveKey, value: effectivePayload },
      { key: recordKeys.revisionKey, value: revision },
      { key: recordKeys.confirmedKey, value: acknowledgedPayload },
      { key: recordKeys.confirmedRevisionKey, value: revision },
    ]);
    return { effectivePayload, revision };
  });
}

/** Explicit user retry for permanent failures. Conflicts remain protected
 * until the user reviews the remote/local versions. */
export async function retryQueuedMutations(workspaceId: string) {
  return withQueueLock(async () => {
    // Read directly while holding the queue lock. Calling getQueuedMutations
    // here would await the lock's own tail and deadlock the manual retry.
    const rawQueue = (await offlineStore.read<QueuedMutation[]>(KEY)) ?? [];
    const queue = rawQueue.map((mutation, index) => normalizeQueuedMutation(mutation, index + 1));
    const now = new Date().toISOString();
    const retried = queue.map((mutation) => queuedMutationCompanyId(mutation) === workspaceId && mutation.syncStatus === 'error'
      ? { ...mutation, syncStatus: 'pending' as const, updatedAt: now, syncStartedAt: null, syncAttemptId: null, leaseExpiresAt: null, errorCode: undefined, errorMessage: undefined, lastError: undefined }
      : mutation);
    const metadata = normalizeQueueMetadata(await offlineStore.read<QueueMetadataV2>(SYNC_QUEUE_META_KEY), retried);
    await persistQueueState(retried, metadata);
  });
}

/** Retry one record from its visible sync issue. Conflicts require an explicit
 * user choice, so callers must opt in before the protected row is requeued. */
export async function retryQueuedMutation(mutationId: string, includeConflict = false) {
  return withQueueLock(async () => {
    const rawQueue = (await offlineStore.read<QueuedMutation[]>(KEY)) ?? [];
    const now = new Date().toISOString();
    let retried = false;
    const queue = rawQueue.map((raw) => {
      const mutation = normalizeQueuedMutation(raw, rawQueue.indexOf(raw) + 1);
      const retryable = mutation.syncStatus === 'error' || (includeConflict && mutation.syncStatus === 'conflicted');
      if (mutation.mutationId !== mutationId || !retryable) return mutation;
      retried = true;
      return { ...mutation, syncStatus: 'pending' as const, updatedAt: now, syncStartedAt: null, syncAttemptId: null, leaseExpiresAt: null, errorCode: undefined, errorMessage: undefined, lastError: undefined };
    });
    if (retried) {
      const metadata = normalizeQueueMetadata(await offlineStore.read<QueueMetadataV2>(SYNC_QUEUE_META_KEY), queue);
      await persistQueueState(queue, metadata);
    }
    return retried;
  });
}

/** Resolve a conflicted snapshot against a freshly fetched server version.
 * The network read happens without the queue lock; the final replacement is
 * committed only if the selected mutation is still the same durable record. */
export async function resolveSnapshotConflict(mutationId: string) {
  const queue = await getQueuedMutations();
  const target = queue.find((mutation) => mutation.mutationId === mutationId);
  if (!target || target.table !== 'app_state_snapshots' || target.syncStatus !== 'conflicted') return false;
  const workspaceId = queuedMutationCompanyId(target);
  const domain = String(target.payload.domain ?? target.entityId);
  const base = target.payload.base_payload;
  if (base === undefined) throw new Error('This snapshot has no recorded baseline; whole-snapshot replacement requires explicit review.');
  const { data, error } = await withConnectionTimeout(supabase.from('app_state_snapshots').select('payload, revision').eq('workspace_id', workspaceId).eq('domain', domain).maybeSingle());
  if (error) throw error;
  const remote = data as unknown as { payload?: unknown; revision?: number } | null;
  if (!remote || remote.payload === undefined || remote.revision === undefined) throw new Error('The server snapshot is unavailable; the local change was preserved.');
  const local = target.payload.payload;
  const merged = threeWayMergeSnapshot(base, remote.payload, local);
  const nextMutationId = crypto.randomUUID();
  const next: QueuedMutation = {
    ...target,
    formatVersion: 2,
    id: nextMutationId,
    mutationId: nextMutationId,
    baseRevision: remote.revision,
    baseServerUpdatedAt: null,
    lastAttemptAt: null,
    syncStartedAt: null,
    syncAttemptId: null,
    leaseExpiresAt: null,
    syncStatus: 'pending',
    retryCount: 0,
    errorCode: undefined,
    errorMessage: undefined,
    lastError: undefined,
    updatedAt: new Date().toISOString(),
    payload: {
      ...target.payload,
      mutation_id: nextMutationId,
      expected_revision: remote.revision,
      base_payload: remote.payload,
      payload: merged,
      affected_client_ids: affectedEntityIds(remote.payload, merged),
    },
  };
  const storageKey = `${target.userId}:${workspaceId}:${domain}`;
  return withQueueLock(async () => {
    const latestRaw = (await offlineStore.read<QueuedMutation[]>(KEY)) ?? [];
    const latest = latestRaw.map((item, index) => normalizeQueuedMutation(item, index + 1));
    const current = latest.find((item) => item.mutationId === mutationId);
    if (!current || current.updatedAt !== target.updatedAt || current.syncStatus !== 'conflicted') return false;
    const metadata = normalizeQueueMetadata(await offlineStore.read<QueueMetadataV2>(SYNC_QUEUE_META_KEY), latest);
    const replacement = latest.map((item) => item.mutationId === mutationId ? {
      ...next,
      localSequence: metadata.nextLocalSequence,
      supersedesMutationId: mutationId,
    } : item);
    const replacementMetadata = { ...metadata, nextLocalSequence: metadata.nextLocalSequence + 1 };
    await persistQueueState(replacement, replacementMetadata, [
      { key: storageKey, value: merged },
      { key: `${storageKey}:revision`, value: remote.revision },
      { key: `${storageKey}:confirmed`, value: remote.payload },
      { key: `${storageKey}:confirmed:revision`, value: remote.revision },
    ]);
    return true;
  });
}

export async function replaceConflictedMutationAtomically(
  mutationId: string,
  replacement: QueuedMutation | null,
  records: Array<{ key: string; value: unknown }>,
  expectedUpdatedAt?: string,
) {
  return withQueueLock(async () => {
    const raw = (await offlineStore.read<QueuedMutation[]>(KEY)) ?? [];
    const queue = raw.map((item, index) => normalizeQueuedMutation(item, index + 1));
    const current = queue.find((item) => item.mutationId === mutationId);
    if (!current || current.syncStatus !== 'conflicted' || (expectedUpdatedAt !== undefined && current.updatedAt !== expectedUpdatedAt)) return false;
    const next = queue.flatMap((item) => {
      if (item.mutationId !== mutationId) return [item];
      return replacement ? [replacement] : [];
    });
    const metadata = normalizeQueueMetadata(await offlineStore.read<QueueMetadataV2>(SYNC_QUEUE_META_KEY), next);
    await persistQueueState(next, metadata, records);
    return true;
  });
}

/** Replace or remove an entire conflict unit under one queue transaction.
 * Truck transaction batches must never be resolved one row at a time. The
 * caller fetches the complete unit first, then supplies all fresh identities
 * (or none for a use-server discard) and the observed durable timestamps. */
export async function replaceConflictedMutationUnitAtomically(
  mutationIds: string[],
  replacements: QueuedMutation[],
  records: Array<{ key: string; value: unknown }>,
  expectedUpdatedAt: Record<string, string | undefined> = {},
) {
  return withQueueLock(async () => {
    const selected = new Set(mutationIds);
    if (!mutationIds.length || new Set(replacements.map((item) => item.mutationId)).size !== replacements.length) return false;
    const raw = (await offlineStore.read<QueuedMutation[]>(KEY)) ?? [];
    const queue = raw.map((item, index) => normalizeQueuedMutation(item, index + 1));
    const current = queue.filter((item) => selected.has(item.mutationId));
    if (current.length !== selected.size || current.some((item) => !['conflicted', 'error'].includes(item.syncStatus))) return false;
    if (current.some((item) => expectedUpdatedAt[item.mutationId] !== undefined && expectedUpdatedAt[item.mutationId] !== item.updatedAt)) return false;
    const metadata = normalizeQueueMetadata(await offlineStore.read<QueueMetadataV2>(SYNC_QUEUE_META_KEY), queue);
    let nextLocalSequence = metadata.nextLocalSequence;
    const replacementBySource = new Map(mutationIds.map((id, index) => [id, replacements[index]
      ? {
        ...replacements[index],
        formatVersion: 2 as const,
        localSequence: nextLocalSequence++,
        supersedesMutationId: id,
      }
      : replacements[index]]));
    if (replacements.length !== 0 && replacements.length !== mutationIds.length) return false;
    const next = queue.flatMap((item) => {
      if (!selected.has(item.mutationId)) return [item];
      const replacement = replacementBySource.get(item.mutationId);
      return replacement ? [replacement] : [];
    });
    await persistQueueState(next, { ...metadata, nextLocalSequence }, records);
    return true;
  });
}

/** Explicitly discard one queued change after the user chooses the server
 * version. The effective cache is refreshed by the caller after removal. */
export async function discardQueuedMutation(mutationId: string) {
  return withQueueLock(async () => {
    const rawQueue = (await offlineStore.read<QueuedMutation[]>(KEY)) ?? [];
    const queue = rawQueue.map((item, index) => normalizeQueuedMutation(item, index + 1));
    const next = queue.filter((mutation) => mutation.mutationId !== mutationId);
    if (next.length === queue.length) return false;
    const metadata = normalizeQueueMetadata(await offlineStore.read<QueueMetadataV2>(SYNC_QUEUE_META_KEY), next);
    await persistQueueState(next, metadata);
    return true;
  });
}
