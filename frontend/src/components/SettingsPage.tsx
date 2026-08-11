import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, Eye, EyeOff, LogIn, Mail, Power, Share2, ShieldCheck, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { useAuth, type AppId, type AppPermission } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { shareInvite } from '../lib/mobile';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { ContactMemberCard } from './ContactMemberCard';
import { isValidPhone, normalizePhone, PHONE_COUNTRIES } from '../auth/phone';

type Member = { user_id: string; email: string; role: 'owner' | 'member'; display_name: string; book_permission: AppPermission; payroll_permission: AppPermission };
type Invitation = { id: string; email: string; status: string; expires_at: string; book_permission: AppPermission; payroll_permission: AppPermission; created_at: string };
type CompanyAccess = { workspace_id: string; workspace_name: string; is_member: boolean; member_role: 'owner' | 'member' | null };

const appNames: Record<AppId, string> = { book: 'Cash Book', payroll: 'Payroll' };
const companyColors = [
  { name: 'Warm cream', value: '#B09A7A' },
  { name: 'Vanilla', value: '#C9B458' },
  { name: 'Peach cream', value: '#C98F78' },
  { name: 'Rose cream', value: '#B9878A' },
  { name: 'Lavender cream', value: '#9B91B3' },
  { name: 'Blue cream', value: '#7D9BA6' },
  { name: 'Sage cream', value: '#879B78' },
  { name: 'Olive cream', value: '#8D8B5B' },
];

function PermissionSelect({ value, onChange }: { value: AppPermission; onChange: (value: AppPermission) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value as AppPermission)} className="rounded-lg border border-[#e6e2d6] bg-white px-2 py-1.5 text-xs font-semibold text-zinc-700">
    <option value="none">No access</option><option value="view">View</option><option value="edit">Edit</option>
  </select>;
}

function AppToggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return <button type="button" role="switch" aria-checked={enabled} aria-label={enabled ? 'Disable app' : 'Enable app'} onClick={onChange} className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${enabled ? 'bg-emerald-700' : 'bg-zinc-300'}`}><span className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} /></button>;
}

function CompanySettingsCard({ companyName, accentColor, editing, busy, onEdit, onCancel, onSubmit, setCompanyName, setAccentColor }: { companyName: string; accentColor: string; editing: boolean; busy: boolean; onEdit: () => void; onCancel: () => void; onSubmit: (event: FormEvent) => void; setCompanyName: (value: string) => void; setAccentColor: (value: string) => void }) {
  return <section className="rounded-2xl border border-[#e6e2d6] bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="font-serif text-xl font-bold">Company profile</h2><p className="mt-1 text-xs text-zinc-500">Company details are protected until you choose to edit them.</p></div>{!editing && <button type="button" onClick={onEdit} className="rounded-xl border border-[#e6e2d6] px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-[#faf9f5]">Edit</button>}</div>{editing ? <form onSubmit={onSubmit} className="mt-4 max-w-xl space-y-4"><input value={companyName} onChange={(event) => setCompanyName(event.target.value)} className="w-full rounded-xl border border-[#e6e2d6] px-3 py-2 text-sm" /><div><p className="mb-2 text-xs font-bold text-zinc-500">Company color</p><div className="flex flex-wrap items-center gap-2"><div className="flex items-center gap-2 rounded-xl border border-[#e6e2d6] bg-[#faf9f5] p-1.5"><input aria-label="Custom company color" type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} className="h-7 w-9 cursor-pointer rounded-lg border-0 bg-transparent p-0.5" /><span className="pr-1 text-[10px] font-semibold text-zinc-500">Custom</span></div>{companyColors.map((color) => <button key={color.value} type="button" aria-label={color.name} title={color.name} onClick={() => setAccentColor(color.value)} className={`h-8 w-8 rounded-full border-2 transition hover:scale-105 ${accentColor.toLowerCase() === color.value.toLowerCase() ? 'border-zinc-900 ring-2 ring-zinc-900/10' : 'border-white shadow-sm'}`} style={{ backgroundColor: color.value }} />)}</div></div><div className="flex gap-2"><button disabled={busy} className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white">Save changes</button><button type="button" onClick={onCancel} className="rounded-xl border border-[#e6e2d6] px-4 py-2 text-xs font-bold text-zinc-700">Cancel</button></div></form> : <div className="mt-5 flex items-center gap-3"><span className="h-8 w-8 rounded-full border border-[#e6e2d6]" style={{ backgroundColor: accentColor }} /><div><p className="text-sm font-bold text-zinc-800">{companyName || 'Unnamed company'}</p><p className="text-xs text-zinc-500">Company color selected</p></div></div>}</section>;
}

function PhoneCountrySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = PHONE_COUNTRIES.find((country) => country.code === value) ?? PHONE_COUNTRIES[0];
  return <div className="relative w-36 shrink-0"><button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex w-full items-center justify-between rounded-xl border border-[#e6e2d6] bg-white px-3 py-2 text-left text-sm text-zinc-800 shadow-sm hover:border-emerald-300"><span className="truncate">{selected.code} {selected.name}</span><ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} /></button>{open && <div role="listbox" className="absolute bottom-[calc(100%+0.35rem)] left-0 z-30 max-h-80 w-64 overflow-y-auto rounded-xl border border-[#e6e2d6] bg-white p-1.5 shadow-xl">{PHONE_COUNTRIES.map((country) => <button key={country.code} type="button" role="option" aria-selected={country.code === value} onClick={() => { onChange(country.code); setOpen(false); }} className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition ${country.code === value ? 'bg-emerald-700 font-bold text-white' : 'text-zinc-700 hover:bg-emerald-50 hover:text-emerald-900'}`}>{country.code} {country.name}</button>)}</div>}</div>;
}

