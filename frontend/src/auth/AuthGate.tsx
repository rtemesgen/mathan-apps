import { FormEvent, useEffect, useState } from 'react';
import { Building2, Eye, EyeOff, LoaderCircle, PhoneCall } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { standaloneMode, useAuth, type AppId } from './AuthProvider';
import { supabase } from '../lib/supabase';
import { isValidPhone, normalizePhone, PHONE_COUNTRIES } from './phone';
import { AppCard } from '../components/AppCard';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { exportGuestWorkspace, guestWorkspaceHasData, markGuestWorkspaceImported, readGuestWorkspaceCache, type GuestWorkspace, type GuestWorkspaceExport } from './guestWorkspaces';
import { prefetchWorkspaceData } from '../lib/offlinePrefetch';

function Panel({ children }: { children: React.ReactNode }) { return <main className="erp-app flex min-h-[calc(100vh-61px)] items-center justify-center p-4"><AppCard className="w-full max-w-md p-6 shadow-xl">{children}</AppCard></main>; }

const SUPPORT_NUMBER = '256741321674';
const SUPPORT_MESSAGE = encodeURIComponent('Hello Mathan ERP customer service, I cannot sign in to my account. Please help me.');

function WhatsAppIcon() {
  return <svg aria-hidden="true" viewBox="0 0 32 32" className="h-6 w-6 fill-current"><path d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3Zm0 23.7c-2.1 0-4.1-.6-5.8-1.7l-.4-.2-3.9 1 1-3.8-.3-.4A10.7 10.7 0 1 1 16 26.7Zm5.9-8c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.7.1-1.9-.9-3.2-1.7-4.5-3.9-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.6-.5-.9-.5h-.7c-.3 0-.7.1-1 .5-.3.3-1.3 1.3-1.3 3.2s1.4 3.7 1.6 4c.2.3 2.7 4.2 6.7 5.7 2.5 1.1 3.5 1.2 4.7 1 .8-.1 1.9-.8 2.1-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4Z" /></svg>;
}

function LoginFailure({ message }: { message: string }) {
  return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-900"><p className="text-xs font-bold">Sign-in failed</p><p className="mt-1 text-xs leading-5">{message}</p><p className="mt-2 text-[11px] leading-5 text-red-800">If your account was blocked, suspended, or scheduled for deletion, sign-in is unavailable. Please contact customer service for help.</p><a aria-label="Contact customer service on WhatsApp" href={`https://wa.me/${SUPPORT_NUMBER}?text=${SUPPORT_MESSAGE}`} target="_blank" rel="noreferrer" className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-3 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-[#20bd5a]"><WhatsAppIcon /> Contact customer service on WhatsApp</a><p className="mt-1 text-center text-[10px] text-red-700">+256 741 321 674</p></div>;
}

