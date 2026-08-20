import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

export type ToastDetail = { message: string; type?: 'success' | 'error' | 'info' };

export function AppToast() {
  const [toast, setToast] = useState<ToastDetail | null>(null);

  useEffect(() => {
    let timeout: number | undefined;
    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<string | ToastDetail>).detail;
      setToast(typeof detail === 'string' ? { message: detail, type: 'success' } : detail);
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setToast(null), detail && typeof detail !== 'string' && detail.type === 'error' ? 5000 : 3200);
    };
    window.addEventListener('mathan:toast', handleToast);
    return () => {
      window.removeEventListener('mathan:toast', handleToast);
      if (timeout) window.clearTimeout(timeout);
    };
  }, []);

  if (!toast) return null;
  const type = toast.type ?? 'success';
  const Icon = type === 'error' ? AlertCircle : type === 'info' ? Info : CheckCircle2;
  return <div role={type === 'error' ? 'alert' : 'status'} aria-live={type === 'error' ? 'assertive' : 'polite'} className={`native-safe-bottom fixed bottom-5 left-1/2 z-[220] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold text-white shadow-xl animate-in fade-in slide-in-from-bottom-2 ${type === 'error' ? 'bg-red-700' : 'bg-zinc-900'}`}><Icon className={`h-4 w-4 shrink-0 ${type === 'success' ? 'text-emerald-400' : 'text-white'}`} />{toast.message}</div>;
}
