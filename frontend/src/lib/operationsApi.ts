import { supabase } from './supabase';
import { downloadCsvFile } from './fileExport';

export type NotificationRecord = { id: string; user_id: string; workspace_id: string | null; notification_type: string; title: string; body: string; route: string | null; metadata: Record<string, unknown>; read_at: string | null; created_at: string };
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';
export type ApprovalRequest = { id: string; workspace_id: string; requester_id: string; approver_id: string | null; action_type: string; target_record_type: string; target_record_id: string | null; reason: string; metadata: Record<string, unknown>; status: ApprovalStatus; decision_comment: string | null; created_at: string; decided_at: string | null; expires_at: string };
export type TrashRecord = { source_table: string; record_id: string; label: string; deleted_at: string };

export async function listNotifications(limit = 50) { const { data, error } = await supabase.rpc('list_my_notifications', { target_limit: limit }); if (error) throw error; return (data ?? []) as NotificationRecord[]; }
export async function markNotificationRead(id: string) { const { error } = await supabase.rpc('mark_notification_read', { target_id: id }); if (error) throw error; }
export async function markAllNotificationsRead() { const { error } = await supabase.rpc('mark_all_notifications_read'); if (error) throw error; }
export async function createApprovalRequest(workspaceId: string, action: string, recordType: string, recordId: string | null, reason: string, metadata: Record<string, unknown> = {}) { const { data, error } = await supabase.rpc('create_approval_request', { target_workspace: workspaceId, target_action: action, target_record_type: recordType, target_record_id: recordId, target_reason: reason, target_metadata: metadata }); if (error) throw error; return data as ApprovalRequest; }
export async function decideApprovalRequest(id: string, decision: Extract<ApprovalStatus, 'approved' | 'rejected'>, comment?: string) { const { data, error } = await supabase.rpc('decide_approval_request', { target_request: id, target_decision: decision, target_comment: comment ?? null }); if (error) throw error; return data as ApprovalRequest; }
export async function listWorkspaceTrash(workspaceId: string) { const { data, error } = await supabase.rpc('list_workspace_trash', { target_workspace: workspaceId }); if (error) throw error; return (data ?? []) as TrashRecord[]; }
export async function restoreTrashRecord(table: string, id: string) { const { data, error } = await supabase.rpc('restore_workspace_trash', { target_table: table, target_id: id }); if (error) throw error; return data === true; }
export async function purgeExpiredTrash(workspaceId: string) { const { data, error } = await supabase.rpc('purge_expired_workspace_trash', { target_workspace: workspaceId }); if (error) throw error; return Number(data ?? 0); }
export type AccountDeletionRequest = { user_id: string; status: 'pending' | 'cancelled' | 'completed'; requested_at: string; scheduled_for: string; cancelled_at: string | null; completed_at: string | null; delete_owned_workspaces: boolean };
export async function requestAccountDeletion(deleteOwnedWorkspaces = false) { const { data, error } = await supabase.rpc('request_account_deletion', { delete_owned_workspaces: deleteOwnedWorkspaces }); if (error) throw error; return data as AccountDeletionRequest; }
export async function cancelAccountDeletion() { const { data, error } = await supabase.rpc('cancel_account_deletion'); if (error) throw error; return data === true; }
export async function getAccountDeletionRequest(userId: string) { const { data, error } = await supabase.from('account_deletion_requests').select('*').eq('user_id', userId).maybeSingle(); if (error) throw error; return data as AccountDeletionRequest | null; }
export type WorkspaceDeletionStatus = { status: 'active' | 'scheduled'; scheduled_for: string | null; days_remaining: number | null };
export async function requestWorkspaceDeletion(workspaceId: string) { const { data, error } = await supabase.rpc('request_workspace_deletion', { target_workspace: workspaceId }); if (error) throw error; return String(data); }
export async function cancelWorkspaceDeletion(workspaceId: string) { const { data, error } = await supabase.rpc('cancel_workspace_deletion', { target_workspace: workspaceId }); if (error) throw error; return data === true; }
export async function getWorkspaceDeletionStatus(workspaceId: string) { const { data, error } = await supabase.rpc('get_workspace_deletion_status', { target_workspace: workspaceId }); if (error) throw error; return ((data as WorkspaceDeletionStatus[] | null)?.[0] ?? { status: 'active', scheduled_for: null, days_remaining: null }) as WorkspaceDeletionStatus; }

export type ReportRow = Record<string, string | number | null>;
export function downloadCsv(filename: string, rows: ReportRow[]) {
  const headers = Object.keys(rows[0] ?? {});
  void downloadCsvFile(filename, headers, rows.map((row) => headers.map((key) => row[key])));
}
