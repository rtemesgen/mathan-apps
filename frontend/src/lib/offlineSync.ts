import { supabase } from './supabase';
import { getQueuedMutations, replaceQueue, type QueuedMutation } from './syncQueue';

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'retry' | 'conflict';

function report(status: SyncStatus, queued?: number) {
  window.dispatchEvent(new CustomEvent('mathan:sync-status', { detail: { status, queued } }));
}

/** Flush queued changes for one or more workspaces in a single pass. */
let activeSync: Promise<void> = Promise.resolve();

async function flushWorkspaceQueues(workspaceIds: string | string[]) {
  if (!navigator.onLine) { report('offline'); return; }
  const allowed = new Set(Array.isArray(workspaceIds) ? workspaceIds : [workspaceIds]);
  if (!allowed.size) return;
  report('syncing');
  const queue = await getQueuedMutations();
  const remaining: QueuedMutation[] = [];
  let conflict = false;

  for (const mutation of queue) {
    const workspaceId = String(mutation.payload.workspace_id ?? '');
    if (!allowed.has(workspaceId)) { remaining.push(mutation); continue; }
    if (mutation.table !== 'app_state_snapshots') {
      if (!['trucks', 'truck_owners', 'truck_transactions'].includes(mutation.table)) { remaining.push(mutation); continue; }
      const row = { ...mutation.payload }; delete row.workspace_id;
      const id = String(row.id ?? ''); delete row.id;
      const result = row.deleted_at
        ? await supabase.from(mutation.table).update(row).eq('workspace_id', workspaceId).eq('id', id)
        : await supabase.from(mutation.table).upsert({ id, workspace_id: workspaceId, ...row }, { onConflict: 'id' });
      if (result.error) remaining.push(mutation);
      continue;
    }
    const { data, error } = await supabase.rpc('write_app_state_snapshot', {
      target_workspace: workspaceId,
      target_domain: mutation.payload.domain,
      expected_revision: mutation.payload.expected_revision ?? 0,
      target_payload: mutation.payload.payload,
      audit_action: mutation.payload.audit_action ?? 'snapshot_written_offline',
      affected_client_ids: mutation.payload.affected_client_ids ?? [],
    });
    const result = (data as Array<{ status: string; revision: number; payload: unknown }> | null)?.[0];
    if (result?.status === 'conflict') {
      conflict = true;
      window.dispatchEvent(new CustomEvent('mathan:sync-conflict', { detail: { domain: mutation.payload.domain, remote: result.payload, revision: result.revision } }));
    } else if (error || !result) remaining.push(mutation);
  }

  await replaceQueue(remaining);
  if (conflict) report('conflict');
  else if (remaining.some((mutation) => allowed.has(String(mutation.payload.workspace_id ?? '')))) report('retry', remaining.length);
  else report('synced');
}

export function syncWorkspaceQueues(workspaceIds: string | string[]) {
  const next = activeSync.then(() => flushWorkspaceQueues(workspaceIds), () => flushWorkspaceQueues(workspaceIds));
  activeSync = next.catch(() => undefined);
  return next;
}

export const syncQueue = (workspaceId: string) => syncWorkspaceQueues(workspaceId);
