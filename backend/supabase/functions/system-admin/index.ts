import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const url = Deno.env.get('SUPABASE_URL') ?? '';
const publishableKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

type Body = Record<string, unknown> & { action?: string };

function text(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
function integer(value: unknown, fallback: number, maximum = 250) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(0, Math.min(parsed, maximum)) : fallback;
}

async function getAllUsers(client: SupabaseClient) {
  const users: User[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email ?? '',
    phone: user.phone ?? '',
    display_name: String(user.user_metadata?.name ?? user.user_metadata?.display_name ?? ''),
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at ?? null,
    banned_until: user.banned_until ?? null,
  };
}

async function audit(actorId: string, action: string, result: 'success' | 'failure', details: {
  targetUserId?: string | null;
  targetWorkspaceId?: string | null;
  previous?: unknown;
  next?: unknown;
  error?: string;
} = {}) {
  await admin.from('system_admin_audit_events').insert({
    actor_id: actorId,
    action,
    target_user_id: details.targetUserId ?? null,
    target_workspace_id: details.targetWorkspaceId ?? null,
    result,
    previous_data: details.previous ?? null,
    next_data: details.next ?? null,
    error_message: details.error?.slice(0, 1000) ?? null,
  });
}

async function notifyUser(userId: string, type: string, title: string, body: string, route?: string) {
  await admin.from('notifications').insert({ user_id: userId, notification_type: type, title, body, route: route ?? null });
}

async function ensureBootstrap(user: User) {
  const allowed = (Deno.env.get('ADMIN_BOOTSTRAP_EMAILS') ?? '')
    .split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (user.email && user.email_confirmed_at && allowed.includes(user.email.toLowerCase())) {
    await admin.from('system_admins').upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true });
  }
}

async function isAdmin(userId: string) {
  const { data } = await admin.from('system_admins').select('user_id').eq('user_id', userId).maybeSingle();
  return Boolean(data);
}

async function requireAdminTargetSafety(actor: User, targetUserId: string) {
  if (!targetUserId) throw new Error('A target user is required.');
  if (targetUserId === actor.id) throw new Error('You cannot suspend, block, or delete your own administrator account.');
  const { data: targetAdmin } = await admin.from('system_admins').select('user_id').eq('user_id', targetUserId).maybeSingle();
  if (targetAdmin) {
    const { count } = await admin.from('system_admins').select('*', { count: 'exact', head: true });
    if ((count ?? 0) <= 1) throw new Error('The final system administrator cannot be disabled or deleted.');
  }
}

async function workspaceMemberships(userIds?: string[]) {
  let query = admin.from('workspace_members').select('workspace_id,user_id,role');
  if (userIds?.length) query = query.in('user_id', userIds);
  const { data: members, error } = await query;
  if (error) throw error;
  const workspaceIds = [...new Set((members ?? []).map((row) => row.workspace_id))];
  const { data: workspaces } = workspaceIds.length
    ? await admin.from('workspaces').select('id,name,accent_color,created_by,created_at,updated_at').in('id', workspaceIds)
    : { data: [] as Array<Record<string, unknown>> };
  const { data: permissions } = workspaceIds.length
    ? await admin.from('workspace_member_app_permissions').select('workspace_id,user_id,app_id,permission').in('workspace_id', workspaceIds)
    : { data: [] as Array<Record<string, unknown>> };
  const workspaceById = new Map((workspaces ?? []).map((row) => [row.id, row]));
  return (members ?? []).map((member) => ({
    ...member,
    workspace: workspaceById.get(member.workspace_id) ?? null,
    permissions: (permissions ?? []).filter((permission) => permission.workspace_id === member.workspace_id && permission.user_id === member.user_id),
  }));
}

async function listUsers(body: Body) {
  const page = Math.max(1, integer(body.page, 1, 10000));
  const perPage = Math.max(10, integer(body.per_page, 25, 100));
  const query = text(body.query).toLowerCase();
  const all = await getAllUsers(admin);
  const filtered = query ? all.filter((user) => `${user.email ?? ''} ${user.phone ?? ''} ${user.user_metadata?.name ?? ''}`.toLowerCase().includes(query)) : all;
  const selected = filtered.slice((page - 1) * perPage, page * perPage);
  const ids = selected.map((user) => user.id);
  const [{ data: controls }, { data: systemAdmins }, { data: deletionRequests }, memberships] = await Promise.all([
    ids.length ? admin.from('system_user_controls').select('*').in('user_id', ids) : Promise.resolve({ data: [] }),
    ids.length ? admin.from('system_admins').select('user_id').in('user_id', ids) : Promise.resolve({ data: [] }),
    ids.length ? admin.from('account_deletion_requests').select('user_id,status,scheduled_for,request_source,delete_owned_workspaces').in('user_id', ids) : Promise.resolve({ data: [] }),
    workspaceMemberships(ids),
  ]);
  return {
    users: selected.map((user) => ({
      ...publicUser(user),
      status: (() => { const control = (controls ?? []).find((row) => row.user_id === user.id); return control?.status === 'suspended' && control.suspended_until && new Date(control.suspended_until).getTime() <= Date.now() ? 'active' : control?.status ?? (user.banned_until ? 'blocked' : 'active'); })(),
      suspended_until: (controls ?? []).find((row) => row.user_id === user.id)?.suspended_until ?? null,
      is_system_admin: (systemAdmins ?? []).some((row) => row.user_id === user.id),
      deletion_request: (deletionRequests ?? []).find((row) => row.user_id === user.id && row.status === 'pending') ?? null,
      memberships: memberships.filter((membership) => membership.user_id === user.id),
    })),
    page,
    per_page: perPage,
    total: filtered.length,
  };
}

