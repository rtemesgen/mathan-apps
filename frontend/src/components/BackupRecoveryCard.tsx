import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { createWorkspaceBackup, downloadWorkspaceBackup, restoreWorkspaceBackup, uploadEncryptedWorkspaceBackup, validateWorkspaceBackup, type WorkspaceBackup } from '../lib/workspaceBackup';

export function BackupRecoveryCard() {
  const { workspace, refreshWorkspace } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [restoreDraft, setRestoreDraft] = useState<{ backup: WorkspaceBackup; name: string } | null>(null);
  const [passphraseOpen, setPassphraseOpen] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const exportBackup = async () => {
    if (!workspace) return; setBusy(true); setError(''); setMessage('');
    try { await downloadWorkspaceBackup(await createWorkspaceBackup(workspace.id)); setMessage('Workspace backup saved in Android/media/.../backups.'); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Backup export failed.'); } finally { setBusy(false); }
  };
  const importBackup = async (file: File) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const backup = await validateWorkspaceBackup(JSON.parse(await file.text())) as WorkspaceBackup;
      setRestoreDraft({ backup, name: `${String(backup.workspace.name ?? 'Restored workspace')} (Restored)` });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Backup restore failed.'); } finally { setBusy(false); }
  };
  const uploadBackup = async () => {
    if (!workspace) return; setPassphrase(''); setPassphraseOpen(true);
  };
  const finishUpload = async () => { if (!workspace || passphrase.length < 12) { setError('Use an encryption passphrase of at least 12 characters.'); return; } setPassphraseOpen(false); setBusy(true); try { const filename = await uploadEncryptedWorkspaceBackup(workspace.id, await createWorkspaceBackup(workspace.id), passphrase); setMessage(`Encrypted backup uploaded: ${filename.split('/').pop()}`); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Encrypted backup upload failed.'); } finally { setBusy(false); } };
  const finishRestore = async () => { if (!restoreDraft?.name.trim()) return; setRestoreDraft(null); setBusy(true); try { const id = await restoreWorkspaceBackup(restoreDraft.backup, restoreDraft.name.trim()); await refreshWorkspace(id); setMessage('Backup restored into a new workspace.'); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Backup restore failed.'); } finally { setBusy(false); } };
  return <><section className="rounded-2xl border border-[#e6e2d6] bg-white p-5 shadow-sm"><h2 className="font-serif text-xl font-bold">Backup and recovery</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Export a validated workspace backup or restore one into a new workspace. Existing workspaces are never overwritten.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy || !workspace} onClick={() => void exportBackup()} className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Download className="h-3.5 w-3.5" /> Export backup</button><button type="button" disabled={busy || !workspace} onClick={() => void uploadBackup()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-800 disabled:opacity-50"><Upload className="h-3.5 w-3.5" /> Upload encrypted copy</button><label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#e6e2d6] px-3 py-2 text-xs font-bold text-zinc-700 ${busy ? 'pointer-events-none opacity-50' : ''}`}><Upload className="h-3.5 w-3.5" /> Restore backup<input type="file" accept="application/json,.json" className="hidden" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file); event.currentTarget.value = ''; }} /></label></div>{message && <p className="mt-3 text-xs font-semibold text-emerald-700">{message}</p>}{error && <p className="mt-3 text-xs font-semibold text-red-700">{error}</p>}</section>{(restoreDraft || passphraseOpen) && <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4"><section role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl border border-[#e6e2d6] bg-white p-5 shadow-2xl"><h2 className="font-serif text-xl font-bold">{restoreDraft ? 'Name restored workspace' : 'Encrypt workspace backup'}</h2><p className="mt-2 text-xs leading-5 text-zinc-500">{restoreDraft ? 'This creates a new workspace and never overwrites the current one.' : 'The passphrase protects the uploaded backup. It is never sent to the server.'}</p>{restoreDraft ? <input autoFocus value={restoreDraft.name} onChange={(event) => setRestoreDraft((current) => current ? { ...current, name: event.target.value } : current)} className="mt-4 w-full rounded-xl border border-[#e6e2d6] p-3 text-sm" placeholder="Restored workspace name" /> : <input autoFocus type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} className="mt-4 w-full rounded-xl border border-[#e6e2d6] p-3 text-sm" placeholder="Encryption passphrase (12+ characters)" /> }<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => { setRestoreDraft(null); setPassphraseOpen(false); }} className="rounded-xl border border-[#e6e2d6] px-4 py-2.5 text-xs font-bold text-zinc-700">Cancel</button><button type="button" onClick={() => void (restoreDraft ? finishRestore() : finishUpload())} className="rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-bold text-white">{restoreDraft ? 'Restore workspace' : 'Encrypt and upload'}</button></div></section></div>}</>;
}