function readableError(message: string) {
  const value = message.toLowerCase();
  if (value.includes('permission denied') || value.includes('row-level security')) return 'Your account cannot access company data yet. The workspace permissions need to be checked by an administrator.';
  if (value.includes('network') || value.includes('fetch')) return 'Cannot reach Supabase. Check that the local backend is running and try again.';
  if (value.includes('invalid login credentials')) return 'The email or password is incorrect.';
  if (value.includes('banned') || value.includes('blocked') || value.includes('suspended') || value.includes('deleted')) return 'This account is currently unavailable because it may be blocked, suspended, or scheduled for deletion.';
  if (value.includes('email not confirmed')) return 'Please confirm your email before signing in.';
  if (value.includes('rate limit')) return 'Too many attempts. Please wait a moment and try again.';
  return message || 'Something unexpected happened. Please try again.';
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'reset'>('sign-in');
  const [email, setEmail] = useState(import.meta.env.VITE_DEMO_EMAIL ?? ''); const [password, setPassword] = useState(import.meta.env.VITE_DEMO_PASSWORD ?? ''); const [phone, setPhone] = useState(''); const [countryCode, setCountryCode] = useState('+256'); const [showPassword, setShowPassword] = useState(false); const [error, setError] = useState(''); const [loginFailed, setLoginFailed] = useState(false); const [busy, setBusy] = useState(false);
  const [phoneStatus, setPhoneStatus] = useState<'checking' | 'required' | 'complete'>('checking');
  useEffect(() => {
    let cancelled = false;
    if (!auth.user || standaloneMode || auth.isGuest) { setPhoneStatus('complete'); return () => { cancelled = true; }; }
    setPhoneStatus('checking');
    void supabase.from('workspace_profiles').select('phone').eq('user_id', auth.user.id).maybeSingle().then(({ data }) => {
      if (cancelled) return;
      const phoneValue = data?.phone ?? (auth.user?.user_metadata?.phone as string | undefined) ?? '';
      setPhoneStatus(isValidPhone(phoneValue) ? 'complete' : 'required');
    });
    return () => { cancelled = true; };
  }, [auth.user?.id, auth.isGuest]);
  if (standaloneMode || auth.isGuest) return <>{children}</>;
  if (!auth.configured) return <Panel><Building2 className="h-8 w-8 text-emerald-700" /><h1 className="mt-4 font-serif text-2xl font-bold">Connect Supabase</h1><p className="mt-2 text-sm text-zinc-500">Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env, then restart the web app.</p><button onClick={auth.continueAsGuest} className="mt-6 w-full rounded-xl border border-zinc-300 p-3 text-sm font-bold text-zinc-800">Continue as guest</button><p className="mt-2 text-center text-[11px] text-zinc-400">Guest data stays on this device.</p></Panel>;
  if (auth.loading) return <Panel><LoaderCircle className="mx-auto h-6 w-6 animate-spin text-emerald-700" /></Panel>;
  if (auth.passwordRecovery) return <PasswordRecovery />;
  if (!auth.user) {
    const clearFailure = () => {
      setError('');
      setLoginFailed(false);
      auth.clearLoginError();
    };
    const submit = async (event: FormEvent) => {
      event.preventDefault();
      clearFailure();
      setBusy(true);
      try {
        const normalizedPhone = mode === 'sign-up' ? normalizePhone(phone, countryCode) : '';
        if (mode === 'sign-up' && !isValidPhone(normalizedPhone)) {
          setError('Enter a valid phone number with the selected country code.');
          return;
        }
        const response = mode === 'sign-in'
          ? await supabase.auth.signInWithPassword({ email, password })
          : mode === 'sign-up'
            ? await supabase.auth.signUp({ email, password, options: { data: { phone: normalizedPhone } } })
            : await supabase.auth.resetPasswordForEmail(email, { redirectTo: Capacitor.isNativePlatform() ? 'com.mathan.erp://auth/reset-password' : `${window.location.origin}/auth/reset-password` });
        if (response.error) {
          setError(readableError(response.error.message));
          setLoginFailed(mode === 'sign-in');
        } else if (mode !== 'sign-in') {
          setError(mode === 'reset' ? 'Password reset email sent. Open the link to choose a new password.' : 'Account created. Check your email to confirm it.');
        }
      } catch {
        setError('Cannot reach Supabase. Check your connection and try again.');
        setLoginFailed(mode === 'sign-in');
      } finally {
        setBusy(false);
      }
    };
    const googleSignIn = async () => {
      clearFailure();
      setBusy(true);
      try {
        const native = Capacitor.isNativePlatform();
        const redirectTo = native ? 'com.mathan.erp://auth/callback' : `${window.location.origin}/auth/callback`;
        const { data, error: oauthError } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: native, queryParams: { prompt: 'select_account' } } });
        if (oauthError) {
          setError(readableError(oauthError.message));
          setLoginFailed(true);
        } else if (native && data.url) await Browser.open({ url: data.url });
      } catch {
        setError('Google sign-in could not be started. Check your connection and Supabase Google provider settings.');
        setLoginFailed(true);
      } finally {
        setBusy(false);
      }
    };
    const displayedError = error || auth.loginError || '';
    const showSupport = Boolean(displayedError) && (loginFailed || Boolean(auth.loginError));
    const changeMode = (nextMode: 'sign-in' | 'sign-up' | 'reset') => { clearFailure(); setMode(nextMode); };
    return <Panel><Building2 className="h-8 w-8 text-emerald-700" /><h1 className="mt-4 font-serif text-2xl font-bold">Mathan ERP</h1><p className="mt-1 text-sm text-zinc-500">Sign in to your company workspace.</p><button type="button" onClick={() => void googleSignIn()} disabled={busy} className="mt-6 w-full rounded-xl border border-zinc-300 p-3 text-sm font-bold text-zinc-800 disabled:opacity-60">{busy ? 'Please wait…' : 'Continue with Google'}</button><div className="my-4 flex items-center gap-3 text-[11px] text-zinc-400"><span className="h-px flex-1 bg-zinc-200" />or use email<span className="h-px flex-1 bg-zinc-200" /></div><form onSubmit={submit} className="space-y-3"><input required type="email" value={email} onChange={e => { setEmail(e.target.value); clearFailure(); }} placeholder="Email address" className="w-full rounded-xl border p-3 text-sm" />{mode === 'sign-up' && <div><label className="mb-1 block text-xs font-bold text-zinc-600">Phone number</label><div className="grid grid-cols-[145px_1fr] gap-2"><select required value={countryCode} onChange={e => setCountryCode(e.target.value)} className="rounded-xl border p-3 text-sm">{PHONE_COUNTRIES.map(country => <option key={country.code} value={country.code}>{country.name} ({country.code})</option>)}</select><input required type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="741 321 674" className="min-w-0 rounded-xl border p-3 text-sm" /></div><p className="mt-1 text-[10px] text-zinc-500">Example: 0741321674 becomes {countryCode}741321674.</p></div>}<div className="relative"><input required={mode !== 'reset'} type={showPassword ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); clearFailure(); }} placeholder="Password" className="w-full rounded-xl border p-3 pr-11 text-sm" /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-zinc-500 hover:text-zinc-900">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>{displayedError && (showSupport ? <LoginFailure message={readableError(displayedError)} /> : <p role="status" className="text-xs text-red-700">{displayedError}</p>)}<button disabled={busy} className="w-full rounded-xl bg-zinc-900 p-3 text-sm font-bold text-white">{busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Send reset email'}</button></form><div className="mt-4 flex justify-between text-xs font-semibold text-emerald-800"><button onClick={() => changeMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>{mode === 'sign-in' ? 'Create account' : 'Sign in'}</button><button onClick={() => changeMode('reset')}>Reset password</button></div><button onClick={auth.continueAsGuest} className="mt-5 w-full rounded-xl border border-zinc-300 p-3 text-sm font-bold text-zinc-800">Continue as guest</button><p className="mt-2 text-center text-[11px] text-zinc-400">Guest data stays on this device.</p></Panel>;
  }
  if (phoneStatus === 'checking') return <Panel><LoaderCircle className="mx-auto h-6 w-6 animate-spin text-emerald-700" /><p className="mt-3 text-center text-sm text-zinc-500">Checking your profile…</p></Panel>;
  if (phoneStatus === 'required') return <PhoneRequiredPage onSaved={() => setPhoneStatus('complete')} />;
  if (window.location.pathname.startsWith('/invite/') && auth.user) return <>{children}</>;
  if (window.location.pathname.startsWith('/admin')) {
    if (auth.adminLoading) return <Panel><LoaderCircle className="mx-auto h-6 w-6 animate-spin text-emerald-700" /><p className="mt-3 text-center text-sm text-zinc-500">Checking administrator access…</p></Panel>;
    if (auth.isSystemAdmin) return <>{children}</>;
  }
  if (window.location.pathname === '/' && auth.isSystemAdmin) return <>{children}</>;
  if (auth.workspaceLoading && !auth.workspace) return <Panel><LoaderCircle className="mx-auto h-6 w-6 animate-spin text-emerald-700" /><p className="mt-3 text-center text-sm text-zinc-500">Loading your workspace…</p></Panel>;
  if (!auth.workspace) return <WorkspaceSetup />;
  return <GuestImportGate>{children}</GuestImportGate>;
}

