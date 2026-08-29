import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { EntitySyncStatus } from '../lib/reconciliation';
import { discardQueuedMutation, retryQueuedMutation } from '../lib/syncQueue';
import { syncWorkspaceQueues } from '../lib/offlineSync';

export function SyncIssueSheet() {
  const [issue, setIssue] = useState<EntitySyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const open = (event: Event) => setIssue((event as CustomEvent<EntitySyncStatus>).detail);
    window.addEventListener('mathan:open-sync-issue', open);
    return () => window.removeEventListener('mathan:open-sync-issue', open);
  }, []);
  if (!issue) return null;
  const retry = async (keepLocal = false) => {
    setBusy(true);
    try {
      if (await retryQueuedMutation(issue.mutationId, keepLocal) && issue.workspaceId) await syncWorkspaceQueues(issue.workspaceId);
    } finally { setBusy(false); setIssue(null); }
  };
  const useServer = async () => {
    if (!window.confirm('Use the server version? Your unsynchronized local change will be removed.')) return;
    setBusy(true);
    try {
      if (await discardQueuedMutation(issue.mutationId)) window.location.reload();
    }
    finally { setBusy(false); }
  };
  const conflict = issue.state === 'needs_attention';
  return <div className="fixed inset-0 z-[230] flex items-end bg-black/30 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="Sync issue">
    <section className="w-full rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl">
      <div className="flex items-start justify-between gap-3"><div className="flex gap-2"><AlertTriangle className="mt-0.5 h-5 w-5 text-red-700" /><div><h2 className="font-bold text-zinc-900">{conflict ? 'Sync needs attention' : 'Sync status'}</h2><p className="mt-1 text-xs text-zinc-600">{issue.message || 'This saved local change has not reached the server yet.'}</p></div></div><button type="button" onClick={() => setIssue(null)} aria-label="Close sync issue" className="rounded-lg p-1 text-zinc-500"><X className="h-5 w-5" /></button></div>
      {issue.updatedAt && <p className="mt-3 text-[11px] text-zinc-500">Last update: {new Date(issue.updatedAt).toLocaleString()}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setIssue(null)} className="rounded-lg border px-3 py-2 text-xs font-bold">Keep local</button>{conflict && <button type="button" disabled={busy} onClick={() => void useServer()} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700">Use server version</button>}<button type="button" disabled={busy} onClick={() => void retry(conflict)} className="rounded-lg bg-[#3f4d34] px-3 py-2 text-xs font-bold text-white">{busy ? 'Working…' : conflict ? 'Keep my saved change' : 'Retry now'}</button></div>
    </section>
  </div>;
}