async function overview() {
  const users = await getAllUsers(admin);
  const [{ count: workspaceCount }, { count: snapshotCount }, { data: latestSnapshot }, { data: controls }, { data: recentAudit }, { data: latestBackup }, { data: attachments }, { count: pendingApprovals }, { count: failedActions }] = await Promise.all([
    admin.from('workspaces').select('*', { count: 'exact', head: true }),
    admin.from('app_state_snapshots').select('*', { count: 'exact', head: true }),
    admin.from('app_state_snapshots').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('system_user_controls').select('status'),
    admin.from('system_admin_audit_events').select('id,action,result,created_at,target_user_id,target_workspace_id').order('created_at', { ascending: false }).limit(8),
    admin.from('system_backup_runs').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('record_attachments').select('size_bytes'),
    admin.from('approval_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('system_admin_audit_events').select('*', { count: 'exact', head: true }).eq('result', 'failure').gte('created_at', new Date(Date.now() - 24 * 3600000).toISOString()),
  ]);
  const suspended = (controls ?? []).filter((row) => row.status === 'blocked' || (row.status === 'suspended' && row.suspended_until && new Date(row.suspended_until).getTime() > Date.now())).length;
  const { data: appPermissions } = await admin.from('workspace_member_app_permissions').select('app_id,permission');
  const latestBackupAt = latestBackup?.completed_at ?? latestBackup?.created_at ?? null;
  const backupAge = latestBackupAt ? Date.now() - new Date(latestBackupAt).getTime() : Number.POSITIVE_INFINITY;
  const storageBytes = (attachments ?? []).reduce((total, row) => total + Number(row.size_bytes ?? 0), 0);
  const alerts = [
    ...(backupAge > 24 * 3600000 ? [{ type: 'backup_stale', severity: 'warning', message: 'No completed backup in the last 24 hours.' }] : []),
    ...((failedActions ?? 0) >= 5 ? [{ type: 'privileged_failures', severity: 'critical', message: `${failedActions} privileged operations failed in the last 24 hours.` }] : []),
    ...((storageBytes >= 5 * 1024 ** 3) ? [{ type: 'storage_pressure', severity: 'warning', message: 'Attachment storage has reached the 5 GB warning threshold.' }] : []),
    ...((pendingApprovals ?? 0) >= 20 ? [{ type: 'approval_backlog', severity: 'warning', message: `${pendingApprovals} approval requests are waiting for review.` }] : []),
  ];
  return {
    users: { total: users.length, active: Math.max(0, users.length - suspended), suspended },
    workspaces: workspaceCount ?? 0,
    snapshots: snapshotCount ?? 0,
    snapshot_freshness: latestSnapshot?.updated_at ?? null,
    storage_bytes: storageBytes,
    app_access: {
      book: (appPermissions ?? []).filter((row) => row.app_id === 'book' && row.permission !== 'none').length,
      payroll: (appPermissions ?? []).filter((row) => row.app_id === 'payroll' && row.permission !== 'none').length,
      truck: (appPermissions ?? []).filter((row) => row.app_id === 'truck' && row.permission !== 'none').length,
    },
    recent_audit: recentAudit ?? [],
    latest_backup: latestBackup ?? null,
    pending_approvals: pendingApprovals ?? 0,
    failed_actions_24h: failedActions ?? 0,
    health: { database: 'ok', backup: latestBackupAt ? (backupAge <= 24 * 3600000 ? 'fresh' : 'stale') : 'missing', storage: storageBytes >= 5 * 1024 ** 3 ? 'warning' : 'ok' },
    alerts,
  };
}

async function listWorkspaces(body: Body) {
  const page = Math.max(1, integer(body.page, 1, 10000));
  const perPage = Math.max(5, integer(body.per_page, 20, 100));
  const queryText = text(body.query);
  let query = admin.from('workspaces').select('id,name,accent_color,created_by,created_at,updated_at,deletion_status,deletion_scheduled_for,deletion_origin,deletion_subject_user_id', { count: 'exact' }).order('created_at', { ascending: false });
  if (queryText) query = query.ilike('name', `%${queryText.replace(/[%_]/g, '')}%`);
  const { data: workspaces, count, error } = await query.range((page - 1) * perPage, page * perPage - 1);
  if (error) throw error;
  const ids = (workspaces ?? []).map((workspace) => workspace.id);
  const [{ data: members }, { data: apps }, { data: permissions }, users] = await Promise.all([
    ids.length ? admin.from('workspace_members').select('workspace_id,user_id,role,created_at').in('workspace_id', ids) : Promise.resolve({ data: [] }),
    ids.length ? admin.from('workspace_apps').select('workspace_id,app_id,enabled').in('workspace_id', ids) : Promise.resolve({ data: [] }),
    ids.length ? admin.from('workspace_member_app_permissions').select('workspace_id,user_id,app_id,permission').in('workspace_id', ids) : Promise.resolve({ data: [] }),
    getAllUsers(admin),
  ]);
  const userById = new Map(users.map((user) => [user.id, publicUser(user)]));
  return {
    workspaces: (workspaces ?? []).map((workspace) => ({
      ...workspace,
      apps: (apps ?? []).filter((app) => app.workspace_id === workspace.id),
      members: (members ?? []).filter((member) => member.workspace_id === workspace.id).map((member) => ({
        ...member,
        user: userById.get(member.user_id) ?? { id: member.user_id, email: 'Deleted account' },
        permissions: member.role === 'owner' ? [{ app_id: 'book', permission: 'edit' }, { app_id: 'payroll', permission: 'edit' }, { app_id: 'truck', permission: 'edit' }] : (permissions ?? []).filter((permission) => permission.workspace_id === workspace.id && permission.user_id === member.user_id),
      })),
    })),
    page,
    per_page: perPage,
    total: count ?? 0,
  };
}

const backupResources = ['profiles', 'workspaces', 'members', 'apps', 'permissions', 'snapshots', 'audit_events', 'system_audit_events', 'backup_runs', 'invitations', 'attachments', 'attachment_links', 'notifications', 'approvals', 'trucks', 'truck_owners', 'truck_customers', 'truck_transactions'] as const;
type BackupResource = typeof backupResources[number] | 'users';

async function backupResource(actorId: string, runId: string, resource: BackupResource, offset: number, limit: number) {
  const { data: run } = await admin.from('system_backup_runs').select('id').eq('id', runId).eq('requested_by', actorId).eq('status', 'started').gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()).maybeSingle();
  if (!run) throw new Error('This backup operation has expired. Start a new backup.');
  if (resource === 'users') {
    const users = await getAllUsers(admin);
    return { rows: users.slice(offset, offset + limit).map(publicUser), done: offset + limit >= users.length, total: users.length };
  }
  const config: Record<Exclude<BackupResource, 'users'>, { table: string; columns: string }> = {
    profiles: { table: 'workspace_profiles', columns: 'user_id,display_name,phone,updated_at' },
    workspaces: { table: 'workspaces', columns: 'id,name,accent_color,created_by,created_at,updated_at' },
    members: { table: 'workspace_members', columns: 'workspace_id,user_id,role,created_at' },
    apps: { table: 'workspace_apps', columns: 'workspace_id,app_id,enabled,updated_at' },
    permissions: { table: 'workspace_member_app_permissions', columns: 'workspace_id,user_id,app_id,permission,updated_at' },
    snapshots: { table: 'app_state_snapshots', columns: 'workspace_id,domain,payload,revision,updated_at' },
    audit_events: { table: 'audit_events', columns: 'id,workspace_id,actor_id,record_type,record_id,action,previous_data,next_data,created_at' },
    system_audit_events: { table: 'system_admin_audit_events', columns: 'id,actor_id,action,target_user_id,target_workspace_id,result,previous_data,next_data,error_message,created_at' },
    backup_runs: { table: 'system_backup_runs', columns: 'id,requested_by,backup_kind,status,record_count,attachment_count,size_bytes,checksum,created_at,completed_at' },
    invitations: { table: 'workspace_invitations', columns: 'id,workspace_id,email,invited_by,book_permission,payroll_permission,truck_permission,status,expires_at,accepted_by,created_at,accepted_at' },
    attachments: { table: 'record_attachments', columns: 'id,workspace_id,record_type,record_id,storage_path,file_name,mime_type,size_bytes,created_at' },
    attachment_links: { table: 'cash_transaction_attachments', columns: 'cash_transaction_id,attachment_id' },
    notifications: { table: 'notifications', columns: 'id,user_id,workspace_id,notification_type,title,body,route,metadata,read_at,created_at' },
    approvals: { table: 'approval_requests', columns: 'id,workspace_id,requester_id,approver_id,action_type,target_record_type,target_record_id,reason,metadata,status,decision_comment,created_at,decided_at,expires_at' },
    trucks: { table: 'trucks', columns: 'id,workspace_id,name,unit_number,make_model,vin,cash_on_hand,license_plate,deleted_at,created_at,updated_at' },
    truck_owners: { table: 'truck_owners', columns: 'id,workspace_id,truck_id,user_id,name,start_date,equity_percentage,monthly_draw_rate,avatar_color,deleted_at,created_at,updated_at' },
    truck_customers: { table: 'truck_customers', columns: 'id,workspace_id,truck_id,name,phone,address,notes,deleted_at,created_at,updated_at' },
    truck_transactions: { table: 'truck_transactions', columns: 'id,workspace_id,truck_id,owner_id,customer_id,occurred_on,transaction_type,category,amount,description,reference_no,counterparty_type,counterparty_name,settles_transaction_id,deleted_at,created_at,updated_at' },
  };
  const item = config[resource as Exclude<BackupResource, 'users'>];
  if (!item) throw new Error('Unsupported backup resource.');
  const { data, count, error } = await admin.from(item.table).select(item.columns, { count: 'exact' }).range(offset, offset + limit - 1);
  if (error) throw error;
  let rows: Array<Record<string, unknown>> = (data ?? []) as Array<Record<string, unknown>>;
  if (resource === 'attachments') {
    rows = await Promise.all(rows.map(async (row) => {
      const { data: signed, error: signError } = await admin.storage.from('workspace-attachments').createSignedUrl(String(row.storage_path), 600);
      return { ...row, signed_url: signError ? null : signed.signedUrl };
    }));
  }
  return { rows, done: offset + rows.length >= (count ?? 0), total: count ?? 0 };
}