function PhoneRequiredPage({ onSaved }: { onSaved: () => void }) {
  const auth = useAuth();
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+256');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizePhone(phone, countryCode);
    if (!isValidPhone(normalized)) { setError('Enter a valid phone number with the selected country code.'); return; }
    if (!auth.user) return;
    setBusy(true); setError('');
    const [{ error: profileError }, { error: authError }] = await Promise.all([
      supabase.from('workspace_profiles').upsert({ user_id: auth.user.id, phone: normalized }),
      supabase.auth.updateUser({ data: { phone: normalized } }),
    ]);
    setBusy(false);
    if (profileError || authError) { setError(profileError?.message ?? authError?.message ?? 'Could not save your phone number.'); return; }
    onSaved();
  };
  return <Panel><PhoneCall className="h-8 w-8 text-emerald-700" /><h1 className="mt-4 font-serif text-2xl font-bold">Add your phone number</h1><p className="mt-2 text-sm leading-6 text-zinc-500">A valid phone number is required so companies can invite you quickly using their contact list. It is stored securely with your account.</p><form onSubmit={save} className="mt-6 space-y-3"><label className="block text-xs font-bold text-zinc-600">Phone number</label><div className="grid min-w-0 grid-cols-[minmax(120px,145px)_minmax(0,1fr)] gap-2"><select required value={countryCode} onChange={(event) => setCountryCode(event.target.value)} className="min-w-0 rounded-xl border p-3 text-sm">{PHONE_COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.name} ({country.code})</option>)}</select><input required autoFocus inputMode="tel" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="741 321 674" className="min-w-0 rounded-xl border p-3 text-sm" /></div><p className="text-[10px] text-zinc-500">Example: 0741321674 becomes {countryCode}741321674.</p>{error && <p role="alert" className="text-xs text-red-700">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-zinc-900 p-3 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save phone number'}</button></form><button type="button" onClick={() => void auth.signOut()} className="mt-3 w-full rounded-xl border border-zinc-300 p-3 text-sm font-bold text-zinc-700">Sign out</button></Panel>;
}

