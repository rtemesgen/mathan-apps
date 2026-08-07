import { CheckCircle2, Download, LoaderCircle, X } from 'lucide-react';
import { useAppUpdate } from '../hooks/useAppUpdate';

export function AppUpdateNotice() {
  const { update, downloadStatus, noticeVisible, installUpdate, dismissUpdate } = useAppUpdate();
  if (!update || !noticeVisible) return null;
  const downloading = downloadStatus === 'downloading';
  const ready = downloadStatus === 'ready';
  const failed = downloadStatus === 'error';
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="native-safe-bottom w-full max-w-sm animate-in fade-in zoom-in-95 rounded-3xl border border-[#d8d3c5] bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-900 text-white ${downloading ? 'animate-pulse' : ''}`}>{ready ? <CheckCircle2 className="h-5 w-5" /> : <Download className="h-5 w-5" />}</div><button onClick={dismissUpdate} aria-label="Close update popup" className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100"><X className="h-4 w-4" /></button></div>
        <h2 className="mt-4 text-base font-extrabold text-zinc-900">Mathan ERP update {update.version}</h2>
        <p className="mt-1 text-sm leading-6 text-zinc-500">{downloading ? 'Downloading the update… keep the app open for a moment. You cannot start it twice.' : ready ? 'Download complete. Install the update when you are ready.' : failed ? 'The download failed. Try again when you are online.' : 'A new version is available.'}</p>
        <button onClick={installUpdate} disabled={downloading} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-60">{downloading ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Downloading…</> : ready ? 'Install update' : failed ? 'Try download again' : 'Download update'}</button>
      </div>
    </div>
  );
}
