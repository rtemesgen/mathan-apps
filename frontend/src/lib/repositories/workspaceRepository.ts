import { supabase } from '../supabase';

export type WorkspaceMember = { user_id: string; email: string; display_name: string; role: 'owner' | 'member'; book_permission: 'none' | 'view' | 'edit' };

export async function listWorkspaceMembers(workspaceId: string) {
  const { data, error } = await supabase.rpc('list_workspace_members', { target_workspace: workspaceId });
  if (error) throw error;
  return (data as WorkspaceMember[] | null) ?? [];
}

export async function createWorkspace(name: string) {
  const { data, error } = await supabase.rpc('create_workspace', { workspace_name: name });
  if (error) throw error;
  return data as { id?: string } | null;
}

export async function grantBookAccess(workspaceId: string, userId: string) {
  const { error } = await supabase.from('workspace_member_app_permissions').upsert({ workspace_id: workspaceId, user_id: userId, app_id: 'book', permission: 'edit' });
  if (error) throw error;
}

export async function createBookInvitation(workspaceId: string, email: string) {
  const { data, error } = await supabase.rpc('create_workspace_invitation', { target_workspace: workspaceId, target_email: email, target_book_permission: 'edit', target_payroll_permission: 'none', target_truck_permission: 'none', expires_in_days: 7 });
  if (error) throw error;
  return (data as Array<{ invite_token: string }> | null)?.[0]?.invite_token;
}

export type WorkspaceInvitation = { invitation_id: string; workspace_id: string; workspace_name: string; invited_by_name: string; book_permission: string; payroll_permission: string; truck_permission: string; expires_at: string };

export async function listMyWorkspaceInvitations() {
  const { data, error } = await supabase.rpc('list_my_workspace_invitations');
  if (error) throw error;
  return (data as WorkspaceInvitation[] | null) ?? [];
}

export async function respondToWorkspaceInvitation(invitationId: string, accept: boolean) {
  const { error } = await supabase.rpc('respond_to_workspace_invitation', { target_invitation: invitationId, accept_invitation: accept });
  if (error) throw error;
}

export async function leaveWorkspace(workspaceId: string) {
  const { error } = await supabase.rpc('leave_workspace', { target_workspace: workspaceId });
  if (error) throw error;
}

export async function lookupWorkspaceContacts(workspaceId: string, phones: string[]) {
  const { data, error } = await supabase.rpc('lookup_workspace_contacts', { target_workspace: workspaceId, target_phones: phones });
  if (error) throw error;
  return (data as Array<{ phone: string }> | null) ?? [];
}

export async function createWorkspacePhoneInvitation(workspaceId: string, phone: string) {
  const { data, error } = await supabase.rpc('create_workspace_phone_invitation', { target_workspace: workspaceId, target_phone: phone });
  if (error) throw error;
  return data;
}

export type DurableNotification = { id: string; title: string; body: string; route?: string | null; read_at?: string | null; created_at: string };
export async function listMyNotifications(limit = 50) {
  const { data, error } = await supabase.rpc('list_my_notifications', { target_limit: limit });
  if (error) throw error;
  return (data as DurableNotification[] | null) ?? [];
}
export async function markNotificationRead(id: string) {
  const { error } = await supabase.rpc('mark_notification_read', { target_id: id });
  if (error) throw error;
}
export async function markAllNotificationsRead() {
  const { error } = await supabase.rpc('mark_all_notifications_read');
  if (error) throw error;
}
