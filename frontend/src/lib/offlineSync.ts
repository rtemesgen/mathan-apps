import { supabase } from './supabase';
import { getQueuedMutations, isSyncEligible, replaceQueue, type QueuedMutation } from './syncQueue';
import { offlineStore } from './localStore';
import { reportPersistenceNotice } from './repositories/types';
import { emitSyncConflict, emitSyncProgress, emitSyncStatus, type SyncStatus } from './toast';
import { withConnectionTimeout } from './connectivity';
import { diagnostic } from './diagnostics';

export type { SyncStatus } from './toast';

function reportTruckMutationStatus(status: 'sync pending' | 'sync conflict') {
  reportPersistenceNotice({ app: 'truck', state: status });
}

function reportSnapshotMutationStatus(domain: unknown, status: 'sync pending' | 'sync conflict') {
  const app = String(domain ?? '').startsWith('cash_book:') ? 'cash_book' : String(domain ?? '').startsWith('payroll:') ? 'payroll' : null;
  if (app) reportPersistenceNotice({ app, state: status });
}

function report(status: SyncStatus, queued?: number, detail: Record<string, unknown> = {}) {
  emitSyncStatus(status, queued, detail);
}

export const isPermanentSyncError = (error: { code?: string; message?: string } | null | undefined) => {
  const code = error?.code ?? '';
  const status = Number(code);
  return ['401', '403', '42501', '23505', '23503', '23514', 'PGRST116', 'PGRST202', 'PGRST301'].includes(code)
    || status === 401 || status === 403
    || /permission|forbidden|unauthorized|jwt|authentication|validation|invalid|does not exist|not found/i.test(error?.message ?? '');
};
const permanentError = isPermanentSyncError;
const wait = (attempt: number) => new Promise((resolve) => window.setTimeout(resolve, Math.min(30000, 500 * (2 ** Math.min(attempt, 6)) + Math.random() * 400)));

export function orderQueuedMutations(queue: QueuedMutation[]) {
  const rank = (item: QueuedMutation) => item.entityType.includes('transaction') || item.table.includes('transaction') ? 3 : item.entityType.includes('owner') || item.entityType.includes('membership') ? 2 : 1;
  return [...queue].sort((a, b) => rank(a) - rank(b) || a.queuedAt.localeCompare(b.queuedAt));
}

/** Apply a Truck row directly while the app is online. Offline writes use the
 * queue below; online writes should not create a needless queue round-trip. */
export async function writeTruckMutationOnline(workspaceId: string, table: string, payload: Record<string, unknown>, operation: 'create' | 'update' | 'delete' = 'update', expectedUpdatedAt: string | null = null) {
  if (!['trucks', 'truck_owners', 'truck_customers', 'truck_transactions'].includes(table)) throw new Error('Unsupported Truck table');
  const row = { ...payload };
  delete row.workspace_id;
  const id = String(row.id ?? '');
  delete row.id;
  const guarded = (query: any) => expectedUpdatedAt ? query.eq('updated_at', expectedUpdatedAt) : query;
  const result = operation === 'delete'
    ? await guarded(supabase.from(table).update(row).eq('workspace_id', workspaceId).eq('id', id)).select().single()
    : operation === 'update'
      ? await guarded(supabase.from(table).update(row).eq('workspace_id', workspaceId).eq('id', id)).select().single()
      : await supabase.from(table).upsert({ id, workspace_id: workspaceId, ...row }, { onConflict: 'id' }).select().single();
  if (result.error) {
    if (operation !== 'create' && result.error.code === 'PGRST116') {
      throw Object.assign(new Error('The Truck record changed or was removed on another device.'), { code: 'CONFLICT' });
    }
    throw result.error;
  }
  if (!result.data) throw Object.assign(new Error('The Truck record changed on another device.'), { code: 'CONFLICT' });
  return result.data as Record<string, unknown>;
}

/** Flush queued changes for one or more workspaces in a single pass. */
let activeSync: Promise<void> = Promise.resolve();
const workspaceSyncs = new Map<string, Promise<void>>();

