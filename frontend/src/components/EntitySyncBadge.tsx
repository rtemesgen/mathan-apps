import { useSyncExternalStore } from 'react';
import { AlertTriangle, Clock3, LoaderCircle } from 'lucide-react';
import { deriveEntitySyncStatuses, type EntitySyncStatus } from '../lib/reconciliation';
import { getQueuedMutations } from '../lib/syncQueue';

let statuses = new Map<string, EntitySyncStatus>();
const listeners = new Set<() => void>();
let attached = false;
let refreshPromise: Promise<void> | null = null;

function notify() { listeners.forEach((listener) => listener()); }

function refreshStatuses() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = getQueuedMutations()
    .then((queue) => { statuses = deriveEntitySyncStatuses(queue); notify(); })
    .finally(() => { refreshPromise = null; });
  return refreshPromise;
}

function attach() {
  if (attached || typeof window === 'undefined') return;
  attached = true;
  const refresh = () => { void refreshStatuses(); };
  window.addEventListener('mathan:sync-progress', refresh);
  window.addEventListener('mathan:sync-status', refresh);
  window.addEventListener('online', refresh);
  document.addEventListener('visibilitychange', refresh);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  attach();
  void refreshStatuses();
  return () => { listeners.delete(listener); };
}

export function useEntitySyncStatus(table: string, entityId: string) {
  return useSyncExternalStore(
    subscribe,
    () => statuses.get(`${table}:${entityId}`) ?? null,
    () => null,
  );
}

export function EntitySyncBadge({ table, entityId, recordLabel, className = '' }: { table: string; entityId: string; recordLabel?: string; className?: string }) {
  const status = useEntitySyncStatus(table, entityId);
  if (!status) return null;
  const detail = status.state === 'sending'
    ? { label: 'Sending', icon: LoaderCircle, style: 'border-blue-200 bg-blue-50 text-blue-700', spin: true }
    : status.state === 'needs_attention'
      ? { label: 'Needs attention', icon: AlertTriangle, style: 'border-red-200 bg-red-50 text-red-700', spin: false }
      : { label: 'Pending', icon: Clock3, style: 'border-amber-200 bg-amber-50 text-amber-800', spin: false };
  const Icon = detail.icon;
  return <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('mathan:open-sync-issue', { detail: status }))} aria-label={`Sync status: ${detail.label}. Open sync issue.`} className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${detail.style} ${className}`}>
    <Icon aria-hidden="true" className={`h-2.5 w-2.5 ${detail.spin ? 'animate-spin' : ''}`} />
    {recordLabel ? `${recordLabel} · ${detail.label}` : detail.label}
  </button>;
}
