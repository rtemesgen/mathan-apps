import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CheckCircle2, CircleAlert, CloudOff, LoaderCircle } from 'lucide-react';
import { persistenceLabels, type PersistenceState } from '../lib/repositories/types';
import type { ToastEvent } from '../lib/toast';

type VisibleToast = { message: string; state?: PersistenceState };

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

  useEffect(() => {
    let timeout: number | undefined;
    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastEvent>).detail;
      let next: VisibleToast | null = null;
      if (detail?.kind === 'message') next = { message: detail.message };
      if (detail?.kind === 'persistence' && detail.notice.app === appForPath(location.pathname)) {
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
    window.addEventListener('mathan:toast', handleToast);
    return () => {
      window.removeEventListener('mathan:toast', handleToast);
      if (timeout) window.clearTimeout(timeout);
    };
  }, [location.pathname]);

  if (!toast) return null;
  const critical = toast.state === 'storage error' || toast.state === 'sync conflict';
  const working = toast.state === 'saving' || toast.state === 'sync pending';
  const Icon = critical ? CircleAlert : working ? (toast.state === 'saving' ? LoaderCircle : CloudOff) : CheckCircle2;
  return <div role={critical ? 'alert' : 'status'} className={`pointer-events-none fixed right-4 top-4 z-[220] flex max-w-[min(24rem,calc(100vw-2rem))] items-center gap-2 rounded-xl border px-4 py-3 text-xs font-semibold shadow-lg animate-in fade-in slide-in-from-top-2 ${critical ? 'border-red-200 bg-red-50 text-red-800' : working ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}><Icon className={`h-4 w-4 shrink-0 ${toast.state === 'saving' ? 'animate-spin' : ''}`} />{toast.message}</div>;
}