async function startBackup(actorId: string, kind: 'automatic' | 'manual') {
  const users = await getAllUsers(admin);
  const counts: Record<string, number> = { users: users.length };
  for (const resource of backupResources) {
    const table = ({ profiles: 'workspace_profiles', workspaces: 'workspaces', members: 'workspace_members', apps: 'workspace_apps', permissions: 'workspace_member_app_permissions', snapshots: 'app_state_snapshots', audit_events: 'audit_events', system_audit_events: 'system_admin_audit_events', backup_runs: 'system_backup_runs', invitations: 'workspace_invitations', attachments: 'record_attachments', attachment_links: 'cash_transaction_attachments', notifications: 'notifications', approvals: 'approval_requests', trucks: 'trucks', truck_owners: 'truck_owners', truck_customers: 'truck_customers', truck_transactions: 'truck_transactions' } as const)[resource];
    const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true });
    if (error) throw error;
    counts[resource] = count ?? 0;
  }
  const { data, error } = await admin.from('system_backup_runs').insert({ requested_by: actorId, backup_kind: kind, status: 'started' }).select('id,created_at').single();
  if (error) throw error;
  return { run: data, schema_version: '2', counts, resources: ['users', ...backupResources] };
}

async function finishBackup(actorId: string, body: Body) {
  const runId = text(body.run_id);
  const status = body.status === 'cancelled' || body.status === 'failed' ? body.status : 'completed';
  if (status === 'completed' && !/^[a-f0-9]{64}$/.test(text(body.checksum))) throw new Error('A verified backup checksum is required.');
  const { data: updated, error } = await admin.from('system_backup_runs').update({
    status,
    record_count: Number(body.record_count ?? 0),
    attachment_count: Number(body.attachment_count ?? 0),
    size_bytes: Number(body.size_bytes ?? 0),
    checksum: text(body.checksum) || null,
    error_message: text(body.error_message).slice(0, 1000) || null,
    completed_at: new Date().toISOString(),
  }).eq('id', runId).eq('requested_by', actorId).eq('status', 'started').select('id').maybeSingle();
  if (error) throw error;
  if (!updated) throw new Error('This backup run is no longer active.');
  await audit(actorId, 'backup_finished', status === 'completed' ? 'success' : 'failure', { next: { run_id: runId, status } });
  await notifyUser(actorId, status === 'completed' ? 'backup_completed' : 'backup_failed', status === 'completed' ? 'Backup completed' : 'Backup failed', status === 'completed' ? 'Your encrypted administrator backup was verified and saved.' : `The administrator backup could not be completed: ${text(body.error_message) || 'unknown error'}.`, '/admin');
  return { ok: true };
}

