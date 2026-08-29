import { offlineStore } from '../lib/localStore';
import { saveWorkspaceBackupFile } from '../lib/mobile';
import { adminRequest } from './adminApi';
import { supabase } from '../lib/supabase';
import { getQueuedMutations } from '../lib/syncQueue';
import { prefetchWorkspaceData } from '../lib/offlinePrefetch';
import { diagnostic } from '../lib/diagnostics';

const KEY_STORAGE = 'admin:backup-key';
const KEY_META_STORAGE = 'admin:backup-key-meta';
const LATEST_BACKUP = 'admin:latest-backup';
const DAILY_MARKER = 'mathan_admin_backup_day';
const DAILY_RUNNING_MARKER = 'mathan_admin_backup_running_day';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function localDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type BackupKeyMeta = { salt: string; verifier: string };
export type BackupProgress = { stage: string; percent: number; completed: number; total: number; bytes: number };
export type AdminArchive = Record<string, unknown> & {
  format: 'mathan-system-backup';
  schema_version: '1' | '2';
  exported_at: string;
  checksum: string;
  users: Array<Record<string, unknown>>;
  workspaces: Array<Record<string, unknown>>;
  attachments: Array<Record<string, unknown>>;
};
export type EncryptedAdminBackup = {
  format: 'mathan-encrypted-backup';
  version: '1';
  created_at: string;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string; data: string };
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}
function base64ToBytes(value: string) { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }
async function digest(value: unknown) {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(hash)).map((part) => part.toString(16).padStart(2, '0')).join('');
}
async function deriveKey(passphrase: string, salt: Uint8Array) {
  if (passphrase.length < 12) throw new Error('Use a recovery passphrase of at least 12 characters.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 300000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function isCryptoKey(value: unknown): value is CryptoKey { return Boolean(value && typeof value === 'object' && 'type' in value && (value as CryptoKey).type === 'secret'); }
export async function hasDeviceBackupKey() { return isCryptoKey(await offlineStore.read<CryptoKey>(KEY_STORAGE)); }
export async function configureDeviceBackupKey(passphrase: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  const verifier = await digest({ salt: bytesToBase64(salt), purpose: 'mathan-admin-backup' });
  await offlineStore.write(KEY_STORAGE, key);
  await offlineStore.write<BackupKeyMeta>(KEY_META_STORAGE, { salt: bytesToBase64(salt), verifier });
  if (!isCryptoKey(await offlineStore.read<CryptoKey>(KEY_STORAGE))) throw new Error('This browser could not store the protected device key. Check private-browsing or storage restrictions.');
}
/** A day is complete only after the encrypted archive and server run finish. */
export function backupCompletedToday() { return localStorage.getItem(DAILY_MARKER) === localDayKey(); }
export function backupRunningToday() {
  try {
    const started = localStorage.getItem(DAILY_RUNNING_MARKER);
    if (!started) return false;
    const timestamp = new Date(started).getTime();
    return Number.isFinite(timestamp) && Date.now() - timestamp < 30 * 60 * 1000;
  } catch { return false; }
}
export function markAutomaticBackupStarted() { localStorage.setItem(DAILY_RUNNING_MARKER, new Date().toISOString()); }
export function clearAutomaticBackupStarted() { localStorage.removeItem(DAILY_RUNNING_MARKER); }

async function fetchAttachment(url: string, signal?: AbortSignal) {
  // Edge workers can see Storage through an internal hostname (for example
  // `kong` in local Supabase). Preserve the signed path/query but always use
  // the public Supabase origin configured in this client.
  const signedUrl = new URL(url);
  const publicOrigin = new URL(String(import.meta.env.VITE_SUPABASE_URL));
  signedUrl.protocol = publicOrigin.protocol;
  signedUrl.host = publicOrigin.host;
  const response = await fetch(signedUrl, { signal });
  if (!response.ok) throw new Error(`Attachment download failed (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 100 * 1024 * 1024) throw new Error('An attachment exceeds the 100 MB portable-backup limit.');
  return bytes;
}

async function retry<T>(operation: () => Promise<T>, signal?: AbortSignal) {
  let latest: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (signal?.aborted) throw new DOMException('Backup cancelled.', 'AbortError');
    try { return await operation(); } catch (reason) {
      latest = reason;
      if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw latest;
}

export async function createEncryptedAdminBackup(kind: 'automatic' | 'manual', onProgress: (progress: BackupProgress) => void, signal?: AbortSignal) {
  const key = await offlineStore.read<CryptoKey>(KEY_STORAGE);
  const keyMeta = await offlineStore.read<BackupKeyMeta>(KEY_META_STORAGE);
  if (!isCryptoKey(key) || !keyMeta) throw new Error('Set the recovery passphrase on this device first.');
  const started = await adminRequest<{ run: { id: string }; counts: Record<string, number>; resources: string[]; schema_version: '2' }>('start-backup', { kind });
  const total = Object.values(started.counts).reduce((sum, count) => sum + count, 0);
  let completed = 0;
  let transferredBytes = 0;
  const archive: Record<string, unknown> = { format: 'mathan-system-backup', schema_version: '2', exported_at: new Date().toISOString() };
  try {
    for (const resource of started.resources) {
      const rows: Array<Record<string, unknown>> = [];
      let offset = 0;
      let done = false;
      while (!done) {
        if (signal?.aborted) throw new DOMException('Backup cancelled.', 'AbortError');
        const page = await retry(() => adminRequest<{ rows: Array<Record<string, unknown>>; done: boolean; total: number }>('backup-resource', { run_id: started.run.id, resource, offset, limit: 100 }), signal);
        for (const row of page.rows) {
          if (resource === 'attachments') {
            if (typeof row.signed_url !== 'string') throw new Error(`Could not securely download attachment ${String(row.file_name ?? row.id)}.`);
            const bytes = await retry(() => fetchAttachment(row.signed_url as string, signal), signal);
            transferredBytes += bytes.byteLength;
            rows.push({ ...row, signed_url: undefined, data_base64: bytesToBase64(bytes) });
          } else rows.push(row);
          completed += 1;
          onProgress({ stage: resource === 'attachments' ? 'Downloading attachments' : `Downloading ${resource.replace('_', ' ')}`, percent: total ? Math.min(85, Math.round(completed / total * 85)) : 85, completed, total, bytes: transferredBytes });
        }
        offset += page.rows.length;
        done = page.done || page.rows.length === 0;
      }
      archive[resource] = rows;
    }
    onProgress({ stage: 'Verifying records', percent: 88, completed, total, bytes: transferredBytes });
    const checksum = await digest(archive);
    const signedArchive = { ...archive, checksum } as AdminArchive;
    onProgress({ stage: 'Encrypting backup', percent: 92, completed, total, bytes: transferredBytes });
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(signedArchive))));
    const container: EncryptedAdminBackup = {
      format: 'mathan-encrypted-backup', version: '1', created_at: new Date().toISOString(),
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 300000, salt: keyMeta.salt },
      cipher: { name: 'AES-GCM', iv: bytesToBase64(iv), data: bytesToBase64(encrypted) },
    };
    const content = JSON.stringify(container);
    await offlineStore.write(LATEST_BACKUP, content);
    await adminRequest('finish-backup', { run_id: started.run.id, status: 'completed', record_count: completed, attachment_count: started.counts.attachments ?? 0, size_bytes: content.length, checksum });
    localStorage.setItem(DAILY_MARKER, localDayKey());
    clearAutomaticBackupStarted();
    onProgress({ stage: 'Backup ready', percent: 100, completed, total, bytes: content.length });
    return { content, checksum, filename: `mathan-system-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.meb.json` };
  } catch (reason) {
    clearAutomaticBackupStarted();
    await adminRequest('finish-backup', { run_id: started.run.id, status: signal?.aborted ? 'cancelled' : 'failed', record_count: completed, attachment_count: 0, size_bytes: transferredBytes, error_message: reason instanceof Error ? reason.message : 'Backup failed' }).catch(() => undefined);
    throw reason;
  }
}

export async function downloadBackup(filename: string, content: string) {
  await saveWorkspaceBackupFile(filename, content);
}
export async function downloadLatestBackup() {
  const content = await offlineStore.read<string>(LATEST_BACKUP);
  if (!content) throw new Error('No local administrator backup is available on this device.');
  await downloadBackup(`mathan-system-backup-latest.meb.json`, content);
}

export async function decryptAdminBackup(content: string, passphrase: string): Promise<AdminArchive> {
  const container = JSON.parse(content) as EncryptedAdminBackup;
  if (container.format !== 'mathan-encrypted-backup' || container.version !== '1' || !container.kdf?.salt || !container.cipher?.data) throw new Error('Unsupported or incomplete encrypted backup.');
  let plaintext: ArrayBuffer;
  try {
    const key = await deriveKey(passphrase, base64ToBytes(container.kdf.salt));
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(container.cipher.iv) }, key, base64ToBytes(container.cipher.data));
  } catch { throw new Error('The recovery passphrase is incorrect or the backup is damaged.'); }
  const archive = JSON.parse(decoder.decode(plaintext)) as AdminArchive;
  if (archive.format !== 'mathan-system-backup' || !['1', '2'].includes(archive.schema_version) || !Array.isArray(archive.workspaces)) throw new Error('Unsupported recovery archive.');
  const { checksum, ...unsigned } = archive;
  if (await digest(unsigned) !== checksum) throw new Error('Backup checksum verification failed.');
  return archive;
}

export async function restoreAdminArchive(archive: AdminArchive, workspaceIds: string[], onProgress: (progress: BackupProgress) => void) {
  diagnostic('restore-validation-started', { selectedWorkspaces: workspaceIds.length });
  // Validate the complete selected restore set before opening a server-side
  // restore operation. The server operation is transactional, but rejecting
  // malformed relationships here gives the administrator a safe, useful
  // error before any authoritative data can be staged.
  if (archive.format !== 'mathan-system-backup' || !['1', '2'].includes(archive.schema_version) || !archive.checksum) throw new Error('Unsupported or incomplete recovery archive.');
  const { checksum, ...unsignedArchive } = archive;
  if (await digest(unsignedArchive) !== checksum) throw new Error('Backup checksum verification failed.');
  for (const resource of ['users', 'workspaces', 'members', 'apps', 'permissions', 'snapshots', 'audit_events', 'invitations', 'attachments', 'trucks', 'truck_owners', 'truck_customers', 'truck_transactions']) {
    if (!Array.isArray((archive as Record<string, unknown>)[resource])) throw new Error(`Backup is missing the ${resource} table.`);
  }
  const selectedIds = new Set(workspaceIds);
  if (!selectedIds.size) throw new Error('Select at least one company to restore.');
  const pending = (await getQueuedMutations()).filter((mutation) => selectedIds.has(mutation.companyId || String(mutation.payload.workspace_id ?? '')));
  if (pending.length) throw new Error('Restore is paused while this company has pending offline changes. Synchronize or resolve them before restoring so they are not silently merged into the recovery dataset.');
  const selectedWorkspaces = archive.workspaces.filter((workspace) => selectedIds.has(String(workspace.id)));
  if (selectedWorkspaces.length !== selectedIds.size) throw new Error('The backup does not contain every selected company.');
  const rows = (resource: string) => (archive as Record<string, unknown>)[resource] as Array<Record<string, unknown>>;
  const selectedRows = (resource: string) => rows(resource).filter((row) => selectedIds.has(String(row.workspace_id)));
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const idFields: Record<string, string[]> = {
    users: ['id'], workspaces: ['id'], members: ['user_id'], apps: ['workspace_id'], permissions: ['workspace_id', 'user_id'],
    snapshots: ['workspace_id'], audit_events: ['id', 'workspace_id'], invitations: ['id', 'workspace_id'], attachments: ['id', 'workspace_id'],
    trucks: ['id', 'workspace_id'], truck_owners: ['id', 'workspace_id', 'truck_id'], truck_customers: ['id', 'workspace_id', 'truck_id'], truck_transactions: ['id', 'workspace_id', 'truck_id'],
  };
  for (const [resource, fields] of Object.entries(idFields)) {
    const seen = new Set<string>();
    for (const row of rows(resource)) {
      for (const field of fields) if (row[field] != null && !uuid.test(String(row[field]))) throw new Error(`Backup contains an invalid ${resource} ${field}.`);
      if (fields[0] === 'id' && row.id != null) { const id = String(row.id); if (seen.has(id)) throw new Error(`Backup contains duplicate ${resource} IDs.`); seen.add(id); }
    }
  }
  const numericFields: Record<string, string[]> = {
    trucks: ['cash_on_hand'], truck_owners: ['equity_percentage', 'monthly_draw_rate'], truck_transactions: ['amount'],
  };
  for (const [resource, fields] of Object.entries(numericFields)) for (const row of selectedRows(resource)) for (const field of fields) if (row[field] != null && (!Number.isFinite(Number(row[field])) || Number(row[field]) < 0)) throw new Error(`Backup contains an invalid numeric ${resource} field.`);
  const dateFields: Record<string, string[]> = {
    workspaces: ['created_at', 'updated_at'], snapshots: ['updated_at'], trucks: ['created_at', 'updated_at'], truck_owners: ['start_date', 'created_at', 'updated_at'], truck_customers: ['created_at', 'updated_at'], truck_transactions: ['occurred_on', 'created_at', 'updated_at'],
  };
  for (const [resource, fields] of Object.entries(dateFields)) for (const row of selectedRows(resource)) for (const field of fields) if (row[field] != null && (typeof row[field] !== 'string' || !Number.isFinite(Date.parse(row[field] as string)))) throw new Error(`Backup contains an invalid date in ${resource}.`);
  const selectedTruckIds = new Set(selectedRows('trucks').map((row) => String(row.id)));
  const selectedOwnerIds = new Set(selectedRows('truck_owners').map((row) => String(row.id)));
  const selectedCustomerIds = new Set(selectedRows('truck_customers').map((row) => String(row.id)));
  const userIds = new Set(archive.users.map((user) => String(user.id)));
  const assertRowsBelongToSelectedWorkspace = (resource: string) => {
    for (const row of selectedRows(resource)) if (!selectedIds.has(String(row.workspace_id))) throw new Error(`${resource} contains a row from an unselected company.`);
  };
  for (const resource of ['members', 'apps', 'permissions', 'snapshots', 'audit_events', 'invitations', 'trucks', 'truck_owners', 'truck_customers', 'truck_transactions']) assertRowsBelongToSelectedWorkspace(resource);
  for (const row of selectedRows('members')) if (!userIds.has(String(row.user_id))) throw new Error('Backup contains a company member with no matching user.');
  for (const row of selectedRows('snapshots')) if (!String(row.domain).includes(':') || !Number.isInteger(row.revision) || Number(row.revision) < 1) throw new Error('Backup contains an invalid application snapshot.');
  for (const row of selectedRows('truck_owners')) if (!selectedTruckIds.has(String(row.truck_id))) throw new Error('Backup contains a Truck owner without its parent truck.');
  for (const row of selectedRows('truck_customers')) if (!selectedTruckIds.has(String(row.truck_id))) throw new Error('Backup contains a Truck customer without its parent truck.');
  for (const row of selectedRows('truck_transactions')) {
    if (!selectedTruckIds.has(String(row.truck_id))) throw new Error('Backup contains a Truck transaction without its parent truck.');
    if (row.owner_id != null && !selectedOwnerIds.has(String(row.owner_id))) throw new Error('Backup contains a Truck transaction with an invalid owner reference.');
    if (row.customer_id != null && !selectedCustomerIds.has(String(row.customer_id))) throw new Error('Backup contains a Truck transaction with an invalid customer reference.');
    if (row.settles_transaction_id != null && !selectedRows('truck_transactions').some((item) => String(item.id) === String(row.settles_transaction_id))) throw new Error('Backup contains a Truck transaction with an invalid settlement reference.');
  }
  const selectedAttachments = archive.attachments.filter((attachment) => selectedIds.has(String(attachment.workspace_id)));
  for (const attachment of selectedAttachments) {
    if (typeof attachment.data_base64 !== 'string' || !attachment.file_name) throw new Error(`Attachment ${String(attachment.id ?? attachment.file_name ?? '')} is incomplete.`);
  }
  const operation = await adminRequest<{ operation_id: string }>('start-restore');
  diagnostic('restore-started', { selectedWorkspaces: selectedWorkspaces.length });
  const users = archive.users;
  const emailById = new Map(users.map((user) => [String(user.id), String(user.email ?? '').toLowerCase()]));
  const resources = archive as Record<string, unknown>;
  const attachmentLinks = Array.isArray(resources.attachment_links) ? resources.attachment_links as Array<Record<string, unknown>> : [];
  const total = selectedWorkspaces.length + selectedAttachments.length;
  let completed = 0;
  const restored: Array<{ source_workspace_id: string; workspace_id: string; name: string }> = [];
  const missingUsers = new Set<string>();
  const invitations: Array<{ email: string; workspace_id: string; invite_token: string; workspace_name: string }> = [];
  try {
  for (const workspace of selectedWorkspaces) {
    const sourceId = String(workspace.id);
    const filterRows = (name: string) => (Array.isArray(resources[name]) ? resources[name] as Array<Record<string, unknown>> : []).filter((row) => String(row.workspace_id) === sourceId);
    const workspaceBackup = {
      workspace,
      members: filterRows('members').map((row) => ({ ...row, email: emailById.get(String(row.user_id)) ?? '' })),
      apps: filterRows('apps'),
      permissions: filterRows('permissions').map((row) => ({ ...row, email: emailById.get(String(row.user_id)) ?? '' })),
      snapshots: filterRows('snapshots'),
      audit_events: filterRows('audit_events'),
      invitations: filterRows('invitations'),
      trucks: filterRows('trucks'),
      truck_owners: filterRows('truck_owners'),
      truck_customers: filterRows('truck_customers'),
      truck_transactions: filterRows('truck_transactions'),
    };
    const result = await adminRequest<{ source_workspace_id: string; workspace_id: string; name: string; missing_users: string[] }>('restore-workspace', { operation_id: operation.operation_id, workspace_backup: workspaceBackup });
    restored.push(result); result.missing_users.forEach((email) => missingUsers.add(email)); completed += 1;
    for (const email of result.missing_users) {
      const permissions = (workspaceBackup.permissions as Array<Record<string, unknown>>).filter((permission) => String(permission.email).toLowerCase() === email.toLowerCase());
      const invitation = await adminRequest<{ email: string; workspace_id: string; invite_token: string }>('create-recovery-invitation', {
        operation_id: operation.operation_id, source_workspace_id: sourceId, email,
        book_permission: permissions.find((permission) => permission.app_id === 'book')?.permission ?? 'none',
        payroll_permission: permissions.find((permission) => permission.app_id === 'payroll')?.permission ?? 'none',
        truck_permission: permissions.find((permission) => permission.app_id === 'truck')?.permission ?? 'none',
      });
      invitations.push({ ...invitation, workspace_name: result.name });
    }
    onProgress({ stage: `Restored ${String(workspace.name)}`, percent: total ? Math.round(completed / total * 100) : 100, completed, total, bytes: 0 });
  }
  for (const attachment of selectedAttachments) {
    const bytes = base64ToBytes(String(attachment.data_base64 ?? ''));
    const prepared = await adminRequest<{ path: string; token: string }>('prepare-restore-attachment', { operation_id: operation.operation_id, source_workspace_id: attachment.workspace_id, file_name: attachment.file_name });
    const { error } = await supabase.storage.from('workspace-attachments').uploadToSignedUrl(prepared.path, prepared.token, new Blob([bytes as BlobPart], { type: String(attachment.mime_type ?? 'application/octet-stream') }));
    if (error) throw error;
    const links = attachmentLinks.filter((link) => String(link.attachment_id) === String(attachment.id));
    await adminRequest('finish-restore-attachment', { operation_id: operation.operation_id, source_workspace_id: attachment.workspace_id, path: prepared.path, record_type: attachment.record_type, record_id: attachment.record_id, file_name: attachment.file_name, mime_type: attachment.mime_type, size_bytes: bytes.byteLength, links });
    completed += 1;
    onProgress({ stage: `Restored ${String(attachment.file_name)}`, percent: total ? Math.round(completed / total * 100) : 100, completed, total, bytes: bytes.byteLength });
  }
  await adminRequest('verify-restore', { operation_id: operation.operation_id });
  const { data: currentUser } = await supabase.auth.getUser();
  if (!currentUser.user) throw new Error('The administrator session expired before the restored cache could be rebuilt.');
  onProgress({ stage: 'Rebuilding local cache', percent: total ? Math.min(98, Math.round(completed / total * 100)) : 98, completed, total, bytes: 0 });
  await Promise.all(restored.map((workspace) => prefetchWorkspaceData(workspace.workspace_id, currentUser.user.id)));
  await adminRequest('finish-restore', { operation_id: operation.operation_id, attachment_count: selectedAttachments.length });
  diagnostic('restore-completed', { restoredWorkspaces: restored.length, attachments: selectedAttachments.length });
  return { restored, missing_users: [...missingUsers], invitations };
  } catch (reason) {
    diagnostic('restore-failed', { selectedWorkspaces: selectedWorkspaces.length });
    await adminRequest('abort-restore', { operation_id: operation.operation_id, error_message: reason instanceof Error ? reason.message : 'Restore failed' }).catch(() => undefined);
    throw reason;
  }
}