function ProfileSettingsCard({ displayName, email, phone, countryCode, editing, busy, onEdit, onCancel, onSubmit, setDisplayName, setEmail, setPhone, setCountryCode }: { displayName: string; email: string; phone: string; countryCode: string; editing: boolean; busy: boolean; onEdit: () => void; onCancel: () => void; onSubmit: (event: FormEvent) => void; setDisplayName: (value: string) => void; setEmail: (value: string) => void; setPhone: (value: string) => void; setCountryCode: (value: string) => void }) {
  return <section className="rounded-2xl border border-[#e6e2d6] bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="font-serif text-xl font-bold">Your profile</h2><p className="mt-1 text-xs text-zinc-500">Your name, email, and phone number.</p></div>{!editing && <button type="button" onClick={onEdit} className="rounded-xl border border-[#e6e2d6] px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-[#faf9f5]">Edit</button>}</div>{editing ? <form onSubmit={onSubmit} className="mt-4 max-w-xl space-y-3"><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Display name / username" className="w-full rounded-xl border border-[#e6e2d6] px-3 py-2 text-sm" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-[#e6e2d6] px-3 py-2 text-sm" /><div className="flex gap-2"><PhoneCountrySelect value={countryCode} onChange={setCountryCode} /><input inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone number" className="min-w-0 flex-1 rounded-xl border border-[#e6e2d6] px-3 py-2 text-sm" /></div><p className="text-[11px] text-zinc-500">Example: 0741321674 is saved as {countryCode}741321674.</p><div className="flex gap-2"><button disabled={busy} className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white">Save profile</button><button type="button" onClick={onCancel} className="rounded-xl border border-[#e6e2d6] px-4 py-2 text-xs font-bold text-zinc-700">Cancel</button></div></form> : <dl className="mt-5 grid gap-3 sm:grid-cols-3"><div><dt className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">Name</dt><dd className="mt-1 text-sm font-semibold text-zinc-800">{displayName || 'Not set'}</dd></div><div><dt className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">Email</dt><dd className="mt-1 truncate text-sm font-semibold text-zinc-800">{email || 'Not set'}</dd></div><div><dt className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">Phone</dt><dd className="mt-1 text-sm font-semibold text-zinc-800">{phone ? `${countryCode}${phone.replace(/^0+/, '')}` : 'Not set'}</dd></div></dl>}</section>;
}

function SecuritySettingsCard({ password, editing, showPassword, busy, onEdit, onCancel, onSubmit, onTogglePassword, setPassword }: { password: string; editing: boolean; showPassword: boolean; busy: boolean; onEdit: () => void; onCancel: () => void; onSubmit: (event: FormEvent) => void; onTogglePassword: () => void; setPassword: (value: string) => void }) {
  return <section className="rounded-2xl border border-[#e6e2d6] bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="font-serif text-xl font-bold">Password</h2><p className="mt-1 text-xs text-zinc-500">Keep your account secure.</p></div>{!editing && <button type="button" onClick={onEdit} className="rounded-xl border border-[#e6e2d6] px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-[#faf9f5]">Edit</button>}</div>{editing ? <form onSubmit={onSubmit} className="mt-4 max-w-xl space-y-3"><div className="relative"><input required minLength={8} type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" className="w-full rounded-xl border border-[#e6e2d6] px-3 py-2 pr-10 text-sm" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={onTogglePassword} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-zinc-500 hover:bg-zinc-100">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div><div className="flex gap-2"><button disabled={busy} className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white">Update password</button><button type="button" onClick={onCancel} className="rounded-xl border border-[#e6e2d6] px-4 py-2 text-xs font-bold text-zinc-700">Cancel</button></div></form> : <p className="mt-5 text-sm font-semibold text-zinc-700">Password is set. Select Edit to change it.</p>}</section>;
}

function PeopleAccessCard({ members, expandedMember, companyAccess, busy, onExpand, onPermission, onCompanyAccess, onRemove }: { members: Member[]; expandedMember: string | null; companyAccess: Record<string, CompanyAccess[]>; busy: boolean; onExpand: (member: Member, expanded: boolean) => void; onPermission: (member: Member, app: AppId, permission: AppPermission) => void; onCompanyAccess: (member: Member, company: CompanyAccess) => void; onRemove: (id: string) => void }) {
  return <section className="rounded-2xl border border-[#e6e2d6] bg-white p-5 shadow-sm"><h2 className="font-serif text-xl font-bold">People and access</h2><p className="mt-1 text-xs text-zinc-500">Choose which companies each member can access.</p><div className="mt-4 space-y-2">{members.map((member) => { const expanded = expandedMember === member.user_id; return <div key={member.user_id} className="rounded-xl bg-[#faf9f5] p-3"><button onClick={() => onExpand(member, expanded)} className="flex w-full items-center gap-3 text-left"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-bold text-zinc-700">{(member.display_name || member.email).slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{member.display_name || member.email}</span><span className="block truncate text-[11px] text-zinc-500">{member.email} · {member.role}</span></span><span className="hidden text-[10px] font-bold uppercase tracking-wider text-zinc-500 sm:block">{expanded ? 'Show less' : 'Show more'}</span>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>{expanded && <div className="mt-3 border-t border-zinc-200 pt-3">{member.role === 'member' && <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3"><div className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /><div><p className="text-xs font-bold text-indigo-900">Company access</p><p className="mt-0.5 text-[11px] text-indigo-800">Add or remove this member from your companies.</p></div></div>{!companyAccess[member.user_id] ? <p className="mt-2 text-[11px] text-zinc-500">Loading company access…</p> : <div className="mt-2 space-y-1.5">{companyAccess[member.user_id].map((company) => <div key={company.workspace_id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2"><span className="min-w-0 truncate text-xs font-semibold text-zinc-800">{company.workspace_name}</span><button type="button" disabled={busy} onClick={() => onCompanyAccess(member, company)} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${company.is_member ? 'border border-red-200 text-red-700 hover:bg-red-50' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>{company.is_member ? 'Remove' : 'Add'}</button></div>)}</div>}</div>}<div className="grid gap-2 sm:grid-cols-2"><label className="text-[11px] font-bold text-zinc-500">Cash Book<PermissionSelect value={member.book_permission} onChange={(value) => onPermission(member, 'book', value)} /></label><label className="text-[11px] font-bold text-zinc-500">Payroll<PermissionSelect value={member.payroll_permission} onChange={(value) => onPermission(member, 'payroll', value)} /></label></div><div className="mt-3 flex items-center justify-between"><span className="text-xs text-zinc-500">{member.role === 'owner' ? 'Company owner' : 'Member access can be changed here.'}</span>{member.role === 'member' && <button onClick={() => onRemove(member.user_id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"><UserMinus className="h-3.5 w-3.5" /> Remove</button>}</div></div>}</div>; })}</div></section>;
}

export function SettingsPage() {
  const { workspace, user, isGuest, isOwner, appAccess, refreshWorkspace, refreshAccess, signOut } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [companyName, setCompanyName] = useState(workspace?.name ?? '');
  const [accentColor, setAccentColor] = useState(workspace?.accent_color ?? '#54623E');
  const [displayName, setDisplayName] = useState((user?.user_metadata?.name as string | undefined) ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+256');
  const [savedPhone, setSavedPhone] = useState('');
  const [savedCountryCode, setSavedCountryCode] = useState('+256');
  const [editingCompany, setEditingCompany] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingSecurity, setEditingSecurity] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePermissions, setInvitePermissions] = useState<Record<AppId, AppPermission>>({ book: 'none', payroll: 'none' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const requestedSection = new URLSearchParams(window.location.search).get('section');
  const [activeSection, setActiveSection] = useState<'company' | 'apps' | 'invites' | 'people' | 'profile' | 'security'>(requestedSection === 'invites' ? requestedSection : 'profile');
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [companyAccess, setCompanyAccess] = useState<Record<string, CompanyAccess[]>>({});

  const loadOwnerData = async () => {
    if (!workspace || !isOwner) return;
    const [{ data: memberRows }, { data: invitationRows }] = await Promise.all([
      supabase.rpc('list_workspace_members', { target_workspace: workspace.id }),
      supabase.from('workspace_invitations').select('id,email,status,expires_at,book_permission,payroll_permission,created_at').eq('workspace_id', workspace.id).order('created_at', { ascending: false }),
    ]);
    setMembers((memberRows as Member[] | null) ?? []);
    setInvitations((invitationRows as Invitation[] | null) ?? []);
  };

  useEffect(() => { setCompanyName(workspace?.name ?? ''); setAccentColor(workspace?.accent_color ?? '#54623E'); setEditingCompany(false); void loadOwnerData(); }, [workspace?.id, isOwner]);

  useEffect(() => {
    if (!user) return;
    setDisplayName((user.user_metadata?.name as string | undefined) ?? '');
    setEmail(user.email ?? '');
    void supabase.from('workspace_profiles').select('display_name,phone').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      setDisplayName(data?.display_name ?? (user.user_metadata?.name as string | undefined) ?? '');
      const savedPhoneValue = data?.phone ?? (user.user_metadata?.phone as string | undefined) ?? '';
      const matchedCountry = PHONE_COUNTRIES.find((country) => savedPhoneValue.startsWith(country.code));
      const loadedCountryCode = matchedCountry?.code ?? '+256';
      const loadedPhone = matchedCountry ? savedPhoneValue.slice(matchedCountry.code.length) : savedPhoneValue;
      setCountryCode(loadedCountryCode); setSavedCountryCode(loadedCountryCode);
      setPhone(loadedPhone); setSavedPhone(loadedPhone);
    });
  }, [user?.id]);

  useEffect(() => {
    if (!workspace || !expandedMember) return;
    const currentCompany = companyAccess[expandedMember]?.find((company) => company.workspace_id === workspace.id);
    if (currentCompany && !currentCompany.is_member) setMembers((current) => current.filter((member) => member.user_id !== expandedMember));
  }, [companyAccess, expandedMember, workspace?.id]);

  const saveCompany = async (event: FormEvent) => {
    event.preventDefault();
    if (!workspace || companyName.trim().length < 2) return;
    setBusy(true); setError(''); setNotice('');
    const { error: saveError } = await supabase.from('workspaces').update({ name: companyName.trim(), accent_color: accentColor }).eq('id', workspace.id);
    if (saveError) setError(saveError.message); else { await refreshWorkspace(); setEditingCompany(false); setNotice('Company name saved.'); }
    setBusy(false);
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    const normalizedPhone = normalizePhone(phone, countryCode);
    if (!isValidPhone(normalizedPhone)) { setError('Enter a valid phone number with a country code.'); return; }
    setBusy(true); setError(''); setNotice('');
    const [{ error: profileError }, { error: authError }] = await Promise.all([
      supabase.from('workspace_profiles').upsert({ user_id: user.id, display_name: displayName.trim(), phone: normalizedPhone }),
      supabase.auth.updateUser({ data: { name: displayName.trim(), phone: normalizedPhone }, ...(email.trim() !== user.email ? { email: email.trim() } : {}) }),
    ]);
    if (profileError || authError) setError(profileError?.message ?? authError?.message ?? 'Could not save profile.'); else { setPhone(normalizedPhone.slice(countryCode.length)); setSavedPhone(normalizedPhone.slice(countryCode.length)); setSavedCountryCode(countryCode); setEditingProfile(false); setNotice(email.trim() !== user.email ? 'Profile saved. Check your new email for confirmation.' : 'Profile saved.'); }
    setBusy(false);
  };

  const updatePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) { setError('Use at least 8 characters for your password.'); return; }
    setBusy(true); setError(''); setNotice('');
    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) setError(passwordError.message); else { setPassword(''); setShowPassword(false); setEditingSecurity(false); setNotice('Password updated.'); }
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

  const createShareLink = async () => {
    if (!workspace || !inviteEmail.trim()) { setError('Enter the member email first so the link can be tied to an invitation.'); return; }
    setBusy(true); setError(''); setNotice(''); setInviteLink('');
    const { data, error: inviteError } = await supabase.rpc('create_workspace_invitation', { target_workspace: workspace.id, target_email: inviteEmail.trim(), target_book_permission: invitePermissions.book, target_payroll_permission: invitePermissions.payroll, expires_in_days: 7 });
    if (inviteError) setError(inviteError.message);
    else {
      const row = (data as Array<{ invite_token: string }> | null)?.[0];
      setInviteLink(row ? `${window.location.origin}/invite/${row.invite_token}` : '');
      setNotice('Shareable invitation link created.');
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

  const confirmRemoveMember = async (id: string) => {
    if (!workspace) return;
    const { error: removeError } = await supabase.rpc('remove_workspace_member', { target_workspace: workspace.id, target_user: id });
    if (removeError) setError(removeError.message); else { setMemberToRemove(null); await loadOwnerData(); }
  };
  const removeMember = (id: string) => {
    const member = members.find((item) => item.user_id === id);
    if (member) setMemberToRemove(member);
  };

  const loadCompanyAccess = async (member: Member) => {
    if (companyAccess[member.user_id]) return;
    const { data, error: accessError } = await supabase.rpc('list_member_company_access', { target_user: member.user_id });
    if (accessError) setError(accessError.message); else setCompanyAccess((current) => ({ ...current, [member.user_id]: (data as CompanyAccess[] | null) ?? [] }));
  };

  const toggleCompanyAccess = async (member: Member, company: CompanyAccess) => {
    setBusy(true); setError('');
    const { error: accessError } = await supabase.rpc('set_member_workspace_access', { target_workspace: company.workspace_id, target_user: member.user_id, enabled: !company.is_member });
    if (accessError) setError(accessError.message); else {
      setCompanyAccess((current) => ({ ...current, [member.user_id]: (current[member.user_id] ?? []).map((item) => item.workspace_id === company.workspace_id ? { ...item, is_member: !company.is_member, member_role: !company.is_member ? 'member' : null } : item) }));
      setNotice(`${member.display_name || member.email} ${company.is_member ? 'was removed from' : 'was added to'} ${company.workspace_name}.`);
    }
    setBusy(false);
  };

  const copyLink = async () => { if (inviteLink) { await navigator.clipboard.writeText(inviteLink); setNotice('Invite link copied.'); } };
  const shareCurrentInvite = async () => { if (inviteLink) { await shareInvite(inviteLink, ''); setNotice('Invite sharing opened.'); } };
  const pendingInvitations = useMemo(() => invitations.filter((invitation) => invitation.status === 'pending'), [invitations]);
  const navItems = [
    { id: 'profile' as const, label: 'Profile' },
    ...(isOwner ? [{ id: 'company' as const, label: 'Company' }, { id: 'apps' as const, label: 'Apps' }, { id: 'invites' as const, label: 'Invitations' }] : []),
  ];
  const sectionTitle = navItems.find((item) => item.id === activeSection)?.label ?? 'Settings';

  return <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
    <div className="mb-5 flex items-start gap-3"><ShieldCheck className="mt-1 h-6 w-6 text-emerald-700" /><div><p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-emerald-700">Workspace settings</p><h1 className="mt-1 font-serif text-3xl font-bold text-zinc-900">{sectionTitle}</h1><p className="mt-1 text-sm text-zinc-500">Manage this company and your account.</p></div></div>
    {notice && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{notice}</div>}
    {error && <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">{error}<button onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}
    {isGuest && <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><div><p className="text-xs font-bold text-amber-900">You are using Mathan ERP as a guest.</p><p className="mt-0.5 text-[11px] text-amber-800">Log in to sync your records and join a company workspace.</p></div><button type="button" onClick={() => void signOut()} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-bold text-white"><LogIn className="h-3.5 w-3.5" /> Log in</button></div>}
    <div className="flex flex-col gap-5 lg:flex-row">
      <aside className="w-full shrink-0 lg:w-56"><nav className="flex gap-1 overflow-x-auto rounded-2xl border border-[#e6e2d6] bg-white p-2 shadow-sm lg:block lg:space-y-1">{navItems.map((item) => <button key={item.id} onClick={() => setActiveSection(item.id)} className={`flex shrink-0 items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold transition lg:w-full ${activeSection === item.id ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-[#f6f5ef]'}`}><span>{item.label}</span><ChevronRight className="hidden h-3.5 w-3.5 lg:block" /></button>)}</nav></aside>
      <div className="min-w-0 flex flex-1 flex-col">
        {activeSection === 'company' && isOwner && <div className="order-2 mt-4"><PeopleAccessCard members={members} expandedMember={expandedMember} companyAccess={companyAccess} busy={busy} onExpand={(member, expanded) => { setExpandedMember(expanded ? null : member.user_id); if (!expanded) void loadCompanyAccess(member); }} onPermission={(member, app, permission) => void updateMemberPermission(member, app, permission)} onCompanyAccess={(member, company) => void toggleCompanyAccess(member, company)} onRemove={(id) => void removeMember(id)} /></div>}
        {activeSection === 'profile' && <div className="order-2 mt-4"><SecuritySettingsCard password={password} editing={editingSecurity} showPassword={showPassword} busy={busy} onEdit={() => setEditingSecurity(true)} onCancel={() => { setPassword(''); setShowPassword(false); setEditingSecurity(false); }} onSubmit={updatePassword} onTogglePassword={() => setShowPassword((current) => !current)} setPassword={setPassword} /></div>}
        {activeSection === 'invites' && isOwner && <ContactMemberCard />}
        {activeSection === 'company' && isOwner && <CompanySettingsCard companyName={companyName} accentColor={accentColor} editing={editingCompany} busy={busy} onEdit={() => setEditingCompany(true)} onCancel={() => { setCompanyName(workspace?.name ?? ''); setAccentColor(workspace?.accent_color ?? '#54623E'); setEditingCompany(false); }} onSubmit={saveCompany} setCompanyName={setCompanyName} setAccentColor={setAccentColor} />}
        {activeSection === 'apps' && isOwner && <section className="space-y-3">{(['book', 'payroll'] as AppId[]).map((app) => <div key={app} className="flex items-center justify-between rounded-2xl border border-[#e6e2d6] bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Power className="h-4 w-4" /></span><div><p className="text-sm font-bold">{appNames[app]}</p><p className="text-xs text-zinc-500">{appAccess[app].enabled ? 'Available to permitted members' : 'Disabled and hidden'}</p></div></div><div className="flex items-center gap-3"><span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">{appAccess[app].enabled ? 'On' : 'Off'}</span><AppToggle enabled={appAccess[app].enabled} onChange={() => void toggleApp(app)} /></div></div>)}</section>}
        {activeSection === 'invites' && isOwner && <section className="rounded-2xl border border-[#e6e2d6] bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><h2 className="font-serif text-xl font-bold">Invite people</h2><p className="mt-1 text-xs text-zinc-500">Choose access before creating a secure seven-day invitation.</p></div><UserPlus className="h-5 w-5 text-emerald-700" /></div><form onSubmit={createInvite} className="mt-4 max-w-2xl space-y-3"><input required type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="person@company.com" className="w-full rounded-xl border border-[#e6e2d6] px-3 py-2 text-sm" /><div className="grid gap-2 sm:grid-cols-2"><PermissionSelect value={invitePermissions.book} onChange={(value) => setInvitePermissions((current) => ({ ...current, book: value }))} /><PermissionSelect value={invitePermissions.payroll} onChange={(value) => setInvitePermissions((current) => ({ ...current, payroll: value }))} /></div><button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white"><Mail className="h-3.5 w-3.5" /> Create invite</button></form>{inviteLink && <div className="mt-4 flex flex-wrap gap-2 rounded-xl bg-emerald-50 p-2"><input readOnly value={inviteLink} className="min-w-[220px] flex-1 bg-transparent px-2 text-xs text-emerald-900" /><button onClick={() => void copyLink()} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-bold text-emerald-800"><Copy className="h-3 w-3" /> Copy</button><button onClick={() => void shareCurrentInvite()} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2 py-1 text-xs font-bold text-white"><Share2 className="h-3 w-3" /> Share invite</button></div>}{pendingInvitations.length > 0 && <div className="mt-7 border-t border-[#e6e2d6] pt-4"><p className="text-xs font-extrabold uppercase tracking-wider text-zinc-500">Pending invitations</p>{pendingInvitations.map((invitation) => <div key={invitation.id} className="mt-2 flex items-center justify-between rounded-xl border border-dashed border-zinc-300 p-3"><div><p className="text-sm font-semibold">{invitation.email}</p><p className="text-[11px] text-zinc-500">Expires {new Date(invitation.expires_at).toLocaleDateString()}</p></div><button onClick={() => void revokeInvite(invitation.id)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"><X className="h-4 w-4" /></button></div>)}</div>}</section>}
        {activeSection === 'invites' && isOwner && <section className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="font-serif text-xl font-bold text-emerald-950">Add member with link</h2><p className="mt-1 text-xs leading-5 text-emerald-800">Enter an email in the invitation card above, choose permissions, then create a link to send by WhatsApp, SMS, or any other app.</p></div><Share2 className="h-5 w-5 shrink-0 text-emerald-700" /></div><button type="button" disabled={busy} onClick={() => void createShareLink()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><Share2 className="h-3.5 w-3.5" /> Create share link</button>{inviteLink && <div className="mt-3 flex flex-wrap gap-2 rounded-xl bg-white p-2"><input readOnly value={inviteLink} className="min-w-[220px] flex-1 bg-transparent px-2 text-xs text-emerald-900" /><button type="button" onClick={() => void copyLink()} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-xs font-bold text-emerald-800"><Copy className="h-3 w-3" /> Copy</button><button type="button" onClick={() => void shareCurrentInvite()} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2 py-1 text-xs font-bold text-white"><Share2 className="h-3 w-3" /> Share</button></div>}</section>}
        {activeSection === 'people' && isOwner && <section className="rounded-2xl border border-[#e6e2d6] bg-white p-5 shadow-sm"><h2 className="font-serif text-xl font-bold">People and access</h2><div className="mt-4 space-y-2">{members.map((member) => { const expanded = expandedMember === member.user_id; return <div key={member.user_id} className="rounded-xl bg-[#faf9f5] p-3"><button onClick={() => { setExpandedMember(expanded ? null : member.user_id); if (!expanded) void loadCompanyAccess(member); }} className="flex w-full items-center gap-3 text-left"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-bold text-zinc-700">{(member.display_name || member.email).slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{member.display_name || member.email}</span><span className="block truncate text-[11px] text-zinc-500">{member.email} · {member.role}</span></span><span className="hidden text-[10px] font-bold uppercase tracking-wider text-zinc-500 sm:block">{expanded ? 'Show less' : 'Show more'}</span>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>{expanded && <div className="mt-3 border-t border-zinc-200 pt-3">{member.role === 'member' && <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3"><div className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /><div><p className="text-xs font-bold text-indigo-900">Company access</p><p className="mt-0.5 text-[11px] text-indigo-800">Choose which of your companies this member can access.</p></div></div>{!companyAccess[member.user_id] ? <p className="mt-2 text-[11px] text-zinc-500">Loading company access…</p> : <div className="mt-2 space-y-1.5">{companyAccess[member.user_id].map((company) => <div key={company.workspace_id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2"><span className="min-w-0 truncate text-xs font-semibold text-zinc-800">{company.workspace_name}</span><button type="button" disabled={busy} onClick={() => void toggleCompanyAccess(member, company)} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${company.is_member ? 'border border-red-200 text-red-700 hover:bg-red-50' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>{company.is_member ? 'Remove' : 'Add'}</button></div>)}</div>}</div>}<div className="grid gap-2 sm:grid-cols-2"><label className="text-[11px] font-bold text-zinc-500">Cash Book<PermissionSelect value={member.book_permission} onChange={(value) => void updateMemberPermission(member, 'book', value)} /></label><label className="text-[11px] font-bold text-zinc-500">Payroll<PermissionSelect value={member.payroll_permission} onChange={(value) => void updateMemberPermission(member, 'payroll', value)} /></label></div><div className="mt-3 flex items-center justify-between"><span className="text-xs text-zinc-500">{member.role === 'owner' ? 'Company owner' : 'Member access can be changed here.'}</span>{member.role === 'member' && <button onClick={() => void removeMember(member.user_id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"><UserMinus className="h-3.5 w-3.5" /> Remove</button>}</div></div>}</div>; })}</div></section>}
        {activeSection === 'profile' && <ProfileSettingsCard displayName={displayName} email={email} phone={phone} countryCode={countryCode} editing={editingProfile} busy={busy} onEdit={() => setEditingProfile(true)} onCancel={() => { setDisplayName((user?.user_metadata?.name as string | undefined) ?? ''); setEmail(user?.email ?? ''); setPhone(savedPhone); setCountryCode(savedCountryCode); setEditingProfile(false); }} onSubmit={saveProfile} setDisplayName={setDisplayName} setEmail={setEmail} setPhone={setPhone} setCountryCode={setCountryCode} />}
        {activeSection === 'security' && <SecuritySettingsCard password={password} editing={editingSecurity} showPassword={showPassword} busy={busy} onEdit={() => setEditingSecurity(true)} onCancel={() => { setPassword(''); setShowPassword(false); setEditingSecurity(false); }} onSubmit={updatePassword} onTogglePassword={() => setShowPassword((current) => !current)} setPassword={setPassword} />}
        <DeleteConfirmModal isOpen={!!memberToRemove} title="Remove member?" message={memberToRemove ? <>Are you sure you want to remove <strong className="text-[#121212]">{memberToRemove.display_name || memberToRemove.email}</strong> from the company?</> : ''} onClose={() => setMemberToRemove(null)} onConfirm={() => { if (memberToRemove) void confirmRemoveMember(memberToRemove.user_id); }} confirmLabel="Remove" />
      </div>
    </div>
  </main>;
}

export function InviteAcceptance({ token }: { token: string }) {
  const { user, refreshWorkspace } = useAuth();
  const [status, setStatus] = useState('Accepting invitation…');
  useEffect(() => { if (!user) return; void (async () => { const { error } = await supabase.rpc('accept_workspace_invitation', { target_token: token }); if (error) setStatus(error.message); else { await refreshWorkspace(); setStatus('Invitation accepted. Redirecting to your company…'); window.setTimeout(() => { window.location.href = '/'; }, 500); } })(); }, [user, token]);
  return <main className="flex min-h-[70vh] items-center justify-center p-4"><section className="w-full max-w-md rounded-3xl border border-[#e6e2d6] bg-white p-7 text-center shadow-xl"><Check className="mx-auto h-8 w-8 text-emerald-700" /><h1 className="mt-4 font-serif text-2xl font-bold">Company invitation</h1><p className="mt-2 text-sm text-zinc-500">{user ? status : 'Sign in with the invited email address to continue.'}</p></section></main>;
}
