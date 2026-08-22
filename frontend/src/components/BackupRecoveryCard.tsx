import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { createWorkspaceBackup, downloadWorkspaceBackup, restoreWorkspaceBackup, uploadEncryptedWorkspaceBackup, validateWorkspaceBackup, type WorkspaceBackup } from '../lib/workspaceBackup';

export function BackupRecoveryCard() {
  const { workspace, refreshWorkspace } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const exportBackup = async () => {
    if (!workspace) return; setBusy(true); setError(''); setMessage('');
    try { downloadWorkspaceBackup(await createWorkspaceBackup(workspace.id)); setMessage('Workspace backup downloaded.'); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Backup export failed.'); } finally { setBusy(false); }
  };
  const importBackup = async (file: File) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const backup = await validateWorkspaceBackup(JSON.parse(await file.text())) as WorkspaceBackup;
      const name = window.prompt('Name for the restored workspace:', `${String(backup.workspace.name ?? 'Restored workspace')} (Restored)`);
      if (!name) return;
      const id = await restoreWorkspaceBackup(backup, name);
      await refreshWorkspace(id); setMessage('Backup restored into a new workspace.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Backup restore failed.'); } finally { setBusy(false); }
  };
  const uploadBackup = async () => {
    if (!workspace) return; setBusy(true); setError(''); setMessage('');
    try { const passphrase = window.prompt('Encryption passphrase (12+ characters):') ?? ''; const filename = await uploadEncryptedWorkspaceBackup(workspace.id, await createWorkspaceBackup(workspace.id), passphrase); setMessage(`Encrypted backup uploaded: ${filename.split('/').pop()}`); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Encrypted backup upload failed.'); } finally { setBusy(false); }
  };
  return <section className="rounded-2xl border border-[#e6e2d6] bg-white p-5 shadow-sm"><h2 className="font-serif text-xl font-bold">Backup and recovery</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Export a validated workspace backup or restore one into a new workspace. Existing workspaces are never overwritten.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy || !workspace} onClick={() => void exportBackup()} className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Download className="h-3.5 w-3.5" /> Export backup</button><button type="button" disabled={busy || !workspace} onClick={() => void uploadBackup()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-800 disabled:opacity-50"><Upload className="h-3.5 w-3.5" /> Upload encrypted copy</button><label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#e6e2d6] px-3 py-2 text-xs font-bold text-zinc-700 ${busy ? 'pointer-events-none opacity-50' : ''}`}><Upload className="h-3.5 w-3.5" /> Restore backup<input type="file" accept="application/json,.json" className="hidden" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file); event.currentTarget.value = ''; }} /></label></div>{message && <p className="mt-3 text-xs font-semibold text-emerald-700">{message}</p>}{error && <p className="mt-3 text-xs font-semibold text-red-700">{error}</p>}</section>;
}
