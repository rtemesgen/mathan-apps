import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

export function AppToast() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    let timeout: number | undefined;
    const handleToast = (event: Event) => {
      setMessage((event as CustomEvent<string>).detail);
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setMessage(''), 2600);
    };
    window.addEventListener('mathan:toast', handleToast);
    return () => {
      window.removeEventListener('mathan:toast', handleToast);
      if (timeout) window.clearTimeout(timeout);
    };
  }, []);

  if (!message) return null;
  return <div className="native-safe-bottom fixed bottom-5 left-1/2 z-[220] flex -translate-x-1/2 items-center gap-2 rounded-full bg-zinc-900 px-4 py-2.5 text-xs font-bold text-white shadow-xl animate-in fade-in slide-in-from-bottom-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" />{message}</div>;
}
