import { readOffline, writeOffline } from '../lib/localStore';
import { saveBinaryFile } from '../lib/mobile';
import { adminRequest } from './adminApi';
import { supabase } from '../lib/supabase';

const KEY_STORAGE = 'admin:backup-key';
const KEY_META_STORAGE = 'admin:backup-key-meta';
const LATEST_BACKUP = 'admin:latest-backup';
const DAILY_MARKER = 'mathan_admin_backup_day';
const DAILY_RUNNING_MARKER = 'mathan_admin_backup_running_day';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

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
export async function hasDeviceBackupKey() { return isCryptoKey(await readOffline<CryptoKey>(KEY_STORAGE)); }
export async function configureDeviceBackupKey(passphrase: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  const verifier = await digest({ salt: bytesToBase64(salt), purpose: 'mathan-admin-backup' });
  await writeOffline(KEY_STORAGE, key);
  await writeOffline<BackupKeyMeta>(KEY_META_STORAGE, { salt: bytesToBase64(salt), verifier });
  if (!isCryptoKey(await readOffline<CryptoKey>(KEY_STORAGE))) throw new Error('This browser could not store the protected device key. Check private-browsing or storage restrictions.');
}
export function backupCompletedToday() { const today = new Date().toISOString().slice(0, 10); return localStorage.getItem(DAILY_MARKER) === today || localStorage.getItem(DAILY_RUNNING_MARKER) === today; }
export function markAutomaticBackupStarted() { localStorage.setItem(DAILY_RUNNING_MARKER, new Date().toISOString().slice(0, 10)); }
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
  const key = await readOffline<CryptoKey>(KEY_STORAGE);
  const keyMeta = await readOffline<BackupKeyMeta>(KEY_META_STORAGE);
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
    await writeOffline(LATEST_BACKUP, content);
    await adminRequest('finish-backup', { run_id: started.run.id, status: 'completed', record_count: completed, attachment_count: started.counts.attachments ?? 0, size_bytes: content.length, checksum });
    localStorage.setItem(DAILY_MARKER, new Date().toISOString().slice(0, 10));
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
  await saveBinaryFile(filename, 'application/json', encoder.encode(content));
}
export async function downloadLatestBackup() {
  const content = await readOffline<string>(LATEST_BACKUP);
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
  const operation = await adminRequest<{ operation_id: string }>('start-restore');
  const users = archive.users;
  const emailById = new Map(users.map((user) => [String(user.id), String(user.email ?? '').toLowerCase()]));
  const resources = archive as Record<string, unknown>;
  const selectedWorkspaces = archive.workspaces.filter((workspace) => workspaceIds.includes(String(workspace.id)));
  const selectedAttachments = archive.attachments.filter((attachment) => workspaceIds.includes(String(attachment.workspace_id)));
  const total = selectedWorkspaces.length + selectedAttachments.length;
  let completed = 0;
  const restored: Array<{ source_workspace_id: string; workspace_id: string; name: string }> = [];
  const missingUsers = new Set<string>();
  const invitations: Array<{ email: string; workspace_id: string; invite_token: string; workspace_name: string }> = [];
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
    };
    const result = await adminRequest<{ source_workspace_id: string; workspace_id: string; name: string; missing_users: string[] }>('restore-workspace', { operation_id: operation.operation_id, workspace_backup: workspaceBackup });
    restored.push(result); result.missing_users.forEach((email) => missingUsers.add(email)); completed += 1;
    for (const email of result.missing_users) {
      const permissions = (workspaceBackup.permissions as Array<Record<string, unknown>>).filter((permission) => String(permission.email).toLowerCase() === email.toLowerCase());
      const invitation = await adminRequest<{ email: string; workspace_id: string; invite_token: string }>('create-recovery-invitation', {
        operation_id: operation.operation_id, source_workspace_id: sourceId, email,
        book_permission: permissions.find((permission) => permission.app_id === 'book')?.permission ?? 'none',
        payroll_permission: permissions.find((permission) => permission.app_id === 'payroll')?.permission ?? 'none',
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
    await adminRequest('finish-restore-attachment', { operation_id: operation.operation_id, source_workspace_id: attachment.workspace_id, path: prepared.path, record_type: attachment.record_type, record_id: attachment.record_id, file_name: attachment.file_name, mime_type: attachment.mime_type, size_bytes: bytes.byteLength });
    completed += 1;
    onProgress({ stage: `Restored ${String(attachment.file_name)}`, percent: total ? Math.round(completed / total * 100) : 100, completed, total, bytes: bytes.byteLength });
  }
  await adminRequest('finish-restore', { operation_id: operation.operation_id, attachment_count: selectedAttachments.length });
  return { restored, missing_users: [...missingUsers], invitations };
}