async function requireRestoreOperation(actorId: string, operationId: string) {
  const { data } = await admin.from('system_restore_operations').select('id').eq('id', operationId).eq('requested_by', actorId).eq('status', 'started').gt('expires_at', new Date().toISOString()).maybeSingle();
  if (!data) throw new Error('This recovery operation has expired. Verify the backup again.');
}

async function startRestore(actorId: string) {
  const { data, error } = await admin.from('system_restore_operations').insert({ requested_by: actorId }).select('id,expires_at').single();
  if (error) throw error;
  await audit(actorId, 'restore_started', 'success', { next: { operation_id: data.id } });
  return { operation_id: data.id, expires_at: data.expires_at };
}

async function restoreWorkspaceChunk(actorId: string, body: Body) {
  const operationId = text(body.operation_id);
  await requireRestoreOperation(actorId, operationId);
  const payload = body.workspace_backup as Record<string, unknown> | undefined;
  const sourceWorkspace = payload?.workspace as Record<string, unknown> | undefined;
  const sourceId = text(sourceWorkspace?.id);
  if (!payload || !sourceId || !Array.isArray(payload.snapshots)) throw new Error('Incomplete workspace recovery chunk.');
  const { data: existing } = await admin.from('system_restore_workspaces').select('target_workspace_id').eq('operation_id', operationId).eq('source_workspace_id', sourceId).maybeSingle();
  if (existing) return { source_workspace_id: sourceId, workspace_id: existing.target_workspace_id, missing_users: [] };
  const recoveryName = `${text(sourceWorkspace?.name) || 'Recovered company'} (Recovered ${new Date().toISOString().slice(0, 10)})`.slice(0, 120);
  const { data: newId, error } = await admin.rpc('system_admin_restore_workspace', { target_admin: actorId, target_backup: payload, target_name: recoveryName });
  if (error) throw error;
  const { error: mapError } = await admin.from('system_restore_workspaces').insert({ operation_id: operationId, source_workspace_id: sourceId, target_workspace_id: newId });
  if (mapError) throw mapError;
  const existingUsers = await getAllUsers(admin);
  const existingEmails = new Set(existingUsers.map((user) => user.email?.toLowerCase()).filter(Boolean));
  const missingUsers = (payload.members as Array<Record<string, unknown>>).map((member) => text(member.email).toLowerCase()).filter((email) => email && !existingEmails.has(email));
  return { source_workspace_id: sourceId, workspace_id: String(newId), name: recoveryName, missing_users: [...new Set(missingUsers)] };
}

