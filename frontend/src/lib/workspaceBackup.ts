import { supabase } from './supabase';

export type WorkspaceBackup = {
  schema_version: '1';
  exported_at: string;
  workspace: Record<string, unknown>;
  members: unknown[];
  permissions: unknown[];
  snapshots: Array<{ domain: string; payload: unknown; revision: number }>;
  audit_events: unknown[];
  checksum: string;
};

async function digest(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((part) => part.toString(16).padStart(2, '0')).join('');
}

export async function createWorkspaceBackup(workspaceId: string): Promise<WorkspaceBackup> {
  const [workspace, members, permissions, snapshots, audit] = await Promise.all([
    supabase.from('workspaces').select('id,name,accent_color,created_at,updated_at').eq('id', workspaceId).single(),
    supabase.from('workspace_members').select('workspace_id,user_id,role,created_at').eq('workspace_id', workspaceId),
    supabase.from('workspace_member_app_permissions').select('workspace_id,user_id,app_id,permission,updated_at').eq('workspace_id', workspaceId),
    supabase.from('app_state_snapshots').select('domain,payload,revision,updated_at').eq('workspace_id', workspaceId),
    supabase.from('audit_events').select('id,actor_id,record_type,record_id,action,previous_data,next_data,created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: true }),
  ]);
  const failed = [workspace, members, permissions, snapshots, audit].find((result) => result.error);
  if (failed?.error) throw failed.error;
  const unsigned = { schema_version: '1' as const, exported_at: new Date().toISOString(), workspace: workspace.data ?? {}, members: members.data ?? [], permissions: permissions.data ?? [], snapshots: (snapshots.data ?? []).map((row) => ({ domain: row.domain, payload: row.payload, revision: row.revision })), audit_events: audit.data ?? [] };
  return { ...unsigned, checksum: await digest(unsigned) };
}

export async function validateWorkspaceBackup(backup: unknown): Promise<WorkspaceBackup> {
  if (!backup || typeof backup !== 'object') throw new Error('Backup must be a JSON object.');
  const candidate = backup as Partial<WorkspaceBackup>;
  if (candidate.schema_version !== '1' || !Array.isArray(candidate.snapshots) || !candidate.checksum) throw new Error('Unsupported or incomplete backup file.');
  const { checksum, ...unsigned } = candidate as WorkspaceBackup;
  if (await digest(unsigned) !== checksum) throw new Error('Backup checksum does not match.');
  const domains = new Set(['cash_book:books', 'cash_book:transactions', 'payroll:employees', 'payroll:transactions', 'payroll:custom-apps']);
  if (candidate.snapshots.some((item) => !domains.has(item.domain) || !Number.isInteger(item.revision) || item.revision < 1)) throw new Error('Backup contains an invalid snapshot.');
  return candidate as WorkspaceBackup;
}

export function downloadWorkspaceBackup(backup: WorkspaceBackup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `mathan-workspace-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
}

async function encryptedBytes(backup: WorkspaceBackup, passphrase: string) {
  if (passphrase.length < 12) throw new Error('Use an encryption passphrase of at least 12 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12));
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(backup))));
  const output = new Uint8Array(4 + salt.length + iv.length + encrypted.length); output.set(new TextEncoder().encode('MEB1'), 0); output.set(salt, 4); output.set(iv, 20); output.set(encrypted, 32); return output;
}

export async function uploadEncryptedWorkspaceBackup(workspaceId: string, backup: WorkspaceBackup, passphrase: string) {
  const filename = `${workspaceId}/${new Date().toISOString().replace(/[:.]/g, '-')}.meb`;
  const { error } = await supabase.storage.from('workspace-backups').upload(filename, new Blob([await encryptedBytes(backup, passphrase)], { type: 'application/octet-stream' }), { upsert: false, contentType: 'application/octet-stream' });
  if (error) throw error;
  return filename;
}

export async function restoreWorkspaceBackup(backup: WorkspaceBackup, workspaceName: string) {
  const { data, error } = await supabase.rpc('restore_workspace_backup', { target_backup: backup, target_name: workspaceName });
  if (error) throw error;
  return data as string;
}
