import { useMemo, useState } from 'react';
import { ArrowLeft, Check, Contact, LoaderCircle, MessageCircle, Search, Share2, UserPlus, Users } from 'lucide-react';
import { Contacts } from '@capacitor-community/contacts';
import { Capacitor } from '@capacitor/core';
import { createWorkspacePhoneInvitation, lookupWorkspaceContacts } from '../lib/repositories/workspaceRepository';
import { useAuth } from '../auth/AuthProvider';
import { getLatestAppDownloadUrl } from '../lib/mobile';

type ContactEntry = { id: string; name: string; number: string };
type ContactStatus = 'checking' | 'app' | 'added' | 'invited' | 'invite';
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '+';
}

function normalize(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, '');
  if (compact.startsWith('+')) return `+${compact.slice(1).replace(/\D/g, '')}`;
  return `+256${compact.replace(/\D/g, '').replace(/^0+/, '')}`;
}

export function ContactMemberCard() {
  const { workspace } = useAuth();
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ContactStatus>>({});
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const loadContacts = async () => {
    setOpen(true); setLoading(true); setNotice('');
    try {
      let loaded: ContactEntry[] = [];
      if (Capacitor.isNativePlatform()) {
        const currentPermission = await Contacts.checkPermissions();
        const permission = currentPermission.contacts === 'granted' || currentPermission.contacts === 'limited'
          ? currentPermission
          : await Contacts.requestPermissions();
        if (permission.contacts !== 'granted' && permission.contacts !== 'limited') {
          setNotice('Contacts permission is required. Allow access in the Android prompt or app settings, then tap Choose from contacts again.');
          return;
        }
        const result = await Contacts.getContacts({ projection: { name: true, phones: true } });
        loaded = result.contacts.flatMap((contact) => (contact.phones ?? []).filter((phone) => phone.number).map((phone, index) => ({ id: `${contact.contactId}-${index}`, name: contact.name?.display || 'Unnamed contact', number: phone.number || '' })));
      } else {
        const api = (navigator as Navigator & { contacts?: { select: (properties: string[], options: { multiple: boolean }) => Promise<Array<{ name?: string[]; tel?: string[] }>> } }).contacts;
        if (!api) { setNotice('Contact access is available in the Android app. You can use Add manually below.'); return; }
        const selected = await api.select(['name', 'tel'], { multiple: true });
        loaded = selected.flatMap((contact, index) => (contact.tel ?? []).map((number, phoneIndex) => ({ id: `${index}-${phoneIndex}`, name: contact.name?.[0] || 'Unnamed contact', number })));
      }
      const unique = Array.from(new Map(loaded.filter((contact) => contact.number.trim()).map((contact) => [normalize(contact.number), { ...contact, number: normalize(contact.number) }])).values());
      setContacts(unique);
      if (!workspace || unique.length === 0) { setStatuses(Object.fromEntries(unique.map((contact) => [contact.number, 'invite']))); return; }
      setStatuses(Object.fromEntries(unique.map((contact) => [contact.number, 'checking'])));
      let appUsers: Set<string>;
      try { appUsers = new Set((await lookupWorkspaceContacts(workspace.id, unique.map((contact) => contact.number))).map((item) => normalize(item.phone))); } catch { setNotice('Could not check app users. You can still invite contacts.'); setStatuses(Object.fromEntries(unique.map((contact) => [contact.number, 'invite']))); return; }
      setStatuses(Object.fromEntries(unique.map((contact) => [contact.number, appUsers.has(contact.number) ? 'app' : 'invite'])));
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '';
      const message = rawMessage.toLowerCase();
      setNotice(message.includes('cancel') && !Capacitor.isNativePlatform() ? 'Contact selection cancelled. You can use Add manually below.' : rawMessage.includes('Permission') ? `${rawMessage} Allow Contacts access, then tap Choose from contacts again.` : 'Contacts could not be loaded. Tap Choose from contacts again.');
    } finally { setLoading(false); }
  };

  const sendLink = async (channel: 'sms' | 'whatsapp', number: string, name: string) => {
    const text = encodeURIComponent(`Join me on Mathan ERP. Download the app directly here: ${await getLatestAppDownloadUrl()}`);
    window.open(channel === 'whatsapp' ? `https://wa.me/${number.replace(/^\+/, '')}?text=${text}` : `sms:${number}?body=${text}`, '_blank', 'noopener,noreferrer');
    setNotice(`Invite link ready for ${name}.`);
  };

  const addContact = async (contact: ContactEntry) => {
    if (!workspace) return;
    setStatuses((current) => ({ ...current, [contact.number]: 'checking' }));
    try { const data = await createWorkspacePhoneInvitation(workspace.id, contact.number); if (!data) throw new Error('This contact is not registered yet.'); } catch (reason) { setStatuses((current) => ({ ...current, [contact.number]: 'invite' })); setNotice(reason instanceof Error ? reason.message : 'This contact is not registered yet.'); return; }
    setStatuses((current) => ({ ...current, [contact.number]: 'invited' }));
    setNotice(`${contact.name} was invited. They must accept before joining your company.`);
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return contacts
      .filter((contact) => !query || `${contact.name} ${contact.number}`.toLowerCase().includes(query))
      .sort((left, right) => {
        const leftName = left.name.toLowerCase();
        const rightName = right.name.toLowerCase();
        if (query) {
          const rank = (name: string, number: string) => name.startsWith(query) ? 0 : name.includes(query) ? 1 : number.startsWith(query) ? 2 : 3;
          const rankDifference = rank(leftName, left.number) - rank(rightName, right.number);
          if (rankDifference !== 0) return rankDifference;
        }
        return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' }) || left.number.localeCompare(right.number);
      });
  }, [contacts, search]);
  const appContacts = filtered.filter((contact) => statuses[contact.number] === 'app' || statuses[contact.number] === 'added' || statuses[contact.number] === 'invited' || statuses[contact.number] === 'checking');
  const inviteContacts = filtered.filter((contact) => statuses[contact.number] === 'invite');

  return <>
    <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="font-serif text-xl font-bold text-emerald-950">Add member from contacts</h2><p className="mt-1 text-xs leading-5 text-emerald-800">People with Mathan ERP show Add. Everyone else gets an SMS or WhatsApp invite link.</p></div><Contact className="h-5 w-5 shrink-0 text-emerald-700" /></div><button type="button" onClick={() => void loadContacts()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white"><Contact className="h-3.5 w-3.5" /> Choose from contacts</button>{notice && !open && <p className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-emerald-800"><Share2 className="h-3.5 w-3.5" /> {notice}</p>}</section>
    {open && <div className="fixed inset-0 z-[70] flex min-h-screen flex-col bg-[#faf9f5] text-zinc-900"><header className="shrink-0 border-b border-[#e6e2d6] bg-white px-4 py-3 shadow-sm sm:px-6"><div className="mx-auto flex max-w-2xl items-center gap-3"><button type="button" aria-label="Back to invitations" onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-[#f2f0e6]"><ArrowLeft className="h-5 w-5" /></button><div><h1 className="font-serif text-xl font-bold">Add team member</h1><p className="text-xs text-zinc-500">Choose someone from your contacts</p></div></div></header><main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 pb-6 pt-4 sm:px-6"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Type to search and add" className="w-full rounded-xl border border-[#e6e2d6] bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm outline-none focus:border-emerald-500" /></div>{notice && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">{notice}</p>}{loading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading contacts…</div> : contacts.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">No contacts loaded yet. Allow contact access and try again.</div> : <div className="mt-5"><ContactGroup title="Mathan ERP users" contacts={appContacts} statuses={statuses} onAdd={addContact} onInvite={sendLink} empty="No Mathan ERP users found." /><ContactGroup title="Choose from contacts" contacts={inviteContacts} statuses={statuses} onAdd={addContact} onInvite={sendLink} empty="No other contacts found." /></div>}<button type="button" onClick={() => setOpen(false)} className="mt-5 w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white">Done</button></main></div>}
  </>;
}

function ContactGroup({ title, contacts, statuses, onAdd, onInvite, empty }: { title: string; contacts: ContactEntry[]; statuses: Record<string, ContactStatus>; onAdd: (contact: ContactEntry) => void; onInvite: (channel: 'sms' | 'whatsapp', number: string, name: string) => void; empty: string }) {
  return <section className="mb-5"><h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-zinc-500">{title} <span className="font-normal">({contacts.length})</span></h2>{contacts.length === 0 ? <p className="rounded-xl bg-white p-4 text-sm text-zinc-400">{empty}</p> : <div className="overflow-hidden rounded-2xl border border-[#e6e2d6] bg-white shadow-sm">{contacts.map((contact) => { const status = statuses[contact.number]; return <div key={contact.id} className="flex items-center gap-3 border-b border-[#f0eee7] px-3 py-3 last:border-b-0"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">{initials(contact.name)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{contact.name}</p><p className="truncate text-xs text-zinc-500">{contact.number}</p></div>{status === 'app' && <button type="button" onClick={() => onAdd(contact)} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white"><UserPlus className="h-3.5 w-3.5" /> Invite</button>}{(status === 'added' || status === 'invited') && <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><Check className="h-4 w-4" /> {status === 'invited' ? 'Invited' : 'Added'}</span>}{status === 'checking' && <span className="text-xs text-zinc-500">Checking…</span>}{status === 'invite' && <div className="flex gap-1.5"><button type="button" onClick={() => onInvite('sms', contact.number, contact.name)} className="rounded-lg border border-indigo-200 px-2.5 py-2 text-xs font-bold text-indigo-700">SMS</button><button type="button" onClick={() => onInvite('whatsapp', contact.number, contact.name)} className="rounded-lg bg-[#25D366] px-2.5 py-2 text-xs font-bold text-white"><MessageCircle className="mr-1 inline h-3.5 w-3.5" /> Invite</button></div>}</div>; })}</div>}</section>;
}
