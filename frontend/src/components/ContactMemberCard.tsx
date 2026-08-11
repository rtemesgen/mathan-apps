import { useState } from 'react';
import { Contact, MessageCircle, Phone, Share2, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

type ContactEntry = { name?: string[]; tel?: string[] };
type ContactStatus = 'checking' | 'app' | 'added' | 'invite';
const appLink = () => (import.meta.env.VITE_APP_SHARE_URL as string | undefined)?.trim() || window.location.origin;

export function ContactMemberCard() {
  const { workspace } = useAuth();
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ContactStatus>>({});
  const [phone, setPhone] = useState('');
  const [notice, setNotice] = useState('');

  const normalize = (value: string) => value.replace(/[^0-9]/g, '');
  const chooseContacts = async () => {
    const api = (navigator as Navigator & { contacts?: { select: (properties: string[], options: { multiple: boolean }) => Promise<ContactEntry[]> } }).contacts;
    if (!api) { setNotice('Contact selection is not available here. Enter a phone number below.'); return; }
    try {
      const selected = await api.select(['name', 'tel'], { multiple: true });
      setContacts(selected);
      const phones = selected.map((contact) => contact.tel?.[0] ?? '').filter(Boolean);
      if (!workspace || phones.length === 0) { setStatuses(Object.fromEntries(phones.map((value) => [normalize(value), 'invite']))); return; }
      setStatuses(Object.fromEntries(phones.map((value) => [normalize(value), 'checking'])));
      const { data, error } = await supabase.rpc('lookup_workspace_contacts', { target_workspace: workspace.id, target_phones: phones });
      if (error) { setNotice('Could not check app users. You can still send an invite link.'); setStatuses(Object.fromEntries(phones.map((value) => [normalize(value), 'invite']))); return; }
      const appUsers = new Set(((data as Array<{ phone: string }> | null) ?? []).map((item) => normalize(item.phone)));
      setStatuses(Object.fromEntries(phones.map((value) => [normalize(value), appUsers.has(normalize(value)) ? 'app' : 'invite'])));
    } catch { setNotice('Contact selection cancelled.'); }
  };

  const sendLink = (channel: 'sms' | 'whatsapp', number: string, name?: string) => {
    const cleaned = number.replace(/[^0-9+]/g, '');
    if (!cleaned) return;
    const text = encodeURIComponent(`Join me on Mathan ERP. Download or open the app here: ${appLink()}`);
    window.open(channel === 'whatsapp' ? `https://wa.me/${cleaned.replace(/^\+/, '')}?text=${text}` : `sms:${cleaned}?body=${text}`, '_blank', 'noopener,noreferrer');
    setNotice(`Invite link ready for ${name || cleaned}.`);
  };

  const addContact = async (number: string, name?: string) => {
    if (!workspace) return;
    const key = normalize(number);
    setStatuses((current) => ({ ...current, [key]: 'checking' }));
    const { data, error } = await supabase.rpc('add_workspace_member_by_phone', { target_workspace: workspace.id, target_phone: number, target_book_permission: 'edit' });
    if (error || !data) { setStatuses((current) => ({ ...current, [key]: 'invite' })); setNotice(error?.message || 'This contact is not registered yet. Send an invite link.'); return; }
    setStatuses((current) => ({ ...current, [key]: 'added' }));
    setNotice(`${name || number} was added to your company.`);
  };

  const manualStatus = statuses[normalize(phone)];
  return <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="font-serif text-xl font-bold text-emerald-950">Add member from contacts</h2><p className="mt-1 text-xs leading-5 text-emerald-800">People with Mathan ERP show Add. Everyone else gets an SMS or WhatsApp invite link.</p></div><Contact className="h-5 w-5 shrink-0 text-emerald-700" /></div><button type="button" onClick={() => void chooseContacts()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white"><Contact className="h-3.5 w-3.5" /> Choose from contacts</button><div className="mt-3 flex gap-2"><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone number" className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs" /><button type="button" disabled={!phone.trim() || manualStatus === 'checking'} onClick={() => manualStatus === 'app' ? void addContact(phone) : sendLink('whatsapp', phone)} className="rounded-lg bg-[#25D366] px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{manualStatus === 'app' ? 'Add' : 'WhatsApp'}</button><button type="button" disabled={!phone.trim() || manualStatus === 'checking'} onClick={() => manualStatus === 'app' ? void addContact(phone) : sendLink('sms', phone)} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-800 disabled:opacity-40">{manualStatus === 'app' ? 'Add' : 'SMS'}</button></div>{contacts.length > 0 && <div className="mt-4 space-y-2"><p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">Choose from contacts</p>{contacts.map((contact, index) => { const number = contact.tel?.[0] ?? ''; const status = statuses[normalize(number)] ?? 'invite'; return <div key={`${number}-${index}`} className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white p-2"><Phone className="h-4 w-4 text-emerald-700" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-zinc-900">{contact.name?.[0] || number || 'Unnamed contact'}</p><p className="truncate text-[10px] text-zinc-500">{number || 'No phone number'}</p></div>{status === 'app' && <button type="button" onClick={() => void addContact(number, contact.name?.[0])} className="rounded-md bg-[#121212] px-2 py-1 text-[10px] font-bold text-white"><UserPlus className="mr-1 inline h-3 w-3" /> Add</button>}{status === 'added' && <span className="text-[10px] font-bold text-emerald-700">Added</span>}{status === 'checking' && <span className="text-[10px] text-zinc-500">Checking…</span>}{status === 'invite' && <div className="flex gap-1"><button type="button" disabled={!number} onClick={() => sendLink('sms', number, contact.name?.[0])} className="rounded-md border border-emerald-200 px-2 py-1 text-[10px] font-bold text-emerald-800 disabled:opacity-40"><MessageCircle className="mr-1 inline h-3 w-3" /> SMS</button><button type="button" disabled={!number} onClick={() => sendLink('whatsapp', number, contact.name?.[0])} className="rounded-md bg-[#25D366] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40">Invite</button></div>}</div>; })}</div>}{notice && <p className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-emerald-800"><Share2 className="h-3.5 w-3.5" /> {notice}</p>}</section>;
}
