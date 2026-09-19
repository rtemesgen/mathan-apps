import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { EntitySyncStatus } from '../lib/reconciliation';
import { discardQueuedMutation, resolveSnapshotConflict, retryQueuedMutation } from '../lib/syncQueue';
import { syncWorkspaceQueues } from '../lib/offlineSync';
import { resolveTruckConflict } from '../apps/truck/truckRepository';

export function SyncIssueSheet() {
  const [issue, setIssue] = useState<EntitySyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const open = (event: Event) => { setError(null); setIssue((event as CustomEvent<EntitySyncStatus>).detail); };
    window.addEventListener('mathan:open-sync-issue', open);
    return () => window.removeEventListener('mathan:open-sync-issue', open);
  }, []);
  if (!issue) return null;
  const retry = async (keepLocal = false) => {
    setBusy(true);
    setError(null);
    try {
      const resolved = keepLocal && issue.table === 'app_state_snapshots'
        ? await resolveSnapshotConflict(issue.mutationId)
        : keepLocal && (issue.table.startsWith('truck_') || issue.table === 'trucks')
          ? await resolveTruckConflict(issue.mutationId, 'keep-local')
        : await retryQueuedMutation(issue.mutationId, false);
      if (!resolved) throw new Error('This sync issue changed before it could be resolved. Review it again.');
      if (issue.workspaceId) await syncWorkspaceQueues(issue.workspaceId);
      setIssue(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not resolve this sync issue. Your saved local change was preserved.');
    } finally { setBusy(false); }
  };
  const useServer = async () => {
    if (!window.confirm('Use the server version? Your unsynchronized local change will be removed.')) return;
    setBusy(true);
    setError(null);
    try {
      if (issue.table.startsWith('truck_') || issue.table === 'trucks') {
        const resolved = await resolveTruckConflict(issue.mutationId, 'use-server');
        if (!resolved) throw new Error('This sync issue changed before it could be resolved. Review it again.');
        if (issue.workspaceId) await syncWorkspaceQueues(issue.workspaceId);
      } else {
        if (!await discardQueuedMutation(issue.mutationId)) throw new Error('This sync issue changed before it could be resolved. Review it again.');
        window.location.reload();
      }
      setIssue(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not use the server version. Your saved local change was preserved.');
    }
    finally { setBusy(false); }
  };
  const conflict = issue.state === 'needs_attention';
  return <div className="fixed inset-0 z-[230] flex items-end bg-black/30 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="Sync issue">
    <section className="w-full rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl">
      <div className="flex items-start justify-between gap-3"><div className="flex gap-2"><AlertTriangle className="mt-0.5 h-5 w-5 text-red-700" /><div><h2 className="font-bold text-zinc-900">{conflict ? 'Sync needs attention' : 'Sync status'}</h2><p className="mt-1 text-xs text-zinc-600">{issue.message || 'This saved local change has not reached the server yet.'}</p></div></div><button type="button" onClick={() => setIssue(null)} aria-label="Close sync issue" className="rounded-lg p-1 text-zinc-500"><X className="h-5 w-5" /></button></div>
      {issue.updatedAt && <p className="mt-3 text-[11px] text-zinc-500">Last update: {new Date(issue.updatedAt).toLocaleString()}</p>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-800">{error}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setIssue(null)} className="rounded-lg border px-3 py-2 text-xs font-bold">Keep local</button>{conflict && <button type="button" disabled={busy} onClick={() => void useServer()} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700">Use server version</button>}<button type="button" disabled={busy} onClick={() => void retry(conflict)} className="rounded-lg bg-[#3f4d34] px-3 py-2 text-xs font-bold text-white">{busy ? 'Working…' : conflict ? 'Keep my saved change' : 'Retry now'}</button></div>
    </section>
  </div>;
}
