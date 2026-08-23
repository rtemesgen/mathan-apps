import { createClient } from 'npm:@supabase/supabase-js@2';

const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const url = Deno.env.get('SUPABASE_URL') ?? '';
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false, autoRefreshToken: false } });

async function removeWorkspaceFiles(workspaceId: string) {
  const { data: files } = await service.from('record_attachments').select('storage_path').eq('workspace_id', workspaceId);
  if (files?.length) await service.storage.from('workspace-attachments').remove(files.map((file) => file.storage_path));
}

async function cleanupTrash() {
  const cutoff = new Date(Date.now() - 30 * 24 * 3600000).toISOString();
  const removed: Record<string, number> = {};
  for (const table of ['cash_transactions', 'cash_books', 'employees', 'payroll_transactions', 'salary_changes', 'record_attachments', 'workspace_invitations'] as const) {
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
  for (const request of requests ?? []) {
    const { data: owned } = await service.from('workspace_members').select('workspace_id').eq('user_id', request.user_id).eq('role', 'owner');
    if (request.delete_owned_workspaces) {
      for (const workspace of owned ?? []) { await removeWorkspaceFiles(workspace.workspace_id); await service.from('workspaces').delete().eq('id', workspace.workspace_id); }
    } else if ((owned ?? []).length) {
      await service.from('account_deletion_requests').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('user_id', request.user_id);
      continue;
    }
    const { error: authError } = await service.auth.admin.deleteUser(request.user_id, false);
    if (authError) continue;
    await service.from('account_deletion_requests').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('user_id', request.user_id);
    completed.push(request.user_id);
  }
  return completed;
}

async function processWorkspaceDeletions() {
  const { data: workspaces, error } = await service.rpc('list_expired_workspace_deletions', { target_limit: 100 });
  if (error) throw error;
  const removed: string[] = [];
  for (const row of (workspaces ?? []) as Array<{ workspace_id: string }>) {
    await removeWorkspaceFiles(row.workspace_id);
    const { error: deleteError } = await service.from('workspaces').delete().eq('id', row.workspace_id);
    if (!deleteError) removed.push(row.workspace_id);
  }
  return removed;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const expected = Deno.env.get('LIFECYCLE_CRON_SECRET') ?? '';
  if (!expected || request.headers.get('x-lifecycle-secret') !== expected) return json({ error: 'Unauthorized.' }, 401);
  try {
    const [deleted, trash, workspaces] = await Promise.all([processDeletions(), cleanupTrash(), processWorkspaceDeletions()]);
    return json({ ok: true, deleted_accounts: deleted, deleted_workspaces: workspaces, trash });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Lifecycle processing failed.' }, 500); }
});