async function prepareRestoreAttachment(actorId: string, body: Body) {
  const operationId = text(body.operation_id); const sourceWorkspaceId = text(body.source_workspace_id);
  await requireRestoreOperation(actorId, operationId);
  const { data: mapping } = await admin.from('system_restore_workspaces').select('target_workspace_id').eq('operation_id', operationId).eq('source_workspace_id', sourceWorkspaceId).maybeSingle();
  if (!mapping) throw new Error('Restore the attachment workspace before uploading its files.');
  const safeName = text(body.file_name).replace(/[^a-zA-Z0-9._-]+/g, '_') || 'attachment';
  const path = `${mapping.target_workspace_id}/recovered/${crypto.randomUUID()}-${safeName}`;
  const { data, error } = await admin.storage.from('workspace-attachments').createSignedUploadUrl(path);
  if (error) throw error;
  return { path, token: data.token, target_workspace_id: mapping.target_workspace_id };
}

async function finishRestoreAttachment(actorId: string, body: Body) {
  const operationId = text(body.operation_id); const sourceWorkspaceId = text(body.source_workspace_id); const path = text(body.path);
  await requireRestoreOperation(actorId, operationId);
  const { data: mapping } = await admin.from('system_restore_workspaces').select('target_workspace_id').eq('operation_id', operationId).eq('source_workspace_id', sourceWorkspaceId).maybeSingle();
  if (!mapping || !path.startsWith(`${mapping.target_workspace_id}/recovered/`)) throw new Error('Invalid recovered attachment path.');
  const splitAt = path.lastIndexOf('/');
  const { data: objects, error: listError } = await admin.storage.from('workspace-attachments').list(path.slice(0, splitAt), { search: path.slice(splitAt + 1), limit: 2 });
  if (listError || !objects?.some((item) => item.name === path.slice(splitAt + 1))) throw new Error('The recovered attachment upload could not be verified.');
  const { data: attachment, error } = await admin.from('record_attachments').insert({
    workspace_id: mapping.target_workspace_id,
    record_type: text(body.record_type) || 'recovered',
    record_id: text(body.record_id) || null,
    storage_path: path,
    file_name: text(body.file_name).slice(0, 500) || 'attachment',
    mime_type: text(body.mime_type).slice(0, 200) || null,
    size_bytes: Number(body.size_bytes ?? 0),
  }).select('id').single();
  if (error) throw error;
  const links = Array.isArray(body.links) ? body.links as Array<Record<string, unknown>> : [];
  if (links.length) {
    const { error: linkError } = await admin.from('cash_transaction_attachments').insert(
      links.map((link) => ({ cash_transaction_id: text(link.cash_transaction_id), attachment_id: attachment.id })),
    );
    if (linkError) throw linkError;
  }
  return { ok: true };
}

async function createRecoveryInvitation(actorId: string, body: Body) {
  const operationId = text(body.operation_id); const sourceWorkspaceId = text(body.source_workspace_id); const email = text(body.email).toLowerCase();
  await requireRestoreOperation(actorId, operationId);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('A valid recovery invitation email is required.');
  const { data: mapping } = await admin.from('system_restore_workspaces').select('target_workspace_id').eq('operation_id', operationId).eq('source_workspace_id', sourceWorkspaceId).maybeSingle();
  if (!mapping) throw new Error('Restore the workspace before creating recovery invitations.');
  const rawBytes = crypto.getRandomValues(new Uint8Array(32));
  const rawToken = Array.from(rawBytes).map((part) => part.toString(16).padStart(2, '0')).join('');
  const hashBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken)));
  const tokenHash = Array.from(hashBytes).map((part) => part.toString(16).padStart(2, '0')).join('');
  const permission = (value: unknown) => ['none', 'view', 'edit'].includes(text(value)) ? text(value) : 'none';
  await admin.from('workspace_invitations').update({ status: 'revoked' }).eq('workspace_id', mapping.target_workspace_id).eq('email', email).eq('status', 'pending');
  const { data, error } = await admin.from('workspace_invitations').insert({
    workspace_id: mapping.target_workspace_id, email, token_hash: tokenHash, invited_by: actorId,
    book_permission: permission(body.book_permission), payroll_permission: permission(body.payroll_permission), truck_permission: permission(body.truck_permission),
    expires_at: new Date(Date.now() + 7 * 24 * 3600000).toISOString(),
  }).select('id,expires_at').single();
  if (error) throw error;
  await audit(actorId, 'recovery_invitation_created', 'success', { targetWorkspaceId: mapping.target_workspace_id, next: { email } });
  return { ...data, email, workspace_id: mapping.target_workspace_id, invite_token: rawToken };
}

