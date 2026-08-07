import { Download, X } from 'lucide-react';
import { useAppUpdate } from '../hooks/useAppUpdate';

export function AppUpdateNotice() {
  const { update, openUpdate, dismissUpdate } = useAppUpdate();
  if (!update) return null;
  return (
    <div className="native-safe-bottom fixed bottom-3 left-3 right-3 z-[200] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-[#d8d3c5] bg-white p-3 shadow-2xl">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white"><Download className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1"><p className="text-xs font-extrabold text-zinc-900">Update available</p><p className="mt-0.5 text-[11px] text-zinc-500">Mathan ERP {update.version} is downloading. Android will ask you to install it.</p></div>
      <button onClick={openUpdate} className="rounded-xl bg-zinc-900 px-3 py-2 text-[11px] font-bold text-white">Install</button>
      <button onClick={dismissUpdate} aria-label="Dismiss update" className="rounded-lg p-1 text-zinc-400"><X className="h-4 w-4" /></button>
    </div>
  );
}
