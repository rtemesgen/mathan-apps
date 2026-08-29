import { createClient } from 'npm:@supabase/supabase-js@2';

const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const url = Deno.env.get('SUPABASE_URL') ?? '';
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false, autoRefreshToken: false } });

async function removeWorkspaceFiles(workspaceId: string) {
  const { data: files, error } = await service.from('record_attachments').select('storage_path').eq('workspace_id', workspaceId);
  if (error) throw error;
  if (files?.length) {
    const { error: storageError } = await service.storage.from('workspace-attachments').remove(files.map((file) => file.storage_path));
    if (storageError) throw storageError;
  }
}

async function cleanupTrash() {
  const cutoff = new Date(Date.now() - 30 * 24 * 3600000).toISOString();
  const removed: Record<string, number> = {};
  for (const table of ['truck_transactions', 'truck_customers', 'truck_owners', 'trucks', 'cash_transactions', 'cash_books', 'employees', 'payroll_transactions', 'salary_changes', 'record_attachments', 'workspace_invitations'] as const) {
    if (table === 'record_attachments') {
      const { data } = await service.from(table).select('storage_path').lt('deleted_at', cutoff);
      if (data?.length) await service.storage.from('workspace-attachments').remove(data.map((file) => file.storage_path));
    }
    const { data, error } = await service.from(table).delete().lt('deleted_at', cutoff).select('id');
    if (!error) removed[table] = data?.length ?? 0;
  }
  return removed;
}

async function processDeletions() {
  const { data: requests, error } = await service.from('account_deletion_requests').select('user_id,delete_owned_workspaces').eq('status', 'pending').lte('scheduled_for', new Date().toISOString()).limit(100);
  if (error) throw error;
  const completed: string[] = [];
  const failed: Array<{ user_id: string; error: string }> = [];
  for (const request of requests ?? []) {
    const { data: owned, error: ownedError } = await service.from('workspace_members').select('workspace_id').eq('user_id', request.user_id).eq('role', 'owner');
    if (ownedError) { failed.push({ user_id: request.user_id, error: ownedError.message }); continue; }
    if (request.delete_owned_workspaces) {
      let workspaceFailure = '';
      for (const workspace of owned ?? []) {
        try {
          await removeWorkspaceFiles(workspace.workspace_id);
          const { error: deleteError } = await service.from('workspaces').delete().eq('id', workspace.workspace_id);
          if (deleteError) throw deleteError;
        } catch (reason) {
          workspaceFailure = reason instanceof Error ? reason.message : 'Owned company cleanup failed';
          break;
        }
      }
      if (workspaceFailure) { failed.push({ user_id: request.user_id, error: workspaceFailure }); continue; }
    } else if ((owned ?? []).length) {
      await service.from('account_deletion_requests').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('user_id', request.user_id);
      continue;
    }
    const { error: authError } = await service.auth.admin.deleteUser(request.user_id, false);
    if (authError) { failed.push({ user_id: request.user_id, error: authError.message }); continue; }
    await service.from('account_deletion_requests').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('user_id', request.user_id);
    completed.push(request.user_id);
  }
  return { completed, failed };
}

async function processWorkspaceDeletions() {
  const { data: workspaces, error } = await service.rpc('list_expired_workspace_deletions', { target_limit: 100 });
  if (error) throw error;
  const removed: string[] = [];
  const failed: Array<{ workspace_id: string; error: string }> = [];
  for (const row of (workspaces ?? []) as Array<{ workspace_id: string }>) {
    try {
      await removeWorkspaceFiles(row.workspace_id);
      const { error: deleteError } = await service.from('workspaces').delete().eq('id', row.workspace_id);
      if (deleteError) throw deleteError;
      removed.push(row.workspace_id);
    } catch (reason) {
      failed.push({ workspace_id: row.workspace_id, error: reason instanceof Error ? reason.message : 'Company cleanup failed' });
    }
  }
  return { removed, failed };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const expected = Deno.env.get('LIFECYCLE_CRON_SECRET') ?? '';
  if (!expected || request.headers.get('x-lifecycle-secret') !== expected) return json({ error: 'Unauthorized.' }, 401);
  try {
    const trash = await cleanupTrash();
    const workspaces = await processWorkspaceDeletions();
    const accounts = await processDeletions();
    return json({ ok: true, deleted_accounts: accounts.completed, failed_accounts: accounts.failed, deleted_workspaces: workspaces.removed, failed_workspaces: workspaces.failed, trash });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Lifecycle processing failed.' }, 500); }
});
