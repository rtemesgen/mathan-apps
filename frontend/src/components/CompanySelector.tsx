import { FormEvent, useState } from 'react';
import { ArrowRight, Building2, Check, Plus, ShieldCheck, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type AppId } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useAsyncAction } from '../hooks/useAsyncAction';

const appNames: Record<AppId, string> = { book: 'Cash Book', payroll: 'Payroll', truck: 'Truck Equity' };

export function CompanySelector() {
  const { workspace, workspaces, switchWorkspace, refreshWorkspace, signOut, isGuest, createGuestWorkspace, renameGuestWorkspace, deleteGuestWorkspace } = useAuth();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const { submitting, run } = useAsyncAction();
  const [pendingCompany, setPendingCompany] = useState<typeof workspaces[number] | null>(null);
  const online = useOnlineStatus();
  const scheduled = workspaces.filter((item) => item.role === 'owner' && item.deletionStatus === 'scheduled');
  const owners = workspaces.filter((item) => item.role === 'owner' && item.deletionStatus !== 'scheduled');
  const invited = workspaces.filter((item) => item.role === 'member');

  const selectCompany = (id: string) => {
    if (id === workspace?.id) { navigate('/'); return; }
    const next = workspaces.find((item) => item.id === id);
    if (!next) return;
    setPendingCompany(next);
  };

  const confirmSwitch = () => {
    if (!pendingCompany) return;
    switchWorkspace(pendingCompany.id);
    setPendingCompany(null);
    navigate(pendingCompany.deletionStatus === 'scheduled' ? '/settings?section=company' : '/');
  };

  const createCompany = async (event: FormEvent) => {
    event.preventDefault();
    if (isGuest) { createGuestWorkspace(name); setName(''); setShowCreate(false); return; }
    if (!online) { setError('Connect to the internet to create another company. Your synced companies remain available offline.'); return; }
    const cleaned = name.trim();
    if (cleaned.length < 2) { setError('Enter a company name with at least 2 characters.'); return; }
    setError('');
    await run(async () => {
      const { data: userCheck, error: userError } = await supabase.auth.getUser();
      if (userError || !userCheck.user) { await signOut(); setError('Your sign-in session is no longer valid. Please sign in again.'); return; }
      const { data, error: createError } = await supabase.rpc('create_workspace', { workspace_name: cleaned });
      if (createError) { setError(createError.code === '23503' || createError.message.toLowerCase().includes('created_by_fkey') ? 'Your sign-in session is no longer valid. Please sign in again.' : createError.message); return; }
      const created = data as { id?: string } | null;
      await refreshWorkspace(created?.id);
      navigate('/');
    });
  };

  const renderCompany = (item: typeof workspaces[number]) => <button key={item.id} onClick={() => selectCompany(item.id)} className={`group w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${item.deletionStatus === 'scheduled' ? 'border-red-200 bg-red-50/50' : item.id === workspace?.id ? 'border-zinc-900 ring-2 ring-zinc-900/5' : 'border-[#e6e2d6]'}`}>
    <div className="flex items-start gap-3"><span className="mt-0.5 h-10 w-10 shrink-0 rounded-xl" style={{ backgroundColor: item.accent_color }} /><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate font-serif text-lg font-bold text-zinc-900">{item.name}</span>{item.id === workspace?.id && <Check className="h-4 w-4 shrink-0 text-emerald-700" />}</span>{item.deletionStatus === 'scheduled' ? <span className="mt-1 block text-xs font-bold text-red-700">Scheduled for deletion · restore in Settings</span> : <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider"><span className={item.role === 'owner' ? 'text-emerald-700' : 'text-indigo-700'}>{item.role === 'owner' ? 'Owner' : 'Member'}</span>{(['book', 'payroll', 'truck'] as AppId[]).map((app) => item.appAccess[app].enabled && item.appAccess[app].permission !== 'none' ? <span key={app} className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-600">{appNames[app]} · {item.appAccess[app].permission}</span> : null)}</span>}</span><ArrowRight className="mt-2 h-4 w-4 shrink-0 text-zinc-400 transition group-hover:translate-x-1" /></div>
    {isGuest && <span className="mt-3 flex gap-2 border-t border-zinc-100 pt-3"><span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); const next = window.prompt('Guest company name', item.name); if (next?.trim()) renameGuestWorkspace(item.id, next); }} className="rounded-lg border px-2 py-1 text-[10px] font-bold text-zinc-600">Rename</span><span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); if (window.confirm(`Delete ${item.name} and its local records from this device?`)) void deleteGuestWorkspace(item.id); }} className="rounded-lg border border-red-200 px-2 py-1 text-[10px] font-bold text-red-700">Delete</span></span>}
  </button>;

  return <><main className="mx-auto max-w-4xl px-4 py-7 sm:px-6 sm:py-10"><div className="mb-7 flex items-start justify-between gap-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-emerald-700">Your companies</p><h1 className="mt-1 font-serif text-3xl font-bold">Choose a company</h1><p className="mt-2 text-sm text-zinc-500">Each company has its own apps, records, and permissions.</p></div><Building2 className="h-7 w-7 text-emerald-700" /></div>
    {owners.length > 0 && <section><h2 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-zinc-500"><ShieldCheck className="h-4 w-4 text-emerald-700" /> Companies you own</h2><div className="grid gap-3 sm:grid-cols-2">{owners.map(renderCompany)}</div></section>}
    {scheduled.length > 0 && <section className="mt-7"><h2 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-red-700">Recovery needed</h2><div className="grid gap-3 sm:grid-cols-2">{scheduled.map(renderCompany)}</div></section>}
    {invited.length > 0 && <section className="mt-7"><h2 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-zinc-500">Companies you’re invited to</h2><div className="grid gap-3 sm:grid-cols-2">{invited.map(renderCompany)}</div></section>}
    <section className="mt-7 rounded-2xl border border-dashed border-[#cfcabb] bg-[#faf9f5] p-4"><button disabled={!isGuest && !online} onClick={() => setShowCreate((value) => !value)} className="inline-flex items-center gap-2 text-sm font-bold text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4 text-emerald-700" /> Create another company</button>{!isGuest && !online && <p className="mt-2 text-xs font-semibold text-amber-800">Offline · connect to create a company. You can still open and edit your synced companies.</p>}{isGuest && <p className="mt-2 text-xs font-semibold text-emerald-800">Guest companies and their records stay privately on this device.</p>}{showCreate && (isGuest || online) && <form onSubmit={createCompany} className="mt-4 flex flex-col gap-2 sm:flex-row"><input autoFocus required minLength={2} value={name} onChange={(event) => setName(event.target.value)} placeholder="Company name" className="min-w-0 flex-1 rounded-xl border border-[#e6e2d6] bg-white px-3 py-2 text-sm" /><button disabled={submitting} className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white">{submitting ? 'Creating…' : 'Create company'}</button></form>}{error && <p className="mt-2 text-xs font-semibold text-red-700">{error}</p>}</section>
  </main>{pendingCompany && <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/35 p-4 backdrop-blur-sm" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="switch-company-title" className="w-full max-w-sm rounded-3xl border border-[#e6e2d6] bg-[#f6f5ef] p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="h-10 w-10 rounded-xl" style={{ backgroundColor: pendingCompany.accent_color }} /><div><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-700">Change company</p><h2 id="switch-company-title" className="mt-1 font-serif text-xl font-bold text-zinc-900">{pendingCompany.name}</h2></div></div><button aria-label="Close confirmation" onClick={() => setPendingCompany(null)} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white"><X className="h-4 w-4" /></button></div><p className="mt-5 text-sm leading-6 text-zinc-600">Your current company view will close and the selected company’s apps and permissions will load.</p><div className="mt-5 flex gap-2"><button onClick={() => setPendingCompany(null)} className="flex-1 rounded-xl border border-[#d8d3c5] bg-white px-3 py-2.5 text-xs font-bold text-zinc-700 hover:bg-[#faf9f5]">Stay here</button><button onClick={confirmSwitch} className="flex-1 rounded-xl bg-zinc-900 px-3 py-2.5 text-xs font-bold text-white hover:bg-zinc-800">Switch company</button></div></section></div>}</>;
}