async function finishRestore(actorId: string, body: Body) {
  const operationId = text(body.operation_id);
  await requireRestoreOperation(actorId, operationId);
  const { count } = await admin.from('system_restore_workspaces').select('*', { count: 'exact', head: true }).eq('operation_id', operationId);
  await admin.from('system_restore_operations').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', operationId);
  await admin.from('system_backup_runs').insert({ requested_by: actorId, backup_kind: 'restore', status: 'completed', record_count: count ?? 0, attachment_count: Number(body.attachment_count ?? 0), completed_at: new Date().toISOString() });
  await audit(actorId, 'restore_completed', 'success', { next: { operation_id: operationId, workspaces: count ?? 0 } });
  return { ok: true, workspace_count: count ?? 0 };
}

async function verifyRestore(actorId: string, body: Body) {
  const operationId = text(body.operation_id);
  await requireRestoreOperation(actorId, operationId);
  const { data: mappings, error: mappingError } = await admin.from('system_restore_workspaces').select('target_workspace_id').eq('operation_id', operationId);
  if (mappingError) throw mappingError;
  if (!mappings?.length) throw new Error('No restored workspace was found to verify.');
  for (const mapping of mappings) {
    const workspaceId = mapping.target_workspace_id;
    const [{ data: workspace }, { data: trucks }, { data: owners }, { data: customers }, { data: transactions }, { data: attachments }] = await Promise.all([
      admin.from('workspaces').select('id').eq('id', workspaceId).maybeSingle(),
      admin.from('trucks').select('id').eq('workspace_id', workspaceId),
      admin.from('truck_owners').select('id,truck_id').eq('workspace_id', workspaceId),
      admin.from('truck_customers').select('id,truck_id').eq('workspace_id', workspaceId),
      admin.from('truck_transactions').select('id,truck_id,owner_id,customer_id,settles_transaction_id').eq('workspace_id', workspaceId),
      admin.from('record_attachments').select('id,workspace_id').eq('workspace_id', workspaceId),
    ]);
    if (!workspace) throw new Error('A restored workspace could not be verified.');
    const truckIds = new Set((trucks ?? []).map((row) => row.id));
    const ownerIds = new Set((owners ?? []).map((row) => row.id));
    const customerIds = new Set((customers ?? []).map((row) => row.id));
    for (const row of owners ?? []) if (!truckIds.has(row.truck_id)) throw new Error('Restore verification found an owner without its truck.');
    for (const row of customers ?? []) if (!truckIds.has(row.truck_id)) throw new Error('Restore verification found a customer without its truck.');
    for (const row of transactions ?? []) {
      if (!truckIds.has(row.truck_id) || (row.owner_id && !ownerIds.has(row.owner_id)) || (row.customer_id && !customerIds.has(row.customer_id)) || (row.settles_transaction_id && !(transactions ?? []).some((item) => item.id === row.settles_transaction_id))) {
        throw new Error('Restore verification found an invalid Truck transaction relationship.');
      }
    }
    if ((attachments ?? []).some((attachment) => attachment.workspace_id !== workspaceId)) throw new Error('Restore verification found an attachment outside its workspace.');
  }
  return { ok: true, workspace_count: mappings.length };
}

