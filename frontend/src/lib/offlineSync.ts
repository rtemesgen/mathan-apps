import { supabase } from './supabase';
import { getQueuedMutations, replaceQueue, type QueuedMutation } from './syncQueue';
import { offlineStore } from './localStore';
import { reportPersistenceNotice } from './repositories/types';
import { emitSyncConflict, emitSyncProgress, emitSyncStatus, type SyncStatus } from './toast';

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

const permanentError = (error: { code?: string; message?: string } | null | undefined) => {
  const code = error?.code ?? '';
  return ['42501', '23505', '23503', '23514', 'PGRST116', 'PGRST202'].includes(code) || /permission|forbidden|validation|invalid|does not exist|not found/i.test(error?.message ?? '');
};
const wait = (attempt: number) => new Promise((resolve) => window.setTimeout(resolve, Math.min(30000, 500 * (2 ** Math.min(attempt, 6)) + Math.random() * 400)));

/** Apply a Truck row directly while the app is online. Offline writes use the
 * queue below; online writes should not create a needless queue round-trip. */
export async function writeTruckMutationOnline(workspaceId: string, table: string, payload: Record<string, unknown>) {
  if (!['trucks', 'truck_owners', 'truck_customers', 'truck_transactions'].includes(table)) throw new Error('Unsupported Truck table');
  const row = { ...payload };
  delete row.workspace_id;
  const id = String(row.id ?? '');
  delete row.id;
  const result = row.deleted_at
    ? await supabase.from(table).update(row).eq('workspace_id', workspaceId).eq('id', id)
    : await supabase.from(table).upsert({ id, workspace_id: workspaceId, ...row }, { onConflict: 'id' });
  if (result.error) throw result.error;
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
  const ordered = queue.filter((mutation) => allowed.has(mutation.companyId || String(mutation.payload.workspace_id ?? ''))).sort((a, b) => {
    const rank = (item: QueuedMutation) => item.entityType.includes('transaction') || item.table.includes('transaction') ? 3 : item.entityType.includes('owner') || item.entityType.includes('membership') ? 2 : 1;
    return rank(a) - rank(b) || a.queuedAt.localeCompare(b.queuedAt);
  });
  if (ordered.length === 0) return;
  report('syncing');
  emitSyncProgress({ workspaceId: Array.isArray(workspaceIds) ? undefined : workspaceIds, total: ordered.length, completed: 0, pending: ordered.length, errors: ordered.filter((item) => item.syncStatus === 'error' || item.syncStatus === 'conflicted').length, status: 'syncing' });

  for (const mutation of queue) {
    const workspaceId = mutation.companyId || String(mutation.payload.workspace_id ?? '');
    if (!allowed.has(workspaceId)) { remaining.push(mutation); continue; }
  }
  let completed = 0;
  let errors = 0;
  for (const mutation of ordered) {
    const workspaceId = mutation.companyId || String(mutation.payload.workspace_id ?? '');
    try {
    if (mutation.table !== 'app_state_snapshots') {
      if (!['trucks', 'truck_owners', 'truck_customers', 'truck_transactions'].includes(mutation.table)) { remaining.push(mutation); continue; }
      try {
        await writeTruckMutationOnline(workspaceId, mutation.table, mutation.payload);
      } catch (reason) {
        const error = reason as { code?: string; message?: string };
        if (permanentError(error)) { errors += 1; reportTruckMutationStatus('sync conflict'); remaining.push({ ...mutation, syncStatus: 'error', lastError: error.message ?? 'Truck synchronization failed' }); }
        else { reportTruckMutationStatus('sync pending'); failed = true; remaining.push({ ...mutation, syncStatus: 'retrying', retryCount: mutation.retryCount + 1, lastError: error.message ?? 'Truck synchronization failed' }); }
      }
      completed += 1;
      emitSyncProgress({ workspaceId: Array.isArray(workspaceIds) ? undefined : workspaceIds, total: ordered.length, completed, pending: ordered.length - completed, errors, status: failed ? 'retry' : 'syncing' });
      continue;
    }
    const { data, error } = await supabase.rpc('write_app_state_snapshot', {
      target_workspace: workspaceId,
      target_domain: mutation.payload.domain,
      expected_revision: mutation.payload.expected_revision ?? 0,
      target_payload: mutation.payload.payload,
      audit_action: mutation.payload.audit_action ?? 'snapshot_written_offline',
      affected_client_ids: mutation.payload.affected_client_ids ?? [],
      mutation_id: mutation.mutationId,
    });
    const result = (data as Array<{ status: string; revision: number; payload: unknown }> | null)?.[0];
    if (result?.status === 'conflict') {
      conflict = true;
      remaining.push({ ...mutation, syncStatus: 'conflicted', lastError: 'Remote revision changed' });
      reportSnapshotMutationStatus(mutation.payload.domain, 'sync conflict');
      emitSyncConflict({ domain: String(mutation.payload.domain ?? ''), remote: result.payload, revision: result.revision, mutationId: mutation.mutationId });
    } else if (error || !result) {
      if (permanentError(error)) { errors += 1; reportSnapshotMutationStatus(mutation.payload.domain, 'sync conflict'); remaining.push({ ...mutation, syncStatus: 'error', lastError: error?.message ?? 'Synchronization failed' }); }
      else { reportSnapshotMutationStatus(mutation.payload.domain, 'sync pending'); failed = true; remaining.push({ ...mutation, syncStatus: 'retrying', retryCount: mutation.retryCount + 1, lastError: error?.message ?? 'Synchronization failed' }); }
    } else if (result.status === 'written' && result.payload !== undefined) {
      const storageKey = `${mutation.userId}:${workspaceId}:${String(mutation.payload.domain ?? mutation.entityId)}`;
      await offlineStore.write(storageKey, result.payload);
      await offlineStore.write(`${storageKey}:revision`, result.revision);
    }
    } catch (error) {
      if (mutation.table !== 'app_state_snapshots') reportTruckMutationStatus('sync pending');
      else reportSnapshotMutationStatus(mutation.payload.domain, 'sync pending');
      failed = true;
      remaining.push({ ...mutation, syncStatus: 'retrying', retryCount: mutation.retryCount + 1, lastError: error instanceof Error ? error.message : 'Synchronization failed' });
    }
    completed += 1;
    emitSyncProgress({ workspaceId: Array.isArray(workspaceIds) ? undefined : workspaceIds, total: ordered.length, completed, pending: ordered.length - completed, errors, status: failed ? 'retry' : 'syncing' });
  }

  await replaceQueue(remaining, ordered.map((mutation) => mutation.mutationId));
  if (conflict) { report('conflicted', remaining.length, { conflictCount: remaining.filter((item) => item.syncStatus === 'conflicted').length }); emitSyncProgress({ workspaceId: Array.isArray(workspaceIds) ? undefined : workspaceIds, total: ordered.length, completed, pending: remaining.length, errors, status: 'conflicted' }); }
  else if (failed || remaining.some((mutation) => allowed.has(mutation.companyId || String(mutation.payload.workspace_id ?? '')))) { report('retry', remaining.length); emitSyncProgress({ workspaceId: Array.isArray(workspaceIds) ? undefined : workspaceIds, total: ordered.length, completed, pending: remaining.length, errors, status: 'retry' }); }
  else {
    const lastSyncedAt = new Date().toISOString();
    await Promise.all([...allowed].map((companyId) => offlineStore.writeMetadata(`sync:${companyId}`, { lastSyncedAt, pendingCount: 0, conflictCount: 0 })));
    report('synced', 0, { lastSyncedAt, pendingCount: 0, conflictCount: 0 });
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
