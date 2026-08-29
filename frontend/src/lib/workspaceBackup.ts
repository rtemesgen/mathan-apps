import { supabase } from './supabase';
import { saveWorkspaceBackupFile } from './mobile';

export type WorkspaceBackup = {
  schema_version: '1';
  exported_at: string;
  workspace: Record<string, unknown>;
  members: unknown[];
  permissions: unknown[];
  snapshots: Array<{ domain: string; payload: unknown; revision: number }>;
  trucks: unknown[];
  truck_owners: unknown[];
  truck_customers: unknown[];
  truck_transactions: unknown[];
  audit_events: unknown[];
  checksum: string;
};

async function digest(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((part) => part.toString(16).padStart(2, '0')).join('');
}

export async function createWorkspaceBackup(workspaceId: string): Promise<WorkspaceBackup> {
  const [workspace, members, permissions, snapshots, trucks, truckOwners, truckCustomers, truckTransactions, audit] = await Promise.all([
    supabase.from('workspaces').select('id,name,accent_color,created_at,updated_at').eq('id', workspaceId).single(),
    supabase.from('workspace_members').select('workspace_id,user_id,role,created_at').eq('workspace_id', workspaceId),
    supabase.from('workspace_member_app_permissions').select('workspace_id,user_id,app_id,permission,updated_at').eq('workspace_id', workspaceId),
    supabase.from('app_state_snapshots').select('domain,payload,revision,updated_at').eq('workspace_id', workspaceId),
    supabase.from('trucks').select('id,name,unit_number,make_model,vin,cash_on_hand,license_plate,created_at,updated_at').eq('workspace_id', workspaceId).is('deleted_at', null),
    supabase.from('truck_owners').select('id,truck_id,user_id,name,start_date,equity_percentage,monthly_draw_rate,avatar_color,created_at,updated_at').eq('workspace_id', workspaceId).is('deleted_at', null),
    supabase.from('truck_customers').select('id,truck_id,name,phone,address,notes,created_at,updated_at').eq('workspace_id', workspaceId).is('deleted_at', null),
    supabase.from('truck_transactions').select('id,truck_id,owner_id,customer_id,occurred_on,transaction_type,category,amount,description,reference_no,counterparty_type,counterparty_name,settles_transaction_id,created_at,updated_at').eq('workspace_id', workspaceId).is('deleted_at', null),
    supabase.from('audit_events').select('id,actor_id,record_type,record_id,action,previous_data,next_data,created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: true }),
  ]);
  const failed = [workspace, members, permissions, snapshots, trucks, truckOwners, truckCustomers, truckTransactions, audit].find((result) => result.error);
  if (failed?.error) throw failed.error;
  const unsigned = { schema_version: '1' as const, exported_at: new Date().toISOString(), workspace: workspace.data ?? {}, members: members.data ?? [], permissions: permissions.data ?? [], snapshots: (snapshots.data ?? []).map((row) => ({ domain: row.domain, payload: row.payload, revision: row.revision })), trucks: trucks.data ?? [], truck_owners: truckOwners.data ?? [], truck_customers: truckCustomers.data ?? [], truck_transactions: truckTransactions.data ?? [], audit_events: audit.data ?? [] };
  return { ...unsigned, checksum: await digest(unsigned) };
}

export async function validateWorkspaceBackup(backup: unknown): Promise<WorkspaceBackup> {
  if (!backup || typeof backup !== 'object') throw new Error('Backup must be a JSON object.');
  const candidate = backup as Partial<WorkspaceBackup>;
  if (candidate.schema_version !== '1' || !Array.isArray(candidate.snapshots) || !candidate.checksum) throw new Error('Unsupported or incomplete backup file.');
  const { checksum, ...unsigned } = candidate as WorkspaceBackup;
  if (await digest(unsigned) !== checksum) throw new Error('Backup checksum does not match.');
  const domains = new Set(['cash_book:state', 'cash_book:books', 'cash_book:transactions', 'payroll:state', 'payroll:employees', 'payroll:transactions', 'payroll:custom-apps']);
  if (candidate.snapshots.some((item) => !domains.has(item.domain) || !Number.isInteger(item.revision) || item.revision < 1)) throw new Error('Backup contains an invalid snapshot.');
  return candidate as WorkspaceBackup;
}

export async function downloadWorkspaceBackup(backup: WorkspaceBackup) {
  await saveWorkspaceBackupFile(`mathan-workspace-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2));
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
