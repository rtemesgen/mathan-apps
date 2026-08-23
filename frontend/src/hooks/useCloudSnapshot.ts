import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { useAuth, type AppId } from '../auth/AuthProvider';
import { readOffline, writeOffline } from '../lib/localStore';
import { supabase } from '../lib/supabase';
import { enqueueMutation } from '../lib/syncQueue';
import { syncQueue } from '../lib/offlineSync';

export { syncQueue } from '../lib/offlineSync';

export function useCloudSnapshot<T>(domain: 'cash_book' | 'payroll', key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>, boolean] {
  const { workspace, user, isGuest, canEditApp } = useAuth();
  const appId: AppId = domain === 'cash_book' ? 'book' : 'payroll';
  const standalone = import.meta.env.VITE_STANDALONE === 'true' || isGuest;
  const [value, setValue] = useState<T>(initialValue);
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);
  const revision = useRef(0);
  const initialValueRef = useRef(initialValue);
  const storageKey = `${standalone ? 'standalone' : user?.id ?? 'anonymous'}:${workspace?.id ?? 'none'}:${domain}:${key}`;
  useEffect(() => {
    let active = true; hydrated.current = false; setReady(false);
    void (async () => {
      const local = await readOffline<T>(storageKey);
      if (active) setValue(local !== null ? local : initialValueRef.current);
      revision.current = (await readOffline<number>(`${storageKey}:revision`)) ?? 0;
      if (workspace && !standalone && navigator.onLine) {
        await syncQueue(workspace.id);
        const { data } = await supabase.from('app_state_snapshots').select('payload, revision').eq('workspace_id', workspace.id).eq('domain', `${domain}:${key}`).maybeSingle();
        const remote = data as unknown as { payload?: T; revision?: number } | null;
        revision.current = remote?.revision ?? 0;
        if (remote?.revision !== undefined) await writeOffline(`${storageKey}:revision`, remote.revision);
        if (active && remote?.payload !== undefined) { setValue(remote.payload); await writeOffline(storageKey, remote.payload); }
      }
      if (active) { hydrated.current = true; setReady(true); }
    })();
    return () => { active = false; };
  }, [workspace?.id, storageKey, domain, key]);
  useEffect(() => {
    if (!hydrated.current || (!workspace && !standalone)) return;
    if (!standalone && !canEditApp(appId)) return;
    if (standalone) {
      void writeOffline(storageKey, value);
      return;
    }
    const payload = { workspace_id: workspace.id, domain: `${domain}:${key}`, payload: value, expected_revision: revision.current };
    void writeOffline(storageKey, value);
    void (async () => {
      if (navigator.onLine) {
        const { data, error } = await supabase.rpc('write_app_state_snapshot', {
          target_workspace: workspace.id, target_domain: payload.domain, expected_revision: payload.expected_revision,
          target_payload: payload.payload, audit_action: 'snapshot_written', affected_client_ids: [],
        });
        const result = (data as Array<{ status: string; revision: number; payload: T }> | null)?.[0];
        if (!error && result?.status === 'written') { revision.current = result.revision; await writeOffline(`${storageKey}:revision`, result.revision); window.dispatchEvent(new CustomEvent('mathan:sync-status', { detail: { status: 'synced' } })); return; }
        if (result?.status === 'conflict') {
          window.dispatchEvent(new CustomEvent('mathan:sync-conflict', { detail: { domain: payload.domain, remote: result.payload, revision: result.revision } }));
          window.dispatchEvent(new CustomEvent('mathan:sync-status', { detail: { status: 'conflict' } }));
          return;
        }
      }
      window.dispatchEvent(new CustomEvent('mathan:sync-status', { detail: { status: navigator.onLine ? 'retry' : 'offline' } }));
      await enqueueMutation({ table: 'app_state_snapshots', operation: 'upsert', payload });
    })();
  }, [value, workspace?.id, domain, key, storageKey, appId, standalone, canEditApp]);
  useEffect(() => { const resync = () => { if (workspace) void syncQueue(workspace.id); }; window.addEventListener('online', resync); return () => window.removeEventListener('online', resync); }, [workspace?.id]);
  const guardedSetValue: Dispatch<SetStateAction<T>> = (next) => {
    if (!standalone && !canEditApp(appId)) return;
    setValue(next);
  };
  return [value, guardedSetValue, ready];
}
