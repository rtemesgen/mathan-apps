import { ArrowRight, CheckCircle2, LoaderCircle, RefreshCw, Share2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ERP_APPS } from '../appRegistry';
import { shareApp } from '../lib/mobile';
import { useAppUpdate } from '../hooks/useAppUpdate';
import { AppVersionPanel } from './AppVersionPanel';

export function AppLauncher() {
  const { update, status, downloadStatus, checkForUpdate, downloadUpdate, installUpdate } = useAppUpdate();
  const downloading = downloadStatus === 'downloading';
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="grid gap-4 md:grid-cols-2">
        {ERP_APPS.map((app) => {
          const Icon = app.icon;
          return (
            <Link key={app.id} to={app.route} className="group rounded-3xl border border-[#e6e2d6] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg sm:p-7">
              <div className="flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900 text-white"><Icon className="h-6 w-6" /></div>
                <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-extrabold uppercase tracking-wider text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Available</span>
              </div>
              <h2 className="mt-8 font-serif text-2xl font-bold text-zinc-900">{app.name}</h2>
              <span className="mt-7 inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-zinc-900">Open app <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
            </Link>
          );
        })}
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
