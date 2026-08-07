import { FormEvent, useState } from 'react';
import { Building2, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { standaloneMode, useAuth } from './AuthProvider';
import { supabase } from '../lib/supabase';
import { writeOffline } from '../lib/localStore';

function Panel({ children }: { children: React.ReactNode }) { return <main className="flex min-h-[calc(100vh-61px)] items-center justify-center p-4"><section className="w-full max-w-md rounded-3xl border border-[#e6e2d6] bg-white p-6 shadow-xl">{children}</section></main>; }

function readableError(message: string) {
  const value = message.toLowerCase();
  if (value.includes('permission denied') || value.includes('row-level security')) return 'Your account cannot access company data yet. The workspace permissions need to be checked by an administrator.';
  if (value.includes('network') || value.includes('fetch')) return 'Cannot reach Supabase. Check that the local backend is running and try again.';
  if (value.includes('invalid login credentials')) return 'The email or password is incorrect.';
  if (value.includes('email not confirmed')) return 'Please confirm your email before signing in.';
  if (value.includes('rate limit')) return 'Too many attempts. Please wait a moment and try again.';
  return message || 'Something unexpected happened. Please try again.';
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'reset'>('sign-in');
  const [email, setEmail] = useState(import.meta.env.VITE_DEMO_EMAIL ?? ''); const [password, setPassword] = useState(import.meta.env.VITE_DEMO_PASSWORD ?? ''); const [showPassword, setShowPassword] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  if (standaloneMode) return <>{children}</>;
  if (!auth.configured) return <Panel><Building2 className="h-8 w-8 text-emerald-700" /><h1 className="mt-4 font-serif text-2xl font-bold">Connect Supabase</h1><p className="mt-2 text-sm text-zinc-500">Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env, then restart the web app.</p></Panel>;
  if (auth.loading) return <Panel><LoaderCircle className="mx-auto h-6 w-6 animate-spin text-emerald-700" /></Panel>;
  if (!auth.user) {
    const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { const response = mode === 'sign-in' ? await supabase.auth.signInWithPassword({ email, password }) : mode === 'sign-up' ? await supabase.auth.signUp({ email, password }) : await supabase.auth.resetPasswordForEmail(email); if (response.error) setError(readableError(response.error.message)); else if (mode !== 'sign-in') setError(mode === 'reset' ? 'Password reset email sent. Check the local Mailpit inbox if you are testing locally.' : 'Account created. Check your email or local Mailpit inbox to confirm it.'); } catch { setError('Cannot reach Supabase. Check your connection and try again.'); } finally { setBusy(false); } };
    return <Panel><Building2 className="h-8 w-8 text-emerald-700" /><h1 className="mt-4 font-serif text-2xl font-bold">Mathan ERP</h1><p className="mt-1 text-sm text-zinc-500">Sign in to your company workspace.</p><form onSubmit={submit} className="mt-6 space-y-3"><input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" className="w-full rounded-xl border p-3 text-sm" /><div className="relative"><input required={mode !== 'reset'} type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full rounded-xl border p-3 pr-11 text-sm" /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-zinc-500 hover:text-zinc-900">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>{error && <p className="text-xs text-red-700">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-zinc-900 p-3 text-sm font-bold text-white">{busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Send reset email'}</button></form><div className="mt-4 flex justify-between text-xs font-semibold text-emerald-800"><button onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>{mode === 'sign-in' ? 'Create account' : 'Sign in'}</button><button onClick={() => setMode('reset')}>Reset password</button></div></Panel>;
  }
  if (!auth.workspace) return <WorkspaceSetup />;
  return <LegacyImportGate>{children}</LegacyImportGate>;
}

function WorkspaceSetup() { const auth = useAuth(); const [name, setName] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const create = async (event: FormEvent) => { event.preventDefault(); const cleanedName = name.trim(); if (cleanedName.length < 2) { setError('Enter a company name with at least 2 characters.'); return; } setBusy(true); setError(''); try { const { error: rpcError } = await supabase.rpc('create_workspace', { workspace_name: cleanedName }); if (rpcError) { setError(readableError(rpcError.message)); return; } const workspace = await auth.refreshWorkspace(); if (!workspace) setError(auth.workspaceError ? readableError(auth.workspaceError) : 'Your workspace was created, but it could not be loaded. Use Retry to continue.'); } catch { setError('Cannot create a workspace because the local backend is unavailable. Start Supabase and try again.'); } finally { setBusy(false); } }; return <Panel><h1 className="font-serif text-2xl font-bold">Create your workspace</h1><p className="mt-2 text-sm text-zinc-500">Your Cash Book and Payroll records stay private to this company.</p>{auth.workspaceError && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">We could not load your existing workspace: {readableError(auth.workspaceError)} <button type="button" onClick={() => void auth.refreshWorkspace()} className="ml-1 font-bold underline">Retry</button></div>}<form onSubmit={create} className="mt-6 space-y-3"><input required minLength={2} value={name} onChange={e => { setName(e.target.value); setError(''); }} placeholder="Company name" className="w-full rounded-xl border p-3 text-sm" />{error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-zinc-900 p-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{busy ? 'Creating workspace…' : 'Create workspace'}</button></form></Panel>; }

const LEGACY_RECORDS = [
  { key: 'mathan_erp_book_books_v1', domain: 'cash_book:books', cache: 'books' },
  { key: 'mathan_erp_book_transactions_v1', domain: 'cash_book:transactions', cache: 'transactions' },
  { key: 'mathan_erp_payroll_employees_v1', domain: 'payroll:employees', cache: 'employees' },
  { key: 'mathan_erp_payroll_transactions_v1', domain: 'payroll:transactions', cache: 'transactions' },
  { key: 'mathan_erp_payroll_custom_apps_v1', domain: 'payroll:custom-apps', cache: 'custom-apps' },
] as const;

function LegacyImportGate({ children }: { children: React.ReactNode }) {
  const { workspace } = useAuth();
  const [handled, setHandled] = useState(() => workspace ? localStorage.getItem(`mathan_erp_import_handled_${workspace.id}`) === 'true' : true);
  const records = LEGACY_RECORDS.flatMap((record) => { const raw = localStorage.getItem(record.key); if (!raw) return []; try { return [{ ...record, value: JSON.parse(raw) }]; } catch { return []; } });
  if (!workspace || handled || records.length === 0) return <>{children}</>;
  const finish = () => { localStorage.setItem(`mathan_erp_import_handled_${workspace.id}`, 'true'); setHandled(true); };
  const importRecords = async () => {
    for (const record of records) {
      await supabase.from('app_state_snapshots').upsert({ workspace_id: workspace.id, domain: record.domain, payload: record.value });
      await writeOffline(`${workspace.id}:${record.cache}`, record.value);
    }
    finish();
  };
  return <Panel><h1 className="font-serif text-2xl font-bold">Import existing records?</h1><p className="mt-2 text-sm leading-6 text-zinc-500">We found {records.length} saved Cash Book or Payroll data set{records.length === 1 ? '' : 's'} in this browser. Import them into <strong>{workspace.name}</strong> so they are available on web and mobile.</p><div className="mt-6 flex gap-2"><button onClick={() => void importRecords()} className="flex-1 rounded-xl bg-zinc-900 px-3 py-3 text-sm font-bold text-white">Import records</button><button onClick={finish} className="rounded-xl border border-zinc-300 px-3 py-3 text-sm font-bold text-zinc-600">Start fresh</button></div></Panel>;
}
