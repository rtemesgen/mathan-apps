import { AlertTriangle, CheckCircle2, LoaderCircle, RefreshCw, Settings, Share2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ERP_APPS } from '../appRegistry';
import { shareApp } from '../lib/mobile';
import { useAppUpdate } from '../hooks/useAppUpdate';
import { AppVersionPanel } from './AppVersionPanel';
import { useAuth } from '../auth/AuthProvider';
import { WorkspaceInvitations } from './WorkspaceInvitations';
import { cancelAccountDeletion, getAccountDeletionRequest, type AccountDeletionRequest } from '../lib/operationsApi';
import { useEffect, useState } from 'react';

export function AppLauncher() {
  const { workspace, user, canViewApp, isSystemAdmin, refreshAccess } = useAuth();
  const [deletion, setDeletion] = useState<AccountDeletionRequest | null>(null);
  const [remainingDays, setRemainingDays] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  useEffect(() => { void refreshAccess(); const onFocus = () => void refreshAccess(); window.addEventListener('focus', onFocus); return () => window.removeEventListener('focus', onFocus); }, []);
  useEffect(() => { if (!user) return; let active = true; const load = async () => { try { const request = await getAccountDeletionRequest(user.id); if (active && request?.status === 'pending') { setDeletion(request); setRemainingDays(Math.max(0, Math.ceil((new Date(request.scheduled_for).getTime() - Date.now()) / 86400000))); } } catch { /* The root page remains usable if the optional status check fails. */ } }; void load(); const timer = window.setInterval(() => { if (deletion) setRemainingDays(Math.max(0, Math.ceil((new Date(deletion.scheduled_for).getTime() - Date.now()) / 86400000))); }, 60000); return () => { active = false; window.clearInterval(timer); }; }, [user?.id, deletion?.scheduled_for]);
  const cancelDeletion = async () => { setCancelling(true); try { await cancelAccountDeletion(); setDeletion(null); setRemainingDays(0); } finally { setCancelling(false); } };
  const { update, status, downloadStatus, checkForUpdate, downloadUpdate, installUpdate } = useAppUpdate();
  const downloading = downloadStatus === 'downloading';
  return (
    <main className="erp-app mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {workspace?.name && <p className="mb-5 flex items-center justify-center gap-2 text-center font-serif text-2xl font-bold text-zinc-900 sm:text-3xl"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: workspace.accent_color }} />{workspace.name}</p>}
      {deletion && <section role="status" className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-red-950 shadow-sm"><AlertTriangle className="h-5 w-5 shrink-0 text-red-700" /><div className="min-w-0 flex-1"><p className="text-sm font-extrabold">Account deletion is scheduled</p><p className="mt-1 text-xs leading-5 text-red-800">{deletion.delete_owned_workspaces ? 'Your account and solely owned companies are scheduled for deletion.' : 'Your account deletion is scheduled after ownership is transferred.'} You have <strong>{remainingDays} day{remainingDays === 1 ? '' : 's'}</strong> to recover it.</p></div><button type="button" disabled={cancelling} onClick={() => void cancelDeletion()} className="rounded-xl border-2 border-red-300 bg-white px-4 py-2 text-xs font-extrabold text-red-800 shadow-sm hover:bg-red-100 disabled:opacity-50">{cancelling ? 'Cancelling…' : 'Cancel deletion'}</button></section>}
      <WorkspaceInvitations />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ERP_APPS.filter((app) => workspace && canViewApp(app.id)).map((app) => {
          const Icon = app.icon;
          return (
            <Link key={app.id} to={app.route} aria-label={app.name} className="group flex items-center gap-3 rounded-xl border border-[#e6e2d6] bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg sm:p-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white"><Icon className="h-4 w-4" /></div>
              <h2 className="font-serif text-lg font-bold text-zinc-900">{app.name}</h2>
            </Link>
          );
        })}
        {isSystemAdmin && <Link to="/admin" aria-label="Admin" className="group flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-lg sm:p-3.5"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-600 text-white"><ShieldCheck className="h-4 w-4" /></div><div><h2 className="font-serif text-lg font-bold text-zinc-900">Admin</h2><p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">System control</p></div></Link>}
        <Link to="/settings" aria-label="Settings" className="group flex items-center gap-3 rounded-xl border border-dashed border-[#cfcabb] bg-[#faf9f5] p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-400 sm:p-3.5"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800"><Settings className="h-4 w-4" /></div><h2 className="font-serif text-lg font-bold text-zinc-900">Settings</h2></Link>
      </section>
      <footer className="mt-8 flex flex-wrap items-end justify-between gap-4 border-t border-[#e6e2d6] pt-5">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void shareApp()} className="inline-flex items-center gap-2 rounded-xl border border-[#e6e2d6] bg-white px-3 py-2 text-xs font-bold text-zinc-800 shadow-sm hover:border-zinc-300"><Share2 className="h-4 w-4" /> Share app</button>
          <button disabled={status === 'checking' || downloading} onClick={() => void (update ? downloadStatus === 'ready' ? installUpdate() : downloadUpdate() : checkForUpdate())} className="inline-flex items-center gap-2 rounded-xl border border-[#e6e2d6] bg-white px-3 py-2 text-xs font-bold text-zinc-800 shadow-sm transition hover:border-zinc-300 disabled:cursor-wait disabled:opacity-70">{status === 'checking' || downloading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 transition-transform hover:rotate-180" />}{status === 'checking' ? 'Checking…' : downloading ? 'Downloading update…' : update ? downloadStatus === 'ready' ? `Install update ${update.version}` : `Download update ${update.version}` : 'Check for updates'}</button>
          {status === 'up-to-date' && <span className="flex items-center gap-1.5 self-center text-[11px] font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> You’re up to date.</span>}
          {status === 'error' && <span className="self-center text-[11px] font-semibold text-zinc-500">Could not check right now.</span>}
        </div>
        <AppVersionPanel />
      </footer>
    </main>
  );
}
