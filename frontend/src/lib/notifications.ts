import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export type AppNotification = { title: string; body: string; url?: string };

export function emitAppNotification(notification: AppNotification) {
  window.dispatchEvent(new CustomEvent<AppNotification>('mathan:notification', { detail: notification }));
}

export async function requestNotificationPermission() {
  if (!Capacitor.isNativePlatform()) return 'granted' as const;
  const current = await LocalNotifications.checkPermissions();
  if (current.display === 'granted') return current.display;
  const requested = await LocalNotifications.requestPermissions();
  return requested.display;
}

export async function sendNativeNotification(notification: AppNotification) {
  if (!Capacitor.isNativePlatform()) return;
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') return;
  await LocalNotifications.schedule({ notifications: [{ id: Date.now() % 2147483647, title: notification.title, body: notification.body, extra: notification.url ? { url: notification.url } : undefined, schedule: { at: new Date(Date.now() + 250) } }] });
}
