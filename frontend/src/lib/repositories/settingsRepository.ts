import { supabase } from '../supabase';

export async function listApprovalRequests(workspaceId: string) {
  const { data, error } = await supabase.from('approval_requests').select('id,action_type,target_record_type,reason,status,created_at,requester_id,decision_comment').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return data ?? [];
}
export async function decideApprovalRequest(id: string, decision: 'approved' | 'rejected') { const { error } = await supabase.rpc('decide_approval_request', { target_request: id, target_decision: decision }); if (error) throw error; }
export async function listAccountSessions() { const result = await supabase.functions.invoke('account-sessions', { body: { action: 'list' } }); if (result.error) throw result.error; return result.data; }
export async function revokeOtherSessions() { const { error } = await supabase.functions.invoke('account-sessions', { body: { action: 'revoke-others' } }); if (error) throw error; }
export async function listWorkspaceInvitationsForOwner(workspaceId: string) { const { data, error } = await supabase.from('workspace_invitations').select('id,email,status,expires_at,book_permission,payroll_permission,truck_permission,created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }); if (error) throw error; return data ?? []; }
export async function getWorkspaceProfile(userId: string) { const { data, error } = await supabase.from('workspace_profiles').select('display_name,phone').eq('user_id', userId).maybeSingle(); if (error) throw error; return data; }
export async function updateWorkspace(workspaceId: string, values: { name: string; accent_color: string }) { const { error } = await supabase.from('workspaces').update(values).eq('id', workspaceId); if (error) throw error; }
export async function updateProfile(userId: string, values: { display_name: string; phone: string }) { const { error } = await supabase.from('workspace_profiles').upsert({ user_id: userId, ...values }); if (error) throw error; }
export async function updateAuthUser(values: { name?: string; phone?: string; email?: string }) { const { error } = await supabase.auth.updateUser({ data: { name: values.name, phone: values.phone }, ...(values.email ? { email: values.email } : {}) }); if (error) throw error; }
export async function updatePassword(password: string) { const { error } = await supabase.auth.updateUser({ password }); if (error) throw error; }
export async function createWorkspaceInvitation(workspaceId: string, email: string, permissions: Record<string, string>) { const { data, error } = await supabase.rpc('create_workspace_invitation', { target_workspace: workspaceId, target_email: email, target_book_permission: permissions.book, target_payroll_permission: permissions.payroll, target_truck_permission: permissions.truck, expires_in_days: 7 }); if (error) throw error; return data; }
export async function sendInvitationOtp(email: string, redirectTo: string) { const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } }); if (error) throw error; }
export async function updateMemberPermission(workspaceId: string, userId: string, app: string, permission: string) { const { error } = await supabase.from('workspace_member_app_permissions').upsert({ workspace_id: workspaceId, user_id: userId, app_id: app, permission }); if (error) throw error; }
export async function setWorkspaceAppEnabled(workspaceId: string, app: string, enabled: boolean) { const { error } = await supabase.from('workspace_apps').upsert({ workspace_id: workspaceId, app_id: app, enabled }); if (error) throw error; }
export async function revokeWorkspaceInvitation(id: string) { const { error } = await supabase.rpc('revoke_workspace_invitation', { target_invitation: id }); if (error) throw error; }
export async function removeWorkspaceMember(workspaceId: string, userId: string) { const { error } = await supabase.rpc('remove_workspace_member', { target_workspace: workspaceId, target_user: userId }); if (error) throw error; }
export async function listMemberCompanyAccess(userId: string) { const { data, error } = await supabase.rpc('list_member_company_access', { target_user: userId }); if (error) throw error; return data ?? []; }
export async function setMemberWorkspaceAccess(workspaceId: string, userId: string, enabled: boolean) { const { error } = await supabase.rpc('set_member_workspace_access', { target_workspace: workspaceId, target_user: userId, enabled }); if (error) throw error; }
export async function transferWorkspaceOwnership(workspaceId: string, userId: string) { const { error } = await supabase.rpc('transfer_workspace_ownership', { target_workspace: workspaceId, target_user: userId }); if (error) throw error; }
export async function acceptWorkspaceInvitation(token: string) { const { error } = await supabase.rpc('accept_workspace_invitation', { target_token: token }); if (error) throw error; }
