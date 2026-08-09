import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { useAuth, type AppId } from '../auth/AuthProvider';
import { readOffline, writeOffline } from '../lib/localStore';
import { supabase } from '../lib/supabase';
import { enqueueMutation, getQueuedMutations, replaceQueue } from '../lib/syncQueue';

async function syncQueue(workspaceId: string) {
  if (!navigator.onLine) return;
  const queue = await getQueuedMutations();
  const remaining = [];
  for (const mutation of queue) {
    if (mutation.table !== 'app_state_snapshots' || mutation.payload.workspace_id !== workspaceId) { remaining.push(mutation); continue; }
    const { error } = await supabase.from('app_state_snapshots').upsert(mutation.payload);
    if (error) remaining.push(mutation);
  }
  await replaceQueue(remaining);
}

export function useCloudSnapshot<T>(domain: 'cash_book' | 'payroll', key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>, boolean] {
  const { workspace, isGuest, canEditApp } = useAuth();
  const appId: AppId = domain === 'cash_book' ? 'book' : 'payroll';
  const standalone = import.meta.env.VITE_STANDALONE === 'true' || isGuest;
  const [value, setValue] = useState<T>(initialValue);
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);
  const storageKey = `${standalone ? 'standalone' : workspace?.id ?? 'anonymous'}:${domain}:${key}`;
  useEffect(() => {
    let active = true; hydrated.current = false; setReady(false);
    void (async () => {
      const local = await readOffline<T>(storageKey);
      if (active && local !== null) setValue(local);
      if (workspace && !standalone && navigator.onLine) {
        const { data } = await supabase.from('app_state_snapshots').select('payload').eq('workspace_id', workspace.id).eq('domain', `${domain}:${key}`).maybeSingle();
        const remote = data as unknown as { payload?: T } | null;
        if (active && remote?.payload !== undefined) { setValue(remote.payload); await writeOffline(storageKey, remote.payload); }
        await syncQueue(workspace.id);
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
    const payload = { workspace_id: workspace.id, domain: `${domain}:${key}`, payload: value };
    void writeOffline(storageKey, value);
    void (async () => {
      if (navigator.onLine) { const { error } = await supabase.from('app_state_snapshots').upsert(payload); if (!error) return; }
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
