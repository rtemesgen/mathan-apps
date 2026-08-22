import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { localSupabaseStatus } from './supabaseLocal';

export const E2E_USERS = {
  admin: { email: 'admin@mathan-e2e.local', password: 'Admin-E2E-pass-123!', name: 'System Admin' },
  member: { email: 'member@mathan-e2e.local', password: 'Member-E2E-pass-123!', name: 'Ordinary Member' },
  disposable: { email: 'delete-me@mathan-e2e.local', password: 'Delete-E2E-pass-123!', name: 'Disposable User' },
} as const;

async function removeExistingFixtureData(service: SupabaseClient) {
  const { data: workspaces, error: workspaceError } = await service.from('workspaces').select('id');
  if (workspaceError) throw workspaceError;
  for (const workspace of workspaces ?? []) {
    const { data: files } = await service.storage.from('workspace-attachments').list(workspace.id, { limit: 1000 });
    if (files?.length) await service.storage.from('workspace-attachments').remove(files.map((file) => `${workspace.id}/${file.name}`));
  }
  if (workspaces?.length) {
    const workspaceIds = workspaces.map((item) => item.id);
    // Delete audited child rows while their workspace still exists. PostgreSQL
    // cascade ordering otherwise makes the audit trigger reference a parent
    // row that is already being removed.
    for (const table of ['workspace_member_app_permissions', 'workspace_invitations', 'workspace_members', 'audit_events']) {
      const { error } = await service.from(table).delete().in('workspace_id', workspaceIds);
      if (error) throw error;
    }
    const { error } = await service.from('workspaces').delete().in('id', workspaceIds);
    if (error) throw error;
  }
  for (const table of ['system_admin_audit_events', 'system_backup_runs']) {
    const { error } = await service.from(table).delete().not('id', 'is', null);
    if (error) throw error;
  }
  const { data: users, error: usersError } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) throw usersError;
  for (const user of users.users) {
    const { error } = await service.auth.admin.deleteUser(user.id, false);
    if (error) throw error;
  }
}

async function createUser(service: SupabaseClient, fixture: typeof E2E_USERS[keyof typeof E2E_USERS]) {
  const { data, error } = await service.auth.admin.createUser({ email: fixture.email, password: fixture.password, email_confirm: true, user_metadata: { name: fixture.name, phone: '+256741321674' } });
  if (error || !data.user) throw error ?? new Error(`Could not create ${fixture.email}.`);
  return data.user;
}

async function createWorkspace(apiUrl: string, anonKey: string, fixture: typeof E2E_USERS[keyof typeof E2E_USERS], name: string) {
  const client = createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email: fixture.email, password: fixture.password });
  if (signInError) throw signInError;
  const { data, error } = await client.rpc('create_workspace', { workspace_name: name });
  if (error || !data?.id) throw error ?? new Error(`Could not create ${name}.`);
  return String(data.id);
}

export default async function globalSetup() {
  const status = localSupabaseStatus();
  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  await removeExistingFixtureData(service);
  const users: Record<keyof typeof E2E_USERS, User> = {
    admin: await createUser(service, E2E_USERS.admin),
    member: await createUser(service, E2E_USERS.member),
    disposable: await createUser(service, E2E_USERS.disposable),
  };
  const adminWorkspace = await createWorkspace(status.API_URL, status.ANON_KEY, E2E_USERS.admin, 'Admin Company');
  await createWorkspace(status.API_URL, status.ANON_KEY, E2E_USERS.member, 'Member Company');
  // Local `supabase start` may keep its built-in Edge worker alive between
  // runs, so seed the same administrator identity deterministically. The Edge
  // endpoint still performs its own JWT and system_admins authorization.
  const { error: adminError } = await service.from('system_admins').insert({ user_id: users.admin.id });
  if (adminError) throw adminError;
  const { error: membersError } = await service.from('workspace_members').insert([
    { workspace_id: adminWorkspace, user_id: users.member.id, role: 'member' },
    { workspace_id: adminWorkspace, user_id: users.disposable.id, role: 'member' },
  ]);
  if (membersError) throw membersError;
  const permissions = [users.member.id, users.disposable.id].flatMap((userId) => [
    { workspace_id: adminWorkspace, user_id: userId, app_id: 'book', permission: 'edit' },
    { workspace_id: adminWorkspace, user_id: userId, app_id: 'payroll', permission: 'view' },
  ]);
  const { error: permissionError } = await service.from('workspace_member_app_permissions').insert(permissions);
  if (permissionError) throw permissionError;
  const { error: profileError } = await service.from('workspace_profiles').upsert(Object.entries(users).map(([key, user]) => ({ user_id: user.id, display_name: E2E_USERS[key as keyof typeof E2E_USERS].name })));
  if (profileError) throw profileError;
  const snapshots = [
    { domain: 'cash_book:books', payload: [] }, { domain: 'cash_book:transactions', payload: [] },
    { domain: 'payroll:employees', payload: [] }, { domain: 'payroll:transactions', payload: [] },
    { domain: 'payroll:custom-apps', payload: [] },
  ].map((snapshot) => ({ workspace_id: adminWorkspace, revision: 1, ...snapshot }));
  const { error: snapshotError } = await service.from('app_state_snapshots').insert(snapshots);
  if (snapshotError) throw snapshotError;
  const attachmentPath = `${adminWorkspace}/e2e-backup-proof.txt`;
  const attachmentBytes = new TextEncoder().encode('Mathan ERP full-stack backup fixture');
  const { error: uploadError } = await service.storage.from('workspace-attachments').upload(attachmentPath, attachmentBytes, { contentType: 'text/plain', upsert: true });
  if (uploadError) throw uploadError;
  const { error: attachmentError } = await service.from('record_attachments').insert({ workspace_id: adminWorkspace, record_type: 'cash_transaction', record_id: randomUUID(), storage_path: attachmentPath, file_name: 'e2e-backup-proof.txt', mime_type: 'text/plain', size_bytes: attachmentBytes.byteLength });
  if (attachmentError) throw attachmentError;
}
