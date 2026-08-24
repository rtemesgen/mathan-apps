import type { PersistenceState } from '../lib/repositories/types';

export function PersistenceToast({ state, label }: { state: PersistenceState; label: string }) {
  const critical = state === 'storage error' || state === 'sync conflict';
  const working = state === 'saving' || state === 'sync pending';
  return (
    <div
      role={critical ? 'alert' : 'status'}
      className={`pointer-events-none fixed right-4 top-4 z-[200] max-w-[min(24rem,calc(100vw-2rem))] rounded-xl border px-4 py-3 text-xs font-semibold shadow-lg ${critical ? 'border-red-200 bg-red-50 text-red-800' : working ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
    >
      {label}
    </div>
  );
}
