import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CheckCircle2, CircleAlert, CloudOff, LoaderCircle } from 'lucide-react';
import { persistenceLabels, type PersistenceState } from '../lib/repositories/types';
import type { ToastEvent } from '../lib/toast';

type VisibleToast = { message: string; state?: PersistenceState; tone?: 'success' | 'error' | 'info'; conflict?: SyncConflict };
type SyncConflict = { domain: string; revision: number };

function appForPath(pathname: string) {
  if (pathname.startsWith('/book')) return 'cash_book';
  if (pathname.startsWith('/payroll')) return 'payroll';
  if (pathname.startsWith('/truck')) return 'truck';
  return null;
}

export function AppToast() {
  const location = useLocation();
  const [toast, setToast] = useState<VisibleToast | null>(null);
  const lastKey = useRef('');
  const recentPersistenceAt = useRef(0);

  useEffect(() => {
    let timeout: number | undefined;
    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastEvent>).detail;
      let next: VisibleToast | null = null;
      if (detail?.kind === 'message') {
        if (detail.tone !== 'error' && Date.now() - recentPersistenceAt.current < 1500) return;
        next = { message: detail.message, tone: detail.tone ?? 'success' };
      }
      if (detail?.kind === 'persistence' && detail.notice.app === appForPath(location.pathname)) {
        if (detail.notice.state !== 'saving') recentPersistenceAt.current = Date.now();
        next = { state: detail.notice.state, message: detail.notice.message ?? persistenceLabels[detail.notice.state] };
      }
      if (!next) return;
      const key = `${next.state ?? 'message'}:${next.message}`;
      if (key === lastKey.current) return;
      lastKey.current = key;
      setToast(next);
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => { setToast(null); lastKey.current = ''; }, next.state === 'storage error' || next.state === 'sync conflict' ? 5000 : 1800);
    };
    const handleSyncStatus = (event: Event) => {
      const status = (event as CustomEvent<{ status?: 'synced' | 'syncing' | 'offline' | 'retry' | 'conflicted' | 'error' }>).detail?.status;
      const next = status === 'offline'
        ? { state: 'offline saved' as PersistenceState, message: 'Offline · saved locally' }
        : status === 'syncing'
          ? { state: 'sync pending' as PersistenceState, message: 'Syncing…' }
          : status === 'retry'
            ? { state: 'sync pending' as PersistenceState, message: 'Sync pending · will retry automatically' }
            : status === 'conflicted'
              ? { state: 'sync conflict' as PersistenceState, message: 'Sync conflict · local data retained' }
              : status === 'error'
                ? { message: 'Sync error · will retry automatically', tone: 'error' as const }
                : null;
      if (!next) return;
      const key = `${next.state ?? 'message'}:${next.message}`;
      if (key === lastKey.current) return;
      lastKey.current = key;
      setToast(next);
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => { setToast(null); lastKey.current = ''; }, next.state === 'sync conflict' ? 5000 : 1800);
    };
    const handleSyncConflict = (event: Event) => {
      const detail = (event as CustomEvent<SyncConflict>).detail;
      const app = detail?.domain?.startsWith('cash_book:') ? 'cash_book' : detail?.domain?.startsWith('payroll:') ? 'payroll' : null;
      if (app && appForPath(location.pathname) !== app) return;
      const next = { state: 'sync conflict' as PersistenceState, message: `Sync conflict · newer ${detail.domain.replace(':', ' ')} data exists`, tone: 'error' as const, conflict: detail };
      lastKey.current = `${next.state}:${next.message}`;
      setToast(next);
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => { setToast(null); lastKey.current = ''; }, 5000);
    };
    window.addEventListener('mathan:toast', handleToast);
    window.addEventListener('mathan:sync-status', handleSyncStatus);
    window.addEventListener('mathan:sync-conflict', handleSyncConflict);
    return () => {
      window.removeEventListener('mathan:toast', handleToast);
      window.removeEventListener('mathan:sync-status', handleSyncStatus);
      window.removeEventListener('mathan:sync-conflict', handleSyncConflict);
      if (timeout) window.clearTimeout(timeout);
    };
  }, [location.pathname]);

  if (!toast) return null;
  const critical = toast.state === 'storage error' || toast.state === 'sync conflict' || toast.tone === 'error';
  const working = toast.state === 'saving' || toast.state === 'sync pending';
  const Icon = critical ? CircleAlert : working ? (toast.state === 'saving' ? LoaderCircle : CloudOff) : CheckCircle2;
  const info = toast.tone === 'info';
  return <div role={critical ? 'alert' : 'status'} className={`pointer-events-auto fixed right-4 top-4 z-[220] max-w-[min(24rem,calc(100vw-2rem))] rounded-xl border px-4 py-3 text-xs font-semibold shadow-lg animate-in fade-in slide-in-from-top-2 ${critical ? 'border-red-200 bg-red-50 text-red-800' : working ? 'border-amber-200 bg-amber-50 text-amber-900' : info ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}><div className="flex items-center gap-2"><Icon className={`h-4 w-4 shrink-0 ${toast.state === 'saving' ? 'animate-spin' : ''}`} />{toast.message}</div>{toast.conflict && <div className="mt-3 flex gap-2"><button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-red-900 px-2.5 py-1.5 text-[11px] font-bold text-white">Reload remote</button><button type="button" onClick={() => setToast(null)} className="rounded-lg border border-red-300 px-2.5 py-1.5 text-[11px] font-bold">Keep local</button></div>}</div>;
}