async function abortRestore(actorId: string, body: Body) {
  const operationId = text(body.operation_id);
  await requireRestoreOperation(actorId, operationId);
  const { data: mappings, error: mappingError } = await admin.from('system_restore_workspaces').select('target_workspace_id').eq('operation_id', operationId);
  if (mappingError) throw mappingError;
  for (const mapping of mappings ?? []) {
    const { error } = await admin.from('workspaces').delete().eq('id', mapping.target_workspace_id);
    if (error) throw error;
  }
  const { error: operationError } = await admin.from('system_restore_operations').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', operationId).eq('status', 'started');
  if (operationError) throw operationError;
  await admin.from('system_backup_runs').insert({ requested_by: actorId, backup_kind: 'restore', status: 'failed', error_message: text(body.error_message).slice(0, 1000) || 'Restore aborted', completed_at: new Date().toISOString() });
  await audit(actorId, 'restore_aborted', 'failure', { next: { operation_id: operationId, reason: text(body.error_message).slice(0, 500) || 'Restore aborted' } });
  return { ok: true };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  // A read-only health response lets local full-stack runners wait until the
  // function worker is ready without needing an administrator token.
  if (request.method === 'GET') return json({ ok: true, service: 'system-admin' });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  let actor: User | null = null;
  let body: Body = {};
  try {
    const authorization = request.headers.get('Authorization') ?? '';
    const token = authorization.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Authentication required.' }, 401);
    const userClient = createClient(url, publishableKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: 'Invalid or expired session.' }, 401);
    actor = authData.user;
    await ensureBootstrap(actor);
    body = await request.json() as Body;
    const authorized = await isAdmin(actor.id);
    if (body.action === 'status') return json({ is_admin: authorized });
    if (!authorized) return json({ error: 'System administrator access required.' }, 403);

    switch (body.action) {
      case 'overview': return json(await overview());
      case 'list-users': return json(await listUsers(body));
      case 'list-workspaces': return json(await listWorkspaces(body));
      case 'list-audit': {
        const page = Math.max(1, integer(body.page, 1, 10000));
        const perPage = Math.max(10, integer(body.per_page, 30, 100));
        const { data, count, error } = await admin.from('system_admin_audit_events').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * perPage, page * perPage - 1);
        if (error) throw error;
        return json({ events: data ?? [], total: count ?? 0, page, per_page: perPage });
      }
      case 'set-user-status': {
        const targetUserId = text(body.user_id);
        await requireAdminTargetSafety(actor, targetUserId);
        const status = text(body.status);
        if (!['active', 'suspended', 'blocked'].includes(status)) throw new Error('Invalid account status.');
        let bannedUntil: string | null = null;
        let banDuration = 'none';
        if (status === 'suspended') {
          const requestedHours = Number(body.hours ?? 24);
          if (!Number.isFinite(requestedHours)) throw new Error('A valid suspension duration is required.');
          const hours = Math.ceil(Math.max(1, Math.min(requestedHours, 24 * 365)));
          bannedUntil = new Date(Date.now() + hours * 3600000).toISOString();
          banDuration = `${Math.ceil(hours)}h`;
        } else if (status === 'blocked') {
          banDuration = '876000h';
        }
        const { error } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: banDuration });
        if (error) throw error;
        const { error: controlError } = await admin.from('system_user_controls').upsert({ user_id: targetUserId, status, suspended_until: bannedUntil, reason: text(body.reason).slice(0, 500) || null, updated_by: actor.id, updated_at: new Date().toISOString() });
        if (controlError) throw controlError;
        await audit(actor.id, `user_${status}`, 'success', { targetUserId, next: { status, suspended_until: bannedUntil } });
        await notifyUser(targetUserId, `account_${status}`, `Account ${status}`, status === 'active' ? 'Your account has been reactivated.' : status === 'blocked' ? 'Your account has been blocked by an administrator.' : `Your account has been suspended until ${bannedUntil}.`);
        return json({ ok: true, status, suspended_until: bannedUntil });
      }
      case 'set-permission': {
        const workspaceId = text(body.workspace_id); const userId = text(body.user_id); const appId = text(body.app_id); const permission = text(body.permission);
        if (!['book', 'payroll', 'truck'].includes(appId) || !['none', 'view', 'edit'].includes(permission)) throw new Error('Invalid app permission.');
        const { data: membership } = await admin.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
        if (!membership) throw new Error('The user is not a member of this workspace.');
        if (membership.role === 'owner') throw new Error('Workspace owners always have edit access. Transfer ownership before restricting this user.');
        const { error } = await admin.from('workspace_member_app_permissions').upsert({ workspace_id: workspaceId, user_id: userId, app_id: appId, permission, updated_at: new Date().toISOString() });
        if (error) throw error;
        await audit(actor.id, 'app_permission_changed', 'success', { targetUserId: userId, targetWorkspaceId: workspaceId, next: { app_id: appId, permission } });
        return json({ ok: true });
      }
      case 'set-app-enabled': {
        const workspaceId = text(body.workspace_id); const appId = text(body.app_id); const enabled = body.enabled === true;
        if (!['book', 'payroll', 'truck'].includes(appId)) throw new Error('Invalid app.');
        const { error } = await admin.from('workspace_apps').upsert({ workspace_id: workspaceId, app_id: appId, enabled, updated_at: new Date().toISOString() });
        if (error) throw error;
        await audit(actor.id, 'workspace_app_changed', 'success', { targetWorkspaceId: workspaceId, next: { app_id: appId, enabled } });
        return json({ ok: true });
      }
      case 'set-membership': {
        const workspaceId = text(body.workspace_id); const userId = text(body.user_id); const enabled = body.enabled === true;
        if (enabled) {
          const { error } = await admin.from('workspace_members').upsert({ workspace_id: workspaceId, user_id: userId, role: 'member' });
          if (error) throw error;
        } else {
          const { data: membership } = await admin.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
          if (membership?.role === 'owner') throw new Error('Transfer workspace ownership before removing this member.');
          const { error } = await admin.from('workspace_members').delete().eq('workspace_id', workspaceId).eq('user_id', userId);
          if (error) throw error;
        }
        await audit(actor.id, enabled ? 'workspace_member_added' : 'workspace_member_removed', 'success', { targetUserId: userId, targetWorkspaceId: workspaceId });
        return json({ ok: true });
      }
      case 'transfer-ownership': {
        const workspaceId = text(body.workspace_id); const fromUser = text(body.from_user_id); const toUser = text(body.to_user_id);
        if (!workspaceId || !fromUser || !toUser || fromUser === toUser) throw new Error('Choose a different new owner.');
        const { data: memberships } = await admin.from('workspace_members').select('user_id,role').eq('workspace_id', workspaceId).in('user_id', [fromUser, toUser]);
        if (!memberships?.some((membership) => membership.user_id === fromUser && membership.role === 'owner')) throw new Error('The current owner is invalid.');
        if (!memberships?.some((membership) => membership.user_id === toUser)) throw new Error('The new owner must already be a workspace member.');
        await admin.from('workspace_members').upsert({ workspace_id: workspaceId, user_id: toUser, role: 'owner' });
        await admin.from('workspace_members').update({ role: 'member' }).eq('workspace_id', workspaceId).eq('user_id', fromUser);
        await admin.from('workspaces').update({ created_by: toUser }).eq('id', workspaceId);
        await admin.from('workspace_invitations').update({ invited_by: toUser }).eq('workspace_id', workspaceId).eq('invited_by', fromUser);
        await audit(actor.id, 'workspace_ownership_transferred', 'success', { targetUserId: toUser, targetWorkspaceId: workspaceId, previous: { owner: fromUser }, next: { owner: toUser } });
        return json({ ok: true });
      }
      case 'schedule-workspace-deletion': {
        const workspaceId = text(body.workspace_id);
        const { data: workspace } = await admin.from('workspaces').select('id,name,deletion_status').eq('id', workspaceId).maybeSingle();
        if (!workspace) throw new Error('Company not found.');
        if (text(body.confirmation) !== `DELETE ${workspace.name}`) throw new Error(`Type DELETE ${workspace.name} to confirm.`);
        const { data, error } = await admin.rpc('system_admin_schedule_workspace_deletion', { target_admin: actor.id, target_workspace: workspaceId });
        if (error) throw error;
        await audit(actor.id, 'workspace_deletion_scheduled', 'success', { targetWorkspaceId: workspaceId, previous: { status: workspace.deletion_status }, next: { status: 'scheduled', scheduled_for: data } });
        return json({ ok: true, scheduled_for: data });
      }
      case 'restore-workspace-deletion': {
        const workspaceId = text(body.workspace_id);
        const { error } = await admin.rpc('system_admin_restore_workspace_deletion', { target_admin: actor.id, target_workspace: workspaceId });
        if (error) throw error;
        await audit(actor.id, 'workspace_deletion_cancelled', 'success', { targetWorkspaceId: workspaceId, next: { status: 'active' } });
        return json({ ok: true });
      }
      case 'schedule-user-deletion': {
        const targetUserId = text(body.user_id);
        await requireAdminTargetSafety(actor, targetUserId);
        const { data: targetAccount } = await admin.auth.admin.getUserById(targetUserId);
        const targetEmail = targetAccount.user?.email ?? '';
        if (!targetAccount.user) throw new Error('User not found.');
        if (text(body.confirmation) !== `DELETE ${targetEmail}`) throw new Error(`Type DELETE ${targetEmail} to confirm.`);
        const scheduledFor = new Date(Date.now() + 30 * 24 * 3600000).toISOString();
        const { error: blockError } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: '876000h' });
        if (blockError) throw blockError;
        const { data: companyCount, error } = await admin.rpc('system_admin_schedule_user_deletion', { target_admin: actor.id, target_user: targetUserId, scheduled_at: scheduledFor });
        if (error) {
          await admin.auth.admin.updateUserById(targetUserId, { ban_duration: 'none' });
          throw error;
        }
        await audit(actor.id, 'user_deletion_scheduled', 'success', { targetUserId, previous: { email: targetEmail }, next: { scheduled_for: scheduledFor, owned_companies: companyCount } });
        return json({ ok: true, scheduled_for: scheduledFor, owned_companies: companyCount });
      }
      case 'restore-user-deletion': {
        const targetUserId = text(body.user_id);
        await requireAdminTargetSafety(actor, targetUserId);
        const { error: authError } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: 'none' });
        if (authError) throw authError;
        const { data: companyCount, error } = await admin.rpc('system_admin_restore_user_deletion', { target_admin: actor.id, target_user: targetUserId });
        if (error) {
          await admin.auth.admin.updateUserById(targetUserId, { ban_duration: '876000h' });
          throw error;
        }
        await audit(actor.id, 'user_deletion_cancelled', 'success', { targetUserId, next: { status: 'active', restored_companies: companyCount } });
        return json({ ok: true, restored_companies: companyCount });
      }
      case 'start-backup': return json(await startBackup(actor.id, body.kind === 'automatic' ? 'automatic' : 'manual'));
      case 'backup-resource': return json(await backupResource(actor.id, text(body.run_id), text(body.resource) as BackupResource, integer(body.offset, 0, Number.MAX_SAFE_INTEGER), Math.max(1, integer(body.limit, 100, 250))));
      case 'finish-backup': return json(await finishBackup(actor.id, body));
      case 'start-restore': return json(await startRestore(actor.id));
      case 'restore-workspace': return json(await restoreWorkspaceChunk(actor.id, body));
      case 'prepare-restore-attachment': return json(await prepareRestoreAttachment(actor.id, body));
      case 'finish-restore-attachment': return json(await finishRestoreAttachment(actor.id, body));
      case 'create-recovery-invitation': return json(await createRecoveryInvitation(actor.id, body));
      case 'finish-restore': return json(await finishRestore(actor.id, body));
      case 'verify-restore': return json(await verifyRestore(actor.id, body));
      case 'abort-restore': return json(await abortRestore(actor.id, body));
      default: return json({ error: 'Unknown admin action.' }, 400);
    }
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : 'Administrator request failed.';
    if (actor && body.action && body.action !== 'status' && await isAdmin(actor.id)) {
      await audit(actor.id, body.action, 'failure', { targetUserId: text(body.user_id) || null, targetWorkspaceId: text(body.workspace_id) || null, error: message });
    }
    return json({ error: message }, 400);
  }
});
