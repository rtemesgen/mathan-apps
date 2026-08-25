import { Bell, CheckCircle2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { requestNotificationPermission, sendNativeNotification, type AppNotification } from '../lib/notifications';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

type Invitation = { invitation_id: string; workspace_name: string; invited_by_name: string };
type DurableNotification = { id: string; title: string; body: string; route?: string | null; read_at?: string | null; created_at: string };

export function AppNotificationCenter() {
  const location = useLocation();
  const { user, isGuest } = useAuth();
  const [notification, setNotification] = useState<AppNotification | null>(null);
  const [permissionMessage, setPermissionMessage] = useState('');
  const [durable, setDurable] = useState<DurableNotification[]>([]);
  const [inboxOpen, setInboxOpen] = useState(false);
  const inboxRef = useRef<HTMLDivElement>(null);
  const knownNotificationIds = useRef<Set<string> | null>(null);
  const loadDurable = async () => { if (!user) { setDurable([]); knownNotificationIds.current = null; window.dispatchEvent(new CustomEvent('mathan:notification-count', { detail: { unread: 0 } })); return; } const { data } = await supabase.rpc('list_my_notifications', { target_limit: 50 }); const next = (data as DurableNotification[] | null) ?? []; if (knownNotificationIds.current) next.filter((item) => !knownNotificationIds.current?.has(item.id) && !item.read_at).forEach((item) => window.dispatchEvent(new CustomEvent('mathan:notification', { detail: { title: item.title, body: item.body, url: item.route ?? undefined } }))); knownNotificationIds.current = new Set(next.map((item) => item.id)); setDurable(next); window.dispatchEvent(new CustomEvent('mathan:notification-count', { detail: { unread: next.filter((item) => !item.read_at).length } })); };
  useEffect(() => {
    let timer: number | undefined;
    const handle = (event: Event) => { const next = (event as CustomEvent<AppNotification>).detail; setNotification(next); if (timer) window.clearTimeout(timer); timer = window.setTimeout(() => setNotification(null), 6500); void sendNativeNotification(next); };
    window.addEventListener('mathan:notification', handle);
    const toggleInbox = () => setInboxOpen((current) => !current);
    window.addEventListener('mathan:toggle-notifications', toggleInbox);
    return () => { window.removeEventListener('mathan:notification', handle); window.removeEventListener('mathan:toggle-notifications', toggleInbox); if (timer) window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadDurable();
    let known = new Set<string>();
    let firstLoad = true;
    const checkInvitations = async () => {
      const { data, error } = await supabase.rpc('list_my_workspace_invitations');
      if (error) return;
      const next = (data as Invitation[] | null) ?? [];
      if (!firstLoad) next.filter((item) => !known.has(item.invitation_id)).forEach((item) => { const event = { title: 'New company invitation', body: `${item.invited_by_name} invited you to join ${item.workspace_name}.` }; window.dispatchEvent(new CustomEvent('mathan:notification', { detail: event })); });
      known = new Set(next.map((item) => item.invitation_id));
      window.dispatchEvent(new Event('mathan:invitations-changed'));
      firstLoad = false;
    };
    void checkInvitations();
    const timer = window.setInterval(() => { void checkInvitations(); void loadDurable(); }, 60000);
    return () => window.clearInterval(timer);
  }, [user?.id]);
  useEffect(() => { if (isGuest || !Capacitor.isNativePlatform()) return; void requestNotificationPermission().then((permission) => { if (permission !== 'granted') setPermissionMessage('Notifications are off. Enable them in Android Settings to receive invite and update alerts.'); }).catch(() => setPermissionMessage('Notifications could not be enabled. You can allow them later in Android Settings.')); }, [isGuest]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    const listener = LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      if (!active) return;
      const extra = event.notification.extra as { url?: string } | undefined;
      if (extra?.url) window.location.assign(extra.url);
    });
    return () => { active = false; void listener.then((handle) => handle.remove()); };
  }, []);
  const unread = durable.filter((item) => !item.read_at).length;
  const markRead = async (item: DurableNotification) => { await supabase.rpc('mark_notification_read', { target_id: item.id }); setDurable((current) => { const next = current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry); window.dispatchEvent(new CustomEvent('mathan:notification-count', { detail: { unread: next.filter((entry) => !entry.read_at).length } })); return next; }); };
  const markAllRead = async () => { await supabase.rpc('mark_all_notifications_read'); setDurable((current) => { const next = current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })); window.dispatchEvent(new CustomEvent('mathan:notification-count', { detail: { unread: 0 } })); return next; }); };
  useEffect(() => { if (!inboxOpen) return; const closeOutside = (event: MouseEvent) => { if (inboxRef.current && !inboxRef.current.contains(event.target as Node)) setInboxOpen(false); }; document.addEventListener('mousedown', closeOutside); return () => document.removeEventListener('mousedown', closeOutside); }, [inboxOpen]);
  if (!notification && !permissionMessage && !user) return null;
  return <>
    {user && location.pathname === '/' && <div ref={inboxRef} className="fixed right-4 top-14 z-[210]"><button type="button" aria-label="Notifications" onClick={() => setInboxOpen((current) => !current)} className="hidden"><Bell className="h-3.5 w-3.5" /></button>{inboxOpen && <section className="w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#e6e2d6] bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-[#eeeae0] p-3"><p className="text-sm font-extrabold">Notifications</p><button type="button" onClick={() => void markAllRead()} className="text-[10px] font-bold text-emerald-800">Mark all read</button></div><div className="max-h-80 overflow-y-auto">{durable.length ? durable.map((item) => <button type="button" key={item.id} onClick={() => { void markRead(item); if (item.route) window.location.assign(item.route); }} className={`block w-full border-b border-[#f0eee7] p-3 text-left hover:bg-[#faf9f5] ${item.read_at ? '' : 'bg-emerald-50/50'}`}><p className="text-xs font-bold">{item.title}</p><p className="mt-1 text-[11px] leading-4 text-zinc-600">{item.body}</p><p className="mt-1 text-[10px] text-zinc-400">{new Date(item.created_at).toLocaleString()}</p></button>) : <p className="p-4 text-xs text-zinc-500">No notifications yet.</p>}</div></section>}</div>}
    {permissionMessage && <div className="native-safe-top fixed left-1/2 top-3 z-[230] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900 shadow-xl"><Bell className="mt-0.5 h-4 w-4 shrink-0" /><span className="flex-1">{permissionMessage}</span><button type="button" aria-label="Dismiss notification permission message" onClick={() => setPermissionMessage('')}><X className="h-4 w-4" /></button></div>}
    {notification && <div className="native-safe-bottom fixed bottom-5 left-1/2 z-[220] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-start gap-3 rounded-2xl border border-emerald-200 bg-white p-4 text-zinc-900 shadow-2xl"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-extrabold">{notification.title}</p><p className="mt-0.5 text-xs leading-5 text-zinc-600">{notification.body}</p></div><button type="button" aria-label="Dismiss notification" onClick={() => setNotification(null)}><X className="h-4 w-4 text-zinc-400" /></button></div>}
  </>;
}
