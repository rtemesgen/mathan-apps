import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { useAuth, type AppId } from '../auth/AuthProvider';
import { readOffline, writeOffline } from '../lib/localStore';
import { supabase } from '../lib/supabase';
import { enqueueMutation, getQueuedMutations } from '../lib/syncQueue';
import { syncQueue } from '../lib/offlineSync';
import { reportPersistenceNotice, type PersistenceState } from '../lib/repositories/types';

export { syncQueue } from '../lib/offlineSync';

export type SnapshotPersistenceStatus = 'idle' | PersistenceState;

export function useCloudSnapshot<T>(domain: 'cash_book' | 'payroll', key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>, boolean, SnapshotPersistenceStatus] {
  const { workspace, user, isGuest, canEditApp } = useAuth();
  const appId: AppId = domain === 'cash_book' ? 'book' : 'payroll';
  const standalone = import.meta.env.VITE_STANDALONE === 'true' || isGuest;
  const [value, setValue] = useState<T>(initialValue);
  const [ready, setReady] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState<SnapshotPersistenceStatus>('idle');
  const hydrated = useRef(false);
  const lastHydratedValue = useRef<string | null>(null);
  const revision = useRef(0);
  const initialValueRef = useRef(initialValue);
  const storageKey = `${standalone ? 'standalone' : user?.id ?? 'anonymous'}:${workspace?.id ?? 'none'}:${domain}:${key}`;
  useEffect(() => {
    let active = true; hydrated.current = false; setReady(false);
    void (async () => {
      const local = await readOffline<T>(storageKey);
      const localValue = local !== null ? local : initialValueRef.current;
      lastHydratedValue.current = JSON.stringify(localValue);
      if (active) setValue(localValue);
      revision.current = (await readOffline<number>(`${storageKey}:revision`)) ?? 0;
      if (active) { hydrated.current = true; setReady(true); }
      if (workspace && !standalone && navigator.onLine) {
        void (async () => {
          await syncQueue(workspace.id);
          const { data } = await supabase.from('app_state_snapshots').select('payload, revision').eq('workspace_id', workspace.id).eq('domain', `${domain}:${key}`).maybeSingle();
          const remote = data as unknown as { payload?: T; revision?: number } | null;
          const queued = await getQueuedMutations();
          const relevantMutations = queued.filter((mutation) => mutation.companyId === workspace.id && mutation.table === 'app_state_snapshots' && mutation.entityId === `${domain}:${key}`);
          const hasPendingLocalEdit = relevantMutations.length > 0;
          if (relevantMutations.some((mutation) => mutation.syncStatus === 'conflicted' || mutation.syncStatus === 'error')) reportPersistenceNotice({ app: domain, state: 'sync conflict' });
          else if (hasPendingLocalEdit) reportPersistenceNotice({ app: domain, state: 'sync pending' });
          if (!hasPendingLocalEdit && remote?.revision !== undefined && remote.revision > revision.current) {
            revision.current = remote.revision;
            await writeOffline(`${storageKey}:revision`, remote.revision);
            if (active && remote.payload !== undefined) {
              lastHydratedValue.current = JSON.stringify(remote.payload);
              setValue(remote.payload);
              await writeOffline(storageKey, remote.payload);
            }
          }
        })().catch(() => undefined);
      }
    })();
    return () => { active = false; };
  }, [workspace?.id, storageKey, domain, key]);
  useEffect(() => {
    if (!hydrated.current || (!workspace && !standalone)) return;
    if (!standalone && !canEditApp(appId)) return;
    if (lastHydratedValue.current === JSON.stringify(value)) return;
    lastHydratedValue.current = JSON.stringify(value);
    void (async () => {
      setPersistenceStatus('saving');
      reportPersistenceNotice({ app: domain, state: 'saving' });
      try {
        await writeOffline(storageKey, value);
        if (standalone) {
          setPersistenceStatus('offline saved');
          reportPersistenceNotice({ app: domain, state: 'offline saved' });
          return;
        }
        const payload = { workspace_id: workspace.id, domain: `${domain}:${key}`, payload: value, expected_revision: revision.current };
        const mutationId = crypto.randomUUID();
        await enqueueMutation({ mutationId, userId: user?.id ?? 'unknown', companyId: workspace.id, entityType: 'app_state_snapshot', entityId: payload.domain, baseRevision: revision.current, table: 'app_state_snapshots', operation: 'upsert', payload: { ...payload, mutation_id: mutationId } });
        const persistence = navigator.onLine ? 'saved locally' : 'offline saved';
        setPersistenceStatus(persistence);
        reportPersistenceNotice({ app: domain, state: persistence });
        window.dispatchEvent(new CustomEvent('mathan:sync-status', { detail: { status: navigator.onLine ? 'syncing' : 'offline' } }));
        if (navigator.onLine) void syncQueue(workspace.id).catch(() => undefined);
      } catch {
        setPersistenceStatus('storage error');
        reportPersistenceNotice({ app: domain, state: 'storage error' });
        window.dispatchEvent(new CustomEvent('mathan:sync-status', { detail: { status: 'error' } }));
      }
    })();
  }, [value, workspace?.id, domain, key, storageKey, appId, standalone, canEditApp]);
  useEffect(() => { const resync = () => { if (workspace) void syncQueue(workspace.id); }; window.addEventListener('online', resync); return () => window.removeEventListener('online', resync); }, [workspace?.id]);
  const guardedSetValue: Dispatch<SetStateAction<T>> = (next) => {
    if (!standalone && !canEditApp(appId)) return;
    setValue(next);
  };
  return [value, guardedSetValue, ready, persistenceStatus];
}
