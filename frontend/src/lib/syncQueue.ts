import { offlineStore } from './localStore';
import { mergeQueuedMutation } from './queuePolicy';
import { emitSyncProgress } from './toast';

export interface QueuedMutation {
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
const KEY = 'sync-queue-v1';
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

export function isSyncEligible(mutation: Pick<QueuedMutation, 'syncStatus'> & { leaseExpiresAt?: string | null }, now = Date.now()) {
  return mutation.syncStatus === 'pending' || mutation.syncStatus === 'retrying' || leaseExpired(mutation, now);
}

function withQueueLock<T>(operation: () => Promise<T>) {
  const result = queueTail.then(operation, operation);
  queueTail = result.then(() => undefined, () => undefined);
  return result;
}

function queuedMutation(mutation: QueuedMutationInput): QueuedMutation {
  const mutationId = mutation.mutationId ?? crypto.randomUUID();
  const companyId = mutation.companyId ?? String(mutation.payload.workspace_id ?? '');
  const entityId = mutation.entityId ?? String(mutation.payload.id ?? mutation.payload.client_id ?? mutation.payload.domain ?? '');
  const now = new Date().toISOString();
  return { ...mutation, id: mutationId, mutationId, userId: mutation.userId ?? 'unknown', companyId, entityType: mutation.entityType ?? mutation.table, entityId, baseRevision: mutation.baseRevision ?? Number(mutation.payload.expected_revision ?? 0), queuedAt: now, updatedAt: now, baseServerUpdatedAt: mutation.baseServerUpdatedAt ?? null, lastAttemptAt: null, syncStartedAt: null, syncAttemptId: null, leaseExpiresAt: null, syncStatus: 'pending', retryCount: 0 };
}

function normalizeQueuedMutation(item: Partial<QueuedMutation> & { table: string; operation: QueuedMutation['operation']; payload: Record<string, unknown> }): QueuedMutation {
  const queuedAt = item.queuedAt ?? item.updatedAt ?? new Date(0).toISOString();
  const entityType = item.entityType ?? item.table;
  const entityId = item.entityId ?? String(item.payload.id ?? item.payload.client_id ?? item.payload.domain ?? '');
  // Older queue records may not have had mutationId or id. Derive an identity
  // from immutable row information rather than generating a new ID on every
  // restart, which would defeat idempotent retries.
  const mutationId = item.mutationId ?? item.id ?? `${item.table}:${entityId}:${queuedAt}`;
  const normalized: QueuedMutation = {
    ...item,
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

/** Persist local records and their mutations in one durable storage transaction. */
export async function enqueueMutationsAtomic(mutations: QueuedMutationInput[], records: Array<{ key: string; value: unknown }>) {
  return withQueueLock(async () => {
    const queue = (await offlineStore.read<QueuedMutation[]>(KEY)) ?? [];
  const nextQueue = mutations.reduce((current, mutation) => mergeQueuedMutation(current, queuedMutation(mutation)), queue);
    await offlineStore.writeAtomic([...records, { key: KEY, value: nextQueue }]);
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
  return queue.map((item) => recoverQueuedMutation(normalizeQueuedMutation(item)));
}

/** Durably reclaim mutations left in `syncing` by a killed process. Active
 * leases remain untouched so another WebView/tab cannot process them twice. */
export async function recoverStaleQueuedMutations(now = Date.now()) {
  return withQueueLock(async () => {
    const raw = (await offlineStore.read<QueuedMutation[]>(KEY)) ?? [];
    const normalized = raw.map((item) => normalizeQueuedMutation(item));
    const recovered = normalized.map((item) => recoverQueuedMutation(item, now));
    const changed = recovered.some((item, index) => item.syncStatus !== raw[index]?.syncStatus || item.leaseExpiresAt !== raw[index]?.leaseExpiresAt || item.syncAttemptId !== raw[index]?.syncAttemptId);
    if (changed) await offlineStore.write(KEY, recovered);
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
    const queue = raw.map((item) => normalizeQueuedMutation(item));
    let changed = false;
    const scoped = queue.map((mutation) => {
      const next = scopeQueuedMutationForUser(mutation, userId, allowed);
      if (next !== mutation) {
        changed = true;
      }
      return next;
    });
    if (changed) await offlineStore.write(KEY, scoped);
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
    const queue = raw.map((item) => recoverQueuedMutation(normalizeQueuedMutation(item), now));
    const startedAt = new Date(now).toISOString();
    const leaseExpiresAt = new Date(now + leaseMs).toISOString();
    const claimedIds = new Set(queue
      .filter((mutation) => allowed.has(queuedMutationCompanyId(mutation)) && isSyncEligible(mutation, now))
      .map((mutation) => mutation.mutationId));
    const leased = queue.map((mutation) => claimedIds.has(mutation.mutationId)
      ? { ...mutation, syncStatus: 'syncing' as const, syncStartedAt: startedAt, syncAttemptId: `${workerId}:${mutation.mutationId}`, leaseExpiresAt, lastAttemptAt: startedAt, updatedAt: startedAt }
      : mutation);
    if (claimedIds.size || leased.some((item, index) => item.syncStatus !== raw[index]?.syncStatus)) await offlineStore.write(KEY, leased);
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

export async function replaceQueue(queue: QueuedMutation[], processedMutationIds: string[] = []) {
  return withQueueLock(async () => {
    const latest = (await offlineStore.read<QueuedMutation[]>(KEY)) ?? [];
    const processed = new Set(processedMutationIds);
    const additions = latest.filter((mutation) => !processed.has(mutation.mutationId ?? mutation.id));
    const merged = additions.reduce((current, mutation) => mergeQueuedMutation(current, mutation), queue);
    await offlineStore.write(KEY, merged);
  });
}

/** Explicit user retry for permanent failures. Conflicts remain protected
 * until the user reviews the remote/local versions. */
export async function retryQueuedMutations(workspaceId: string) {
  return withQueueLock(async () => {
    // Read directly while holding the queue lock. Calling getQueuedMutations
    // here would await the lock's own tail and deadlock the manual retry.
    const rawQueue = (await offlineStore.read<QueuedMutation[]>(KEY)) ?? [];
    const queue = rawQueue.map((mutation) => normalizeQueuedMutation(mutation));
    const now = new Date().toISOString();
    const retried = queue.map((mutation) => queuedMutationCompanyId(mutation) === workspaceId && mutation.syncStatus === 'error'
      ? { ...mutation, syncStatus: 'pending' as const, updatedAt: now, syncStartedAt: null, syncAttemptId: null, leaseExpiresAt: null, errorCode: undefined, errorMessage: undefined, lastError: undefined }
      : mutation);
    await offlineStore.write(KEY, retried);
  });
}
