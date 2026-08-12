import { Building2, Check, Mail, UserMinus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { DeleteConfirmModal } from './DeleteConfirmModal';

type Invitation = { invitation_id: string; workspace_id: string; workspace_name: string; invited_by_name: string; book_permission: string; payroll_permission: string; expires_at: string };

function AccessText({ invitation }: { invitation: Invitation }) {
  const access = [invitation.book_permission !== 'none' ? 'Cash Book' : '', invitation.payroll_permission !== 'none' ? 'Payroll' : ''].filter(Boolean).join(' and ');
  return <span>{access || 'No app access selected'}</span>;
}

export function WorkspaceInvitations({ compact = false }: { compact?: boolean }) {
  const { user, refreshWorkspace } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    if (!user) return;
    const { data, error: loadError } = await supabase.rpc('list_my_workspace_invitations');
    if (!loadError) setInvitations((data as Invitation[] | null) ?? []);
  };
  useEffect(() => { void load(); }, [user]);

  const respond = async (invitation: Invitation, accept: boolean) => {
    setBusy(invitation.invitation_id); setError('');
    const { error: responseError } = await supabase.rpc('respond_to_workspace_invitation', { target_invitation: invitation.invitation_id, accept_invitation: accept });
    if (responseError) setError(responseError.message);
    else { setInvitations((current) => current.filter((item) => item.invitation_id !== invitation.invitation_id)); if (accept) await refreshWorkspace(invitation.workspace_id); }
    setBusy(null);
  };

  if (!invitations.length) return null;
  return <section className={`rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm ${compact ? 'p-3' : 'p-5'}`}>
    <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white"><Mail className="h-4 w-4" /></span><div className="min-w-0"><h2 className={`${compact ? 'text-sm' : 'font-serif text-xl'} font-bold text-emerald-950`}>Company invitation{invitations.length > 1 ? 's' : ''}</h2><p className="mt-1 text-xs leading-5 text-emerald-800">Someone invited you to join their company.</p></div></div>
    {error && <p className="mt-3 rounded-lg bg-red-100 p-2 text-xs text-red-800">{error}</p>}
    <div className="mt-3 space-y-2">{invitations.map((invitation) => <div key={invitation.invitation_id} className="rounded-xl border border-emerald-200 bg-white p-3"><div className="flex items-start gap-2"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-zinc-900">{invitation.workspace_name}</p><p className="text-[11px] text-zinc-500">Invited by {invitation.invited_by_name} · <AccessText invitation={invitation} /></p></div></div><div className="mt-3 flex gap-2"><button type="button" disabled={!!busy} onClick={() => void respond(invitation, true)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Check className="h-3.5 w-3.5" /> {busy === invitation.invitation_id ? 'Saving…' : 'Accept'}</button><button type="button" disabled={!!busy} onClick={() => void respond(invitation, false)} className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-bold text-zinc-700 disabled:opacity-50"><X className="h-3.5 w-3.5" /> Reject</button></div></div>)}</div>
  </section>;
}

export function MyCompanyMemberships() {
  const { workspaces, user, refreshWorkspace } = useAuth();
  const [leaving, setLeaving] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState('');
  const memberships = workspaces.filter((item) => item.role === 'member');
  if (!user || !memberships.length) return null;
  const leave = async () => {
    if (!leaving) return;
    const { error: leaveError } = await supabase.rpc('leave_workspace', { target_workspace: leaving.id });
    if (leaveError) setError(leaveError.message); else { setLeaving(null); await refreshWorkspace(); }
  };
  return <section className="rounded-2xl border border-[#e6e2d6] bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><UserMinus className="mt-1 h-5 w-5 text-zinc-500" /><div><h2 className="font-serif text-xl font-bold">Your company access</h2><p className="mt-1 text-xs text-zinc-500">Leave a company when you no longer want access.</p></div></div>{error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}<div className="mt-4 space-y-2">{memberships.map((company) => <div key={company.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#faf9f5] p-3"><span className="flex min-w-0 items-center gap-2 text-sm font-bold"><Building2 className="h-4 w-4 shrink-0 text-emerald-700" /><span className="truncate">{company.name}</span></span><button type="button" onClick={() => setLeaving({ id: company.id, name: company.name })} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50">Leave</button></div>)}</div><DeleteConfirmModal isOpen={!!leaving} title="Leave company?" message={leaving ? <>Are you sure you want to remove yourself from <strong className="text-[#121212]">{leaving.name}</strong>?</> : ''} onClose={() => setLeaving(null)} onConfirm={() => void leave()} confirmLabel="Leave" /></section>;
}