async function flushWorkspaceQueues(workspaceIds: string | string[]) {
  if (!navigator.onLine) { report('offline'); return; }
  const allowed = new Set(Array.isArray(workspaceIds) ? workspaceIds : [workspaceIds]);
  if (!allowed.size) return;
  const queue = await getQueuedMutations();
  const remaining: QueuedMutation[] = [];
  let conflict = false;
  let failed = false;
  const ordered = orderQueuedMutations(queue.filter((mutation) => allowed.has(mutation.companyId || String(mutation.payload.workspace_id ?? '')) && isSyncEligible(mutation)));
  if (ordered.length === 0) return;
  diagnostic('sync-started', { workspaceCount: allowed.size, mutationCount: ordered.length });
  report('syncing');
  emitSyncProgress({ workspaceId: Array.isArray(workspaceIds) ? undefined : workspaceIds, total: ordered.length, completed: 0, pending: ordered.length, errors: ordered.filter((item) => item.syncStatus === 'error' || item.syncStatus === 'conflicted').length, status: 'syncing' });

  for (const mutation of queue) {
    const workspaceId = mutation.companyId || String(mutation.payload.workspace_id ?? '');
    if (!allowed.has(workspaceId) || !isSyncEligible(mutation)) { remaining.push(mutation); continue; }
  }
  let completed = 0;
  let errors = 0;
  for (const mutation of ordered) {
    const workspaceId = mutation.companyId || String(mutation.payload.workspace_id ?? '');
    const attemptAt = new Date().toISOString();
    const attempted = { ...mutation, lastAttemptAt: attemptAt, updatedAt: attemptAt, syncStatus: 'syncing' as const };
    try {
    if (mutation.table !== 'app_state_snapshots') {
      if (!['trucks', 'truck_owners', 'truck_customers', 'truck_transactions'].includes(mutation.table)) { remaining.push(mutation); continue; }
      let mutationSucceeded = false;
      try {
        await withConnectionTimeout(writeTruckMutationOnline(workspaceId, mutation.table, mutation.payload, mutation.operation === 'upsert' ? 'update' : mutation.operation, mutation.baseServerUpdatedAt));
        mutationSucceeded = true;
      } catch (reason) {
        const error = reason as { code?: string; message?: string };
        if (error.code === 'CONFLICT') { conflict = true; errors += 1; reportTruckMutationStatus('sync conflict'); remaining.push({ ...attempted, syncStatus: 'conflicted', errorCode: error.code, errorMessage: error.message, lastError: error.message ?? 'Truck record changed on another device' }); }
        else if (permanentError(error)) { errors += 1; reportTruckMutationStatus('sync conflict'); remaining.push({ ...attempted, syncStatus: 'error', errorCode: error.code, errorMessage: error.message, lastError: error.message ?? 'Truck synchronization failed' }); }
        else { reportTruckMutationStatus('sync pending'); failed = true; remaining.push({ ...attempted, syncStatus: 'retrying', retryCount: mutation.retryCount + 1, errorCode: error.code, errorMessage: error.message, lastError: error.message ?? 'Truck synchronization failed' }); }
      }
      completed += 1;
      diagnostic('mutation-processed', { workspaceId, table: mutation.table, success: mutationSucceeded });
      emitSyncProgress({ workspaceId: Array.isArray(workspaceIds) ? undefined : workspaceIds, total: ordered.length, completed, pending: ordered.length - completed, errors, status: failed ? 'retry' : 'syncing' });
      continue;
    }
    const { data, error } = await withConnectionTimeout(supabase.rpc('write_app_state_snapshot', {
      target_workspace: workspaceId,
      target_domain: mutation.payload.domain,
      expected_revision: mutation.payload.expected_revision ?? 0,
      target_payload: mutation.payload.payload,
      audit_action: mutation.payload.audit_action ?? 'snapshot_written_offline',
      affected_client_ids: mutation.payload.affected_client_ids ?? [],
      mutation_id: mutation.mutationId,
    }));
    const result = (data as Array<{ status: string; revision: number; payload: unknown }> | null)?.[0];
    if (result?.status === 'conflict') {
      conflict = true;
      remaining.push({ ...attempted, syncStatus: 'conflicted', errorCode: 'CONFLICT', errorMessage: 'Remote revision changed', lastError: 'Remote revision changed' });
      reportSnapshotMutationStatus(mutation.payload.domain, 'sync conflict');
      emitSyncConflict({ domain: String(mutation.payload.domain ?? ''), remote: result.payload, revision: result.revision, mutationId: mutation.mutationId });
    } else if (error || !result) {
      if (permanentError(error)) { errors += 1; reportSnapshotMutationStatus(mutation.payload.domain, 'sync conflict'); remaining.push({ ...attempted, syncStatus: 'error', errorCode: error?.code, errorMessage: error?.message, lastError: error?.message ?? 'Synchronization failed' }); }
      else { reportSnapshotMutationStatus(mutation.payload.domain, 'sync pending'); failed = true; remaining.push({ ...attempted, syncStatus: 'retrying', retryCount: mutation.retryCount + 1, errorCode: error?.code, errorMessage: error?.message, lastError: error?.message ?? 'Synchronization failed' }); }
    } else if (result.status === 'written' && result.payload !== undefined) {
      const storageKey = `${mutation.userId}:${workspaceId}:${String(mutation.payload.domain ?? mutation.entityId)}`;
      await offlineStore.write(storageKey, result.payload);
      await offlineStore.write(`${storageKey}:revision`, result.revision);
    }
    } catch (error) {
      if (mutation.table !== 'app_state_snapshots') reportTruckMutationStatus('sync pending');
      else reportSnapshotMutationStatus(mutation.payload.domain, 'sync pending');
      failed = true;
      const message = error instanceof Error ? error.message : 'Synchronization failed';
      remaining.push({ ...attempted, syncStatus: 'retrying', retryCount: mutation.retryCount + 1, errorMessage: message, lastError: message });
    }
    completed += 1;
    diagnostic('mutation-processed', { workspaceId, table: mutation.table, success: !remaining.some((item) => item.mutationId === mutation.mutationId) });
    emitSyncProgress({ workspaceId: Array.isArray(workspaceIds) ? undefined : workspaceIds, total: ordered.length, completed, pending: ordered.length - completed, errors, status: failed ? 'retry' : 'syncing' });
  }

  await replaceQueue(remaining, ordered.map((mutation) => mutation.mutationId));
  if (conflict) { report('conflicted', remaining.length, { conflictCount: remaining.filter((item) => item.syncStatus === 'conflicted').length }); emitSyncProgress({ workspaceId: Array.isArray(workspaceIds) ? undefined : workspaceIds, total: ordered.length, completed, pending: remaining.length, errors, status: 'conflicted' }); }
  else if (failed || remaining.some((mutation) => allowed.has(mutation.companyId || String(mutation.payload.workspace_id ?? '')))) { report('retry', remaining.length); emitSyncProgress({ workspaceId: Array.isArray(workspaceIds) ? undefined : workspaceIds, total: ordered.length, completed, pending: remaining.length, errors, status: 'retry' }); }
  else {
    const lastSyncedAt = new Date().toISOString();
    await Promise.all([...allowed].map((companyId) => offlineStore.writeMetadata(`sync:${companyId}`, { lastSyncedAt, pendingCount: 0, conflictCount: 0 })));
    report('synced', 0, { lastSyncedAt, pendingCount: 0, conflictCount: 0 });
    diagnostic('sync-completed', { workspaceCount: allowed.size, mutationCount: ordered.length });
    emitSyncProgress({ workspaceId: Array.isArray(workspaceIds) ? undefined : workspaceIds, total: ordered.length, completed, pending: 0, errors: 0, status: 'synced' });
  }
}

export function syncWorkspaceQueues(workspaceIds: string | string[]) {
  const ids = [...new Set(Array.isArray(workspaceIds) ? workspaceIds : [workspaceIds])].filter(Boolean).sort();
  const key = ids.join(',');
  const existing = workspaceSyncs.get(key);
  if (existing) return existing;
  // Coalesce calls from AuthProvider, app startup, and the browser online
  // event. They must share one pass instead of showing repeated sync cycles.
  const next = activeSync.then(() => flushWorkspaceQueues(ids), () => flushWorkspaceQueues(ids));
  activeSync = next.catch(() => undefined);
  workspaceSyncs.set(key, next);
  void next.then(() => { if (workspaceSyncs.get(key) === next) workspaceSyncs.delete(key); }, () => { if (workspaceSyncs.get(key) === next) workspaceSyncs.delete(key); });
  return next;
}

export const syncQueue = (workspaceId: string) => syncWorkspaceQueues(workspaceId);
