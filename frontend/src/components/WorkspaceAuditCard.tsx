import { useEffect, useState } from 'react';
import { ClipboardList, LoaderCircle } from 'lucide-react';
import { listWorkspaceAuditEvents, type WorkspaceAuditEvent } from '../lib/operationsApi';

export function WorkspaceAuditCard({ workspaceId }: { workspaceId?: string }) {
  const [events, setEvents] = useState<WorkspaceAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    void listWorkspaceAuditEvents(workspaceId).then(setEvents).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load the company audit.')).finally(() => setLoading(false));
  }, [workspaceId]);
  return <section className="rounded-2xl border border-[#e6e2d6] bg-white p-5 shadow-sm">
    <div className="flex items-start gap-3"><ClipboardList className="mt-0.5 h-5 w-5 text-emerald-700" /><div><h2 className="font-serif text-xl font-bold">Company activity</h2><p className="mt-1 text-xs leading-5 text-zinc-500">See who changed company settings and records.</p></div></div>
    {loading ? <div className="mt-5 flex items-center gap-2 text-xs text-zinc-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading activity…</div> : error ? <p className="mt-5 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-800">{error}</p> : events.length === 0 ? <p className="mt-5 rounded-xl bg-[#faf9f5] p-3 text-xs text-zinc-500">No company activity has been recorded yet.</p> : <div className="mt-4 max-h-[34rem] overflow-y-auto rounded-xl border border-[#eeeae0]">{events.map((event) => <div key={event.id} className="border-b border-[#eeeae0] p-3 last:border-0"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold text-zinc-900">{event.actor_name ?? 'Company member'} · {event.action.replaceAll('_', ' ')}</p><time className="text-[10px] text-zinc-400">{new Date(event.created_at).toLocaleString()}</time></div><p className="mt-1 text-[11px] text-zinc-500">{event.record_type}{event.record_id ? ` · ${event.record_id}` : ''}</p></div>)}</div>}
  </section>;
}
