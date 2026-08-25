import React, { useEffect, useMemo, useState } from 'react';
import { Contact, Mail, MessageCircle, Phone, UserPlus, Users, X } from 'lucide-react';
import { Contacts } from '@capacitor-community/contacts';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../auth/AuthProvider';
import { getLatestAppDownloadUrl } from '../../../lib/mobile';
import { Book } from '../types';
import { useAsyncAction } from '../../../hooks/useAsyncAction';

type Member = { user_id: string; email: string; display_name: string; role: 'owner' | 'member'; book_permission: 'none' | 'view' | 'edit' };
type ContactEntry = { name?: string[]; tel?: string[]; email?: string[] };

const inviteText = (bookName: string, appLink: string) => `Join ${bookName} on Mathan ERP to work together. Download the app directly here: ${appLink}`;

export function AddMembersModal({ book, onClose }: { book: Book | null; onClose: () => void }) {
  const { workspace, isOwner } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [search, setSearch] = useState('');
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const { submitting, run } = useAsyncAction();

  useEffect(() => {
    if (!book || !workspace || !isOwner) return;
    void (async () => {
      const { data, error: memberError } = await supabase.rpc('list_workspace_members', { target_workspace: workspace.id });
      if (memberError) setError(memberError.message);
      else setMembers((data as Member[] | null) ?? []);
    })();
  }, [book, workspace?.id, isOwner]);

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return members
      .filter((member) => !query || `${member.display_name} ${member.email}`.toLowerCase().includes(query))
      .sort((left, right) => {
        const leftName = (left.display_name || left.email).toLowerCase();
        const rightName = (right.display_name || right.email).toLowerCase();
        if (query) {
          const rank = (name: string, email: string) => name.startsWith(query) ? 0 : name.includes(query) ? 1 : email.startsWith(query) ? 2 : 3;
          const rankDifference = rank(leftName, left.email) - rank(rightName, right.email);
          if (rankDifference !== 0) return rankDifference;
        }
        return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' }) || left.email.localeCompare(right.email);
      });
  }, [members, search]);
  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return contacts
      .filter((contact) => !query || `${contact.name?.[0] ?? ''} ${contact.tel?.[0] ?? ''} ${contact.email?.[0] ?? ''}`.toLowerCase().includes(query))
      .sort((left, right) => {
        const leftName = (left.name?.[0] || left.tel?.[0] || left.email?.[0] || '').toLowerCase();
        const rightName = (right.name?.[0] || right.tel?.[0] || right.email?.[0] || '').toLowerCase();
        if (query) {
          const rank = (name: string, phone: string, email: string) => name.startsWith(query) ? 0 : name.includes(query) ? 1 : phone.startsWith(query) || email.startsWith(query) ? 2 : 3;
          const rankDifference = rank(leftName, left.tel?.[0] ?? '', left.email?.[0] ?? '') - rank(rightName, right.tel?.[0] ?? '', right.email?.[0] ?? '');
          if (rankDifference !== 0) return rankDifference;
        }
        return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' }) || (left.tel?.[0] ?? '').localeCompare(right.tel?.[0] ?? '');
      });
  }, [contacts, search]);

  if (!book) return null;
  if (!isOwner) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={onClose}><div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><h2 className="text-sm font-bold">Add members</h2><button onClick={onClose}><X className="h-4 w-4" /></button></div><p className="mt-3 text-xs text-zinc-500">Only company owners can add people. Ask the owner to invite members from Workspace Settings.</p></div></div>;

  const addMember = async (member: Member) => {
    if (!workspace || member.book_permission !== 'none' || submitting) return;
    setError('');
    try {
      await run(async () => {
        const { error: addError } = await supabase.from('workspace_member_app_permissions').upsert({ workspace_id: workspace.id, user_id: member.user_id, app_id: 'book', permission: 'edit' });
        if (addError) throw addError;
        setMembers((current) => current.map((item) => item.user_id === member.user_id ? { ...item, book_permission: 'edit' } : item));
        setNotice(`${member.display_name || member.email} can now use Cash Book.`);
      });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not add this member.'); }
  };

  const chooseContacts = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const current = await Contacts.checkPermissions();
        const permission = current.contacts === 'granted' || current.contacts === 'limited' ? current : await Contacts.requestPermissions();
        if (permission.contacts !== 'granted' && permission.contacts !== 'limited') { setError('Contacts permission is required. Allow it in Android settings, then try again.'); return; }
        const result = await Contacts.getContacts({ projection: { name: true, phones: true, emails: true } });
        setContacts(result.contacts.map((contact) => ({ name: contact.name?.display ? [contact.name.display] : [], tel: (contact.phones ?? []).map((phone) => phone.number ?? '').filter(Boolean), email: (contact.emails ?? []).map((item) => item.address ?? '').filter(Boolean) })));
        setNotice('Choose SMS or WhatsApp beside a contact to send the direct app link.');
      } catch (error) {
        setError(error instanceof Error ? `${error.message} Try allowing Contacts access again.` : 'Contacts could not be loaded. Try again.');
      }
      return;
    }
    const contactsApi = (navigator as Navigator & { contacts?: { select: (properties: string[], options: { multiple: boolean }) => Promise<ContactEntry[]> } }).contacts;
    if (!contactsApi) { setError('Contact selection is not available here. Enter an email or phone number below.'); return; }
    try { setContacts(await contactsApi.select(['name', 'tel', 'email'], { multiple: true })); setNotice('Choose Invite beside a contact to send the app link.'); } catch { setNotice('Contact selection cancelled.'); }
  };

  const sendLink = async (channel: 'sms' | 'whatsapp', contact: ContactEntry) => {
    const number = (contact.tel?.[0] ?? '').replace(/[^0-9+]/g, '');
    const text = encodeURIComponent(inviteText(book.name, await getLatestAppDownloadUrl()));
    const url = channel === 'whatsapp' ? `https://wa.me/${number.replace(/^\+/, '')}?text=${text}` : `sms:${number}?body=${text}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const createEmailInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workspace || !email.trim()) return;
    if (submitting) return;
    setError('');
    try {
      await run(async () => {
        const { data, error: inviteError } = await supabase.rpc('create_workspace_invitation', { target_workspace: workspace.id, target_email: email.trim(), target_book_permission: 'edit', target_payroll_permission: 'none', target_truck_permission: 'none', expires_in_days: 7 });
        if (inviteError) throw inviteError;
        const token = (data as Array<{ invite_token: string }> | null)?.[0]?.invite_token;
        const link = token ? `${window.location.origin}/invite/${token}` : await getLatestAppDownloadUrl();
        setNotice('Invite created. Choose how to send it.');
        setEmail('');
        window.open(`mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(`Join ${book.name} on Mathan ERP`)}&body=${encodeURIComponent(`You are invited to join ${book.name} on Mathan ERP: ${link}`)}`, '_blank', 'noopener,noreferrer');
      });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create the invitation.'); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
    <div className="flex max-h-[88vh] w-full max-w-md flex-col rounded-xl border border-[#E6E2D6] bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-[#E6E2D6] p-4"><div><h2 className="flex items-center gap-2 text-sm font-bold"><UserPlus className="h-4 w-4 text-emerald-700" /> Add members</h2><p className="mt-1 text-[11px] text-[#6B7280]">Give people Cash Book access to {book.name}.</p></div><button onClick={onClose}><X className="h-4 w-4 text-[#6B7280]" /></button></div>
      <div className="overflow-y-auto p-4"><div className="relative"><Users className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people or contacts" className="w-full rounded-lg border border-[#D8D3C5] bg-[#FAF9F5] py-2 pl-9 pr-3 text-xs outline-none focus:ring-1 focus:ring-[#121212]" /></div>
        <button type="button" onClick={() => void chooseContacts()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[#D8D3C5] px-3 py-2 text-xs font-bold text-[#4B5563] hover:bg-[#F7F5EE]"><Contact className="h-4 w-4" /> Choose from contacts</button>
        {filteredMembers.length > 0 && <div className="mt-4"><p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">Mathan ERP users</p><div className="space-y-1">{filteredMembers.map((member) => <div key={member.user_id} className="flex items-center gap-2 rounded-lg border border-[#E6E2D6] p-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">{(member.display_name || member.email).slice(0, 1).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{member.display_name || member.email}</p><p className="truncate text-[10px] text-zinc-500">{member.email}</p></div>{member.book_permission === 'none' ? <button disabled={submitting} onClick={() => void addMember(member)} className="rounded-md bg-[#121212] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50">Add</button> : <span className="text-[10px] font-bold text-emerald-700">Added</span>}</div>)}</div></div>}
        {filteredContacts.length > 0 && <div className="mt-4"><p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">Choose from contacts</p><div className="space-y-1">{filteredContacts.map((contact, index) => <div key={`${contact.tel?.[0] ?? contact.email?.[0] ?? index}`} className="rounded-lg border border-[#E6E2D6] p-2"><div className="flex items-center gap-2"><Phone className="h-4 w-4 text-zinc-400" /><p className="min-w-0 flex-1 truncate text-xs font-bold">{contact.name?.[0] || contact.tel?.[0] || contact.email?.[0]}</p><span className="text-[10px] font-bold text-indigo-700">Invite</span></div><div className="mt-2 flex gap-1.5"><button type="button" disabled={!contact.tel?.[0]} onClick={() => sendLink('sms', contact)} className="flex-1 rounded-md border border-[#D8D3C5] px-2 py-1 text-[10px] font-bold disabled:opacity-40"><MessageCircle className="mr-1 inline h-3 w-3" /> SMS</button><button type="button" disabled={!contact.tel?.[0]} onClick={() => sendLink('whatsapp', contact)} className="flex-1 rounded-md bg-[#25D366] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"><MessageCircle className="mr-1 inline h-3 w-3" /> WhatsApp</button></div></div>)}</div></div>}
        {notice && <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-[11px] font-semibold text-emerald-800">{notice}</p>}{error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-[11px] font-semibold text-red-700">{error}</p>}
        <form onSubmit={createEmailInvite} className="mt-4 border-t border-[#E6E2D6] pt-4"><p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">Invite by email</p><div className="flex gap-2"><div className="relative min-w-0 flex-1"><Mail className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" /><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@example.com" className="w-full rounded-lg border border-[#D8D3C5] py-2 pl-8 pr-2 text-xs" /></div><button disabled={submitting} className="rounded-lg bg-[#121212] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{submitting ? 'Inviting…' : 'Invite'}</button></div></form>
      </div>
    </div>
  </div>;
}