function PasswordRecovery() {
  const auth = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) { setMessage('Use at least 8 characters.'); return; }
    if (password !== confirm) { setMessage('The passwords do not match.'); return; }
    setBusy(true); setMessage('');
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setMessage(readableError(error.message)); return; }
    auth.finishPasswordRecovery();
    setMessage('Password updated. You are signed in.');
  };
  return <Panel><Building2 className="h-8 w-8 text-emerald-700" /><h1 className="mt-4 font-serif text-2xl font-bold">Choose a new password</h1><p className="mt-2 text-sm text-zinc-500">Set a new password for your Mathan ERP account.</p><form onSubmit={submit} className="mt-6 space-y-3"><input required minLength={8} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="New password" className="w-full rounded-xl border p-3 text-sm" /><input required minLength={8} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Confirm new password" className="w-full rounded-xl border p-3 text-sm" />{message && <p className="text-xs text-zinc-600">{message}</p>}<button disabled={busy} className="w-full rounded-xl bg-zinc-900 p-3 text-sm font-bold text-white">{busy ? 'Saving…' : 'Save new password'}</button></form></Panel>;
}

function WorkspaceSetup() { const auth = useAuth(); const online = useOnlineStatus(); const [name, setName] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const create = async (event: FormEvent) => { event.preventDefault(); if (!online) { setError('Connect to the internet once to download your companies for offline use.'); return; } const cleanedName = name.trim(); if (cleanedName.length < 2) { setError('Enter a company name with at least 2 characters.'); return; } setBusy(true); setError(''); try { const { data: userCheck, error: userError } = await supabase.auth.getUser(); if (userError || !userCheck.user) { await auth.signOut(); setError('Your sign-in session is no longer valid. Please sign in again.'); return; } const { error: rpcError } = await supabase.rpc('create_workspace', { workspace_name: cleanedName }); if (rpcError) { if (rpcError.code === '23503' || rpcError.message.toLowerCase().includes('created_by_fkey')) { await auth.signOut(); setError('Your sign-in session is no longer valid. Please sign in again.'); } else setError(readableError(rpcError.message)); return; } const workspace = await auth.refreshWorkspace(); if (!workspace) setError(auth.workspaceError ? readableError(auth.workspaceError) : 'Your workspace was created, but it could not be loaded. Use Retry to continue.'); } catch { setError('Cannot create a workspace because the local backend is unavailable. Start Supabase and try again.'); } finally { setBusy(false); } }; if (!online) return <Panel><Building2 className="h-8 w-8 text-amber-700" /><h1 className="mt-4 font-serif text-2xl font-bold">Connect once to use companies offline</h1><p className="mt-2 text-sm leading-6 text-zinc-500">This device has not downloaded any companies for your account yet. Connect to the internet, then Mathan ERP will save all companies and app records for offline access.</p><button type="button" onClick={() => void auth.refreshWorkspace()} className="mt-6 w-full rounded-xl bg-zinc-900 p-3 text-sm font-bold text-white">Try again</button></Panel>; return <Panel><h1 className="font-serif text-2xl font-bold">Create your workspace</h1><p className="mt-2 text-sm text-zinc-500">Your Cash Book, Payroll, and Truck Equity records stay private to this company.</p>{auth.workspaceError && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">We could not load your existing workspace: {readableError(auth.workspaceError)} <button type="button" onClick={() => void auth.refreshWorkspace()} className="ml-1 font-bold underline">Retry</button></div>}<form onSubmit={create} className="mt-6 space-y-3"><input required minLength={2} value={name} onChange={e => { setName(e.target.value); setError(''); }} placeholder="Company name" className="w-full rounded-xl border p-3 text-sm" />{error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-zinc-900 p-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{busy ? 'Creating workspace…' : 'Create workspace'}</button></form></Panel>; }

type PendingGuestImport = { workspace: GuestWorkspace; payload: GuestWorkspaceExport };

export function GuestImportGate({ children, settingsMode = false }: { children: React.ReactNode; settingsMode?: boolean }) {
  const auth = useAuth();
  const [pending, setPending] = useState<PendingGuestImport[] | null>(null);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [deferred, setDeferred] = useState(() => !settingsMode && sessionStorage.getItem('mathan_guest_import_deferred') === 'true');
  const eligible = auth.workspaces.filter((item) => item.deletionStatus !== 'scheduled' && (['book', 'payroll', 'truck'] as AppId[]).every((app) => item.appAccess[app].enabled && item.appAccess[app].permission === 'edit'));
  const load = async () => {
    const items: PendingGuestImport[] = [];
    for (const workspace of readGuestWorkspaceCache().memberships) {
      if (!await guestWorkspaceHasData(workspace)) continue;
      const payload = await exportGuestWorkspace(workspace);
      if (workspace.importedFingerprint !== payload.fingerprint) items.push({ workspace, payload });
    }
    setPending(items);
    setTargets((current) => Object.fromEntries(items.map((item) => [item.workspace.id, current[item.workspace.id] ?? eligible[0]?.id ?? ''])));
  };
  useEffect(() => { void load(); }, [auth.user?.id, auth.workspaces.length]);
  const importOne = async (item: PendingGuestImport) => {
    const target = targets[item.workspace.id];
    if (!target || !auth.user || !navigator.onLine) { setMessage(!navigator.onLine ? 'Connect to the internet to import guest data.' : 'Choose an eligible destination company.'); return; }
    setBusy(item.workspace.id); setMessage('');
    const { data, error } = await supabase.rpc('import_guest_workspace', { target_workspace: target, target_import_id: item.payload.importId, target_payload: item.payload });
    if (error) setMessage(error.message);
    else {
      const result = data as { imported?: number; skipped?: number; remapped?: number } | null;
      markGuestWorkspaceImported(item.workspace.id, item.payload.fingerprint, item.payload.importId);
      await prefetchWorkspaceData(target, auth.user.id);
      await auth.refreshWorkspace(target);
      setMessage(`Imported ${result?.imported ?? 0} records, skipped ${result?.skipped ?? 0} duplicates, and remapped ${result?.remapped ?? 0} conflicts.`);
      await load();
    }
    setBusy('');
  };
  if (pending === null) return settingsMode ? null : <>{children}</>;
  if (pending.length === 0 && message) return <Panel><h1 className="font-serif text-2xl font-bold">Guest import complete</h1><p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">{message}</p><button onClick={() => setMessage('')} className="mt-4 w-full rounded-xl bg-zinc-900 px-3 py-3 text-sm font-bold text-white">Continue to company</button></Panel>;
  if (pending.length === 0 || deferred) return <>{children}</>;
  const panel = <Panel><h1 className="font-serif text-2xl font-bold">Sync guest companies</h1><p className="mt-2 text-sm leading-6 text-zinc-500">Choose where each local guest company should be merged. Existing cloud records will be preserved.</p>{eligible.length === 0 ? <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">No active company currently gives you edit access to Cash Book, Payroll, and Truck Equity. Create a company or ask its owner for full edit access, then retry.</div> : <div className="mt-5 space-y-3">{pending.map((item) => <div key={item.workspace.id} className="rounded-xl border p-3"><p className="text-sm font-bold">{item.workspace.name}</p><select aria-label={`Destination for ${item.workspace.name}`} value={targets[item.workspace.id] ?? ''} onChange={(event) => setTargets((current) => ({ ...current, [item.workspace.id]: event.target.value }))} className="mt-2 w-full rounded-xl border p-2.5 text-xs">{eligible.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select><button disabled={busy !== ''} onClick={() => void importOne(item)} className="mt-2 w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy === item.workspace.id ? 'Importing and verifying…' : 'Import guest company'}</button></div>)}</div>}{message && <p role="status" className="mt-3 rounded-xl bg-zinc-100 p-3 text-xs font-semibold">{message}</p>}{!settingsMode && <button onClick={() => { sessionStorage.setItem('mathan_guest_import_deferred', 'true'); setDeferred(true); }} className="mt-4 w-full rounded-xl border px-3 py-2.5 text-xs font-bold text-zinc-600">Import later from Settings</button>}</Panel>;
  return settingsMode ? <>{panel}</> : panel;
}
