import { Bell, CheckCircle2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { requestNotificationPermission, sendNativeNotification, type AppNotification } from '../lib/notifications';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

type Invitation = { invitation_id: string; workspace_name: string; invited_by_name: string };

export function AppNotificationCenter() {
  const { user } = useAuth();
  const [notification, setNotification] = useState<AppNotification | null>(null);
  const [permissionMessage, setPermissionMessage] = useState('');
  useEffect(() => {
    let timer: number | undefined;
    const handle = (event: Event) => { const next = (event as CustomEvent<AppNotification>).detail; setNotification(next); if (timer) window.clearTimeout(timer); timer = window.setTimeout(() => setNotification(null), 6500); void sendNativeNotification(next); };
    window.addEventListener('mathan:notification', handle);
    return () => { window.removeEventListener('mathan:notification', handle); if (timer) window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!user) return;
    let known = new Set<string>();
    let firstLoad = true;
    const checkInvitations = async () => {
      const { data, error } = await supabase.rpc('list_my_workspace_invitations');
      if (error) return;
      const next = (data as Invitation[] | null) ?? [];
      if (!firstLoad) next.filter((item) => !known.has(item.invitation_id)).forEach((item) => { const event = { title: 'New company invitation', body: `${item.invited_by_name} invited you to join ${item.workspace_name}.` }; window.dispatchEvent(new CustomEvent('mathan:notification', { detail: event })); });
      known = new Set(next.map((item) => item.invitation_id));
      firstLoad = false;
    };
    void checkInvitations();
    const timer = window.setInterval(() => void checkInvitations(), 60000);
    return () => window.clearInterval(timer);
  }, [user?.id]);
  useEffect(() => { if (!Capacitor.isNativePlatform()) return; void requestNotificationPermission().then((permission) => { if (permission !== 'granted') setPermissionMessage('Notifications are off. Enable them in Android Settings to receive invite and update alerts.'); }).catch(() => setPermissionMessage('Notifications could not be enabled. You can allow them later in Android Settings.')); }, []);
  if (!notification && !permissionMessage) return null;
  return <>
    {permissionMessage && <div className="native-safe-top fixed left-1/2 top-3 z-[230] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900 shadow-xl"><Bell className="mt-0.5 h-4 w-4 shrink-0" /><span className="flex-1">{permissionMessage}</span><button type="button" aria-label="Dismiss notification permission message" onClick={() => setPermissionMessage('')}><X className="h-4 w-4" /></button></div>}
    {notification && <div className="native-safe-bottom fixed bottom-5 left-1/2 z-[220] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-start gap-3 rounded-2xl border border-emerald-200 bg-white p-4 text-zinc-900 shadow-2xl"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-extrabold">{notification.title}</p><p className="mt-0.5 text-xs leading-5 text-zinc-600">{notification.body}</p></div><button type="button" aria-label="Dismiss notification" onClick={() => setNotification(null)}><X className="h-4 w-4 text-zinc-400" /></button></div>}
  </>;
}
