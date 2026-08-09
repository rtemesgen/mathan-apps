import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Mail, ShieldCheck, UserMinus, UserPlus, X } from 'lucide-react';
import { useAuth, type AppId, type AppPermission } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';

type Member = { user_id: string; email: string; role: 'owner' | 'member'; display_name: string; book_permission: AppPermission; payroll_permission: AppPermission };
type Invitation = { id: string; email: string; status: string; expires_at: string; book_permission: AppPermission; payroll_permission: AppPermission; created_at: string };

const appNames: Record<AppId, string> = { book: 'Cash Book', payroll: 'Payroll' };

function PermissionSelect({ value, onChange }: { value: AppPermission; onChange: (value: AppPermission) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value as AppPermission)} className="rounded-lg border border-[#e6e2d6] bg-white px-2 py-1.5 text-xs font-semibold text-zinc-700">
    <option value="none">No access</option><option value="view">View</option><option value="edit">Edit</option>
  </select>;
}

export function SettingsPage() {
  const { workspace, user, isOwner, appAccess, refreshWorkspace, refreshAccess } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [companyName, setCompanyName] = useState(workspace?.name ?? '');
  const [accentColor, setAccentColor] = useState(workspace?.accent_color ?? '#54623E');
  const [displayName, setDisplayName] = useState((user?.user_metadata?.name as string | undefined) ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePermissions, setInvitePermissions] = useState<Record<AppId, AppPermission>>({ book: 'none', payroll: 'none' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState('');

  const loadOwnerData = async () => {
    if (!workspace || !isOwner) return;
    const [{ data: memberRows }, { data: invitationRows }] = await Promise.all([
      supabase.rpc('list_workspace_members', { target_workspace: workspace.id }),
      supabase.from('workspace_invitations').select('id,email,status,expires_at,book_permission,payroll_permission,created_at').eq('workspace_id', workspace.id).order('created_at', { ascending: false }),
    ]);
    setMembers((memberRows as Member[] | null) ?? []);
    setInvitations((invitationRows as Invitation[] | null) ?? []);
  };

  useEffect(() => { setCompanyName(workspace?.name ?? ''); setAccentColor(workspace?.accent_color ?? '#54623E'); void loadOwnerData(); }, [workspace?.id, isOwner]);

  const saveCompany = async (event: FormEvent) => {
    event.preventDefault();
    if (!workspace || companyName.trim().length < 2) return;
    setBusy(true); setError(''); setNotice('');
    const { error: saveError } = await supabase.from('workspaces').update({ name: companyName.trim(), accent_color: accentColor }).eq('id', workspace.id);
    if (saveError) setError(saveError.message); else { await refreshWorkspace(); setNotice('Company name saved.'); }
    setBusy(false);
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setBusy(true); setError(''); setNotice('');
    const [{ error: profileError }, { error: authError }] = await Promise.all([
      supabase.from('workspace_profiles').upsert({ user_id: user.id, display_name: displayName.trim() }),
      supabase.auth.updateUser({ data: { name: displayName.trim() }, ...(email.trim() !== user.email ? { email: email.trim() } : {}) }),
    ]);
    if (profileError || authError) setError(profileError?.message ?? authError?.message ?? 'Could not save profile.'); else setNotice(email.trim() !== user.email ? 'Profile saved. Check your new email for confirmation.' : 'Profile saved.');
    setBusy(false);
  };

  const updatePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) { setError('Use at least 8 characters for your password.'); return; }
    setBusy(true); setError(''); setNotice('');
    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) setError(passwordError.message); else { setPassword(''); setNotice('Password updated.'); }
    setBusy(false);
  };

  const createInvite = async (event: FormEvent) => {
    event.preventDefault();
    if (!workspace || !inviteEmail.trim()) return;
    const invitedAddress = inviteEmail.trim();
    setBusy(true); setError(''); setNotice(''); setInviteLink('');
    const { data, error: inviteError } = await supabase.rpc('create_workspace_invitation', { target_workspace: workspace.id, target_email: inviteEmail.trim(), target_book_permission: invitePermissions.book, target_payroll_permission: invitePermissions.payroll, expires_in_days: 7 });
    if (inviteError) setError(inviteError.message);
    else {
      const row = (data as Array<{ invite_token: string }> | null)?.[0];
      const link = row ? `${window.location.origin}/invite/${row.invite_token}` : '';
      setInviteLink(link); setInviteEmail('');
      const { error: emailError } = await supabase.auth.signInWithOtp({ email: invitedAddress, options: { emailRedirectTo: link, shouldCreateUser: true } });
      setNotice(emailError ? 'Invitation created. Copy the secure link to send it.' : 'Invitation email sent. You can also copy the secure link.'); await loadOwnerData();
    }
    setBusy(false);
  };

  const updateMemberPermission = async (member: Member, app: AppId, permission: AppPermission) => {
    if (!workspace) return;
    const { error: updateError } = await supabase.from('workspace_member_app_permissions').upsert({ workspace_id: workspace.id, user_id: member.user_id, app_id: app, permission });
    if (updateError) setError(updateError.message); else setMembers((current) => current.map((item) => item.user_id === member.user_id ? { ...item, [`${app}_permission`]: permission } : item));
  };

  const toggleApp = async (app: AppId) => {
    if (!workspace) return;
    const { error: updateError } = await supabase.from('workspace_apps').upsert({ workspace_id: workspace.id, app_id: app, enabled: !appAccess[app].enabled });
    if (updateError) setError(updateError.message); else { await refreshAccess(); setNotice(`${appNames[app]} ${appAccess[app].enabled ? 'disabled' : 'enabled'}.`); }
  };

  const revokeInvite = async (id: string) => {
    const { error: revokeError } = await supabase.rpc('revoke_workspace_invitation', { target_invitation: id });
    if (revokeError) setError(revokeError.message); else await loadOwnerData();
  };

  const removeMember = async (id: string) => {
    if (!workspace || !window.confirm('Remove this person from the company?')) return;
    const { error: removeError } = await supabase.rpc('remove_workspace_member', { target_workspace: workspace.id, target_user: id });
    if (removeError) setError(removeError.message); else await loadOwnerData();
  };

  const copyLink = async () => { if (inviteLink) { await navigator.clipboard.writeText(inviteLink); setNotice('Invite link copied.'); } };
  const pendingInvitations = useMemo(() => invitations.filter((invitation) => invitation.status === 'pending'), [invitations]);

  return <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
    <div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-emerald-700">Workspace settings</p><h1 className="mt-1 font-serif text-3xl font-bold text-zinc-900">Company settings</h1><p className="mt-1 text-sm text-zinc-500">Manage apps, people, and your account.</p></div><ShieldCheck className="h-7 w-7 text-emerald-700" /></div>
    {notice && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{notice}</div>}
    {error && <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">{error}<button onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}
    <div className="grid gap-4 lg:grid-cols-2">
      {isOwner && <>
        <section className="rounded-2xl border border-[#e6e2d6] bg-white p-5 shadow-sm"><h2 className="font-serif text-xl font-bold">Company profile</h2><form onSubmit={saveCompany} className="mt-4 space-y-3"><div className="flex gap-2"><input value={companyName} onChange={(event) => setCompanyName(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-[#e6e2d6] px-3 py-2 text-sm" /><input aria-label="Company color" type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-[#e6e2d6] bg-white p-1" /></div><button disabled={busy} className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white">Save</button></form></section>
        <section className="rounded-2xl border border-[#e6e2d6] bg-white p-5 shadow-sm"><h2 className="font-serif text-xl font-bold">Apps for this company</h2><div className="mt-4 grid gap-2 sm:grid-cols-2">{(['book', 'payroll'] as AppId[]).map((app) => <div key={app} className="flex items-center justify-between rounded-xl bg-[#faf9f5] p-3"><div><p className="text-sm font-bold">{appNames[app]}</p><p className="text-[11px] text-zinc-500">{appAccess[app].enabled ? 'Available to permitted members' : 'Disabled and hidden'}</p></div><button onClick={() => void toggleApp(app)} className={`rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider ${appAccess[app].enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-600'}`}>{appAccess[app].enabled ? 'Enabled' : 'Disabled'}</button></div>)}</div></section>
        <section className="rounded-2xl border border-[#e6e2d6] bg-white p-5 shadow-sm lg:col-span-2"><div className="flex items-center justify-between"><div><h2 className="font-serif text-xl font-bold">Invite people</h2><p className="mt-1 text-xs text-zinc-500">Choose access before creating a secure seven-day invitation.</p></div><UserPlus className="h-5 w-5 text-emerald-700" /></div><form onSubmit={createInvite} className="mt-4 grid gap-3 md:grid-cols-[1fr_150px_150px_auto]"><input required type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="person@company.com" className="rounded-xl border border-[#e6e2d6] px-3 py-2 text-sm" /><PermissionSelect value={invitePermissions.book} onChange={(value) => setInvitePermissions((current) => ({ ...current, book: value }))} /><PermissionSelect value={invitePermissions.payroll} onChange={(value) => setInvitePermissions((current) => ({ ...current, payroll: value }))} /><button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white"><Mail className="h-3.5 w-3.5" /> Create invite</button></form>{inviteLink && <div className="mt-3 flex gap-2 rounded-xl bg-emerald-50 p-2"><input readOnly value={inviteLink} className="min-w-0 flex-1 bg-transparent px-2 text-xs text-emerald-900" /><button onClick={() => void copyLink()} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-bold text-emerald-800"><Copy className="h-3 w-3" /> Copy</button></div>}</section>
        <section className="rounded-2xl border border-[#e6e2d6] bg-white p-5 shadow-sm lg:col-span-2"><h2 className="font-serif text-xl font-bold">People and access</h2><div className="mt-4 space-y-2">{members.map((member) => <div key={member.user_id} className="grid items-center gap-3 rounded-xl bg-[#faf9f5] p-3 md:grid-cols-[1fr_150px_150px_auto]"><div><p className="text-sm font-bold">{member.display_name || member.email}</p><p className="text-[11px] text-zinc-500">{member.email} · {member.role}</p></div><PermissionSelect value={member.book_permission} onChange={(value) => void updateMemberPermission(member, 'book', value)} /><PermissionSelect value={member.payroll_permission} onChange={(value) => void updateMemberPermission(member, 'payroll', value)} />{member.role === 'member' ? <button onClick={() => void removeMember(member.user_id)} aria-label="Remove member" className="justify-self-start rounded-lg p-2 text-red-600 hover:bg-red-50"><UserMinus className="h-4 w-4" /></button> : <span className="text-xs font-bold text-emerald-700">Owner</span>}</div>)}</div>{pendingInvitations.length > 0 && <div className="mt-5 border-t border-[#e6e2d6] pt-4"><p className="text-xs font-extrabold uppercase tracking-wider text-zinc-500">Pending invitations</p>{pendingInvitations.map((invitation) => <div key={invitation.id} className="mt-2 flex items-center justify-between rounded-xl border border-dashed border-zinc-300 p-3"><div><p className="text-sm font-semibold">{invitation.email}</p><p className="text-[11px] text-zinc-500">Expires {new Date(invitation.expires_at).toLocaleDateString()}</p></div><button onClick={() => void revokeInvite(invitation.id)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"><X className="h-4 w-4" /></button></div>)}</div>}</section>
      </>}
      <section className="rounded-2xl border border-[#e6e2d6] bg-white p-5 shadow-sm"><h2 className="font-serif text-xl font-bold">Your profile</h2><form onSubmit={saveProfile} className="mt-4 space-y-3"><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Display name / username" className="w-full rounded-xl border border-[#e6e2d6] px-3 py-2 text-sm" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-[#e6e2d6] px-3 py-2 text-sm" /><button disabled={busy} className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white">Save profile</button></form></section>
      <section className="rounded-2xl border border-[#e6e2d6] bg-white p-5 shadow-sm"><h2 className="font-serif text-xl font-bold">Password</h2><form onSubmit={updatePassword} className="mt-4 flex gap-2"><input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" className="min-w-0 flex-1 rounded-xl border border-[#e6e2d6] px-3 py-2 text-sm" /><button disabled={busy} className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white">Update</button></form></section>
    </div>
  </main>;
}

export function InviteAcceptance({ token }: { token: string }) {
  const { user, refreshWorkspace } = useAuth();
  const [status, setStatus] = useState('Accepting invitation…');
  useEffect(() => { if (!user) return; void (async () => { const { error } = await supabase.rpc('accept_workspace_invitation', { target_token: token }); if (error) setStatus(error.message); else { await refreshWorkspace(); setStatus('Invitation accepted. Redirecting to your company…'); window.setTimeout(() => { window.location.href = '/'; }, 500); } })(); }, [user, token]);
  return <main className="flex min-h-[70vh] items-center justify-center p-4"><section className="w-full max-w-md rounded-3xl border border-[#e6e2d6] bg-white p-7 text-center shadow-xl"><Check className="mx-auto h-8 w-8 text-emerald-700" /><h1 className="mt-4 font-serif text-2xl font-bold">Company invitation</h1><p className="mt-2 text-sm text-zinc-500">{user ? status : 'Sign in with the invited email address to continue.'}</p></section></main>;
}
