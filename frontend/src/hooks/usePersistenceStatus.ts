import { useEffect, useState } from 'react';
import type { PersistenceNotice, PersistenceState } from '../lib/repositories/types';

const labels: Record<PersistenceState, string> = {
  saving: 'Saving locally…',
  'saved locally': 'Saved on this device · Syncing…',
  'offline saved': 'Saved offline · Will sync when online',
  'sync pending': 'Saved on this device · Sync pending',
  'storage error': 'Could not save locally · Your entries were kept',
  'sync conflict': 'Sync conflict · Local data retained',
};

export function usePersistenceStatus(app: PersistenceNotice['app']) {
  const [notice, setNotice] = useState<PersistenceNotice | null>(null);
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<PersistenceNotice>).detail;
      if (detail?.app === app) setNotice(detail);
    };
    window.addEventListener('mathan:persistence-status', handler);
    return () => window.removeEventListener('mathan:persistence-status', handler);
  }, [app]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  return notice ? { ...notice, label: notice.message ?? labels[notice.state] } : null;
}
