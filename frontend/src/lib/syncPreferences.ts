const KEY_PREFIX = 'mathan_sync_notifications_enabled:';
const storageKey = (userId?: string) => `${KEY_PREFIX}${userId ?? 'anonymous'}`;

export function syncNotificationsEnabled(userId?: string) {
  try {
    return localStorage.getItem(storageKey(userId)) !== 'false';
  } catch {
    return true;
  }
}

export function setSyncNotificationsEnabled(enabled: boolean, userId?: string) {
  try { localStorage.setItem(storageKey(userId), String(enabled)); } catch { /* storage may be unavailable */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('mathan:sync-preferences', { detail: { enabled, userId } }));
}
