import { supabase } from '../lib/supabase';
import type { AppPermission } from '../auth/AuthProvider';

export type AdminOverview = {
  users: { total: number; active: number; suspended: number };
  workspaces: number;
  snapshots: number;
  snapshot_freshness: string | null;
  storage_bytes: number;
  app_access: { book: number; payroll: number };
  recent_audit: AdminAuditEvent[];
  latest_backup: AdminBackupRun | null;
  pending_approvals: number;
  failed_actions_24h: number;
  health: { database: 'ok' | 'error'; backup: 'fresh' | 'stale' | 'missing'; storage: 'ok' | 'warning' };
  alerts: Array<{ type: string; severity: 'warning' | 'critical'; message: string }>;
};

export type AdminMembership = {
  workspace_id: string;
  user_id: string;
  role: 'owner' | 'member';
  workspace: { id: string; name: string } | null;
  permissions: Array<{ app_id: 'book' | 'payroll'; permission: AppPermission }>;
};

export type AdminUser = {
  id: string;
  email: string;
  phone: string;
  display_name: string;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  status: 'active' | 'suspended' | 'blocked' | 'purge_pending';
  suspended_until: string | null;
  is_system_admin: boolean;
  memberships: AdminMembership[];
};

export type AdminWorkspace = {
  id: string;
  name: string;
  accent_color: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  apps: Array<{ workspace_id: string; app_id: 'book' | 'payroll'; enabled: boolean }>;
  members: Array<{
    workspace_id: string;
    user_id: string;
    role: 'owner' | 'member';
    user: Pick<AdminUser, 'id' | 'email' | 'display_name'>;
    permissions: Array<{ app_id: 'book' | 'payroll'; permission: AppPermission }>;
  }>;
};

export type AdminAuditEvent = {
  id: string;
  actor_id: string | null;
  action: string;
  target_user_id: string | null;
  target_workspace_id: string | null;
  result: 'success' | 'failure';
  error_message?: string | null;
  created_at: string;
};

export type AdminBackupRun = {
  id: string;
  backup_kind: 'automatic' | 'manual' | 'restore';
  status: 'started' | 'completed' | 'failed' | 'cancelled';
  record_count: number;
  attachment_count: number;
  size_bytes: number;
  checksum: string | null;
  created_at: string;
  completed_at: string | null;
};

export async function adminRequest<T>(action: string, values: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('system-admin', { body: { action, ...values } });
  if (error) {
    const response = (error as unknown as { context?: Response }).context;
    if (response) {
      let details: { error?: string } | null = null;
      try { details = await response.clone().json() as { error?: string }; } catch { /* Use the SDK error below for non-JSON responses. */ }
      if (details?.error) throw new Error(details.error);
    }
    throw new Error(error.message || 'Administrator request failed.');
  }
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}
