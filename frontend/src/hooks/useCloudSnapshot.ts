import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { useAuth, type AppId } from '../auth/AuthProvider';
import { readOffline, writeOffline } from '../lib/localStore';
import { supabase } from '../lib/supabase';
import { enqueueMutation, getQueuedMutations, replaceQueue } from '../lib/syncQueue';

async function syncQueue(workspaceId: string) {
  if (!navigator.onLine) { window.dispatchEvent(new CustomEvent('mathan:sync-status', { detail: { status: 'offline' } })); return; }
  window.dispatchEvent(new CustomEvent('mathan:sync-status', { detail: { status: 'syncing' } }));
  const queue = await getQueuedMutations();
  const remaining = [];
  for (const mutation of queue) {
    if (mutation.table !== 'app_state_snapshots' || mutation.payload.workspace_id !== workspaceId) { remaining.push(mutation); continue; }
    const { data, error } = await supabase.rpc('write_app_state_snapshot', {
      target_workspace: workspaceId,
      target_domain: mutation.payload.domain,
      expected_revision: mutation.payload.expected_revision ?? 0,
      target_payload: mutation.payload.payload,
      audit_action: mutation.payload.audit_action ?? 'snapshot_written_offline',
      affected_client_ids: mutation.payload.affected_client_ids ?? [],
    });
    const result = (data as Array<{ status: string; revision: number; payload: unknown }> | null)?.[0];
    if (error || !result || result.status === 'conflict') {
      if (result?.status === 'conflict') {
        window.dispatchEvent(new CustomEvent('mathan:sync-conflict', { detail: { domain: mutation.payload.domain, remote: result.payload, revision: result.revision } }));
        window.dispatchEvent(new CustomEvent('mathan:sync-status', { detail: { status: 'conflict' } }));
      } else { remaining.push(mutation); window.dispatchEvent(new CustomEvent('mathan:sync-status', { detail: { status: 'retry', queued: remaining.length } })); }
    }
  }
  await replaceQueue(remaining);
  if (!remaining.length) window.dispatchEvent(new CustomEvent('mathan:sync-status', { detail: { status: 'synced' } }));
}

export function useCloudSnapshot<T>(domain: 'cash_book' | 'payroll', key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>, boolean] {
  const { workspace, isGuest, canEditApp } = useAuth();
  const appId: AppId = domain === 'cash_book' ? 'book' : 'payroll';
  const standalone = import.meta.env.VITE_STANDALONE === 'true' || isGuest;
  const [value, setValue] = useState<T>(initialValue);
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);
  const revision = useRef(0);
  const storageKey = `${standalone ? 'standalone' : workspace?.id ?? 'anonymous'}:${domain}:${key}`;
  useEffect(() => {
    let active = true; hydrated.current = false; setReady(false);
    void (async () => {
      const local = await readOffline<T>(storageKey);
      if (active && local !== null) setValue(local);
      if (workspace && !standalone && navigator.onLine) {
        const { data } = await supabase.from('app_state_snapshots').select('payload, revision').eq('workspace_id', workspace.id).eq('domain', `${domain}:${key}`).maybeSingle();
        const remote = data as unknown as { payload?: T; revision?: number } | null;
        revision.current = remote?.revision ?? 0;
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
    const payload = { workspace_id: workspace.id, domain: `${domain}:${key}`, payload: value, expected_revision: revision.current };
    void writeOffline(storageKey, value);
    void (async () => {
      if (navigator.onLine) {
        const { data, error } = await supabase.rpc('write_app_state_snapshot', {
          target_workspace: workspace.id, target_domain: payload.domain, expected_revision: payload.expected_revision,
          target_payload: payload.payload, audit_action: 'snapshot_written', affected_client_ids: [],
        });
        const result = (data as Array<{ status: string; revision: number; payload: T }> | null)?.[0];
        if (!error && result?.status === 'written') { revision.current = result.revision; window.dispatchEvent(new CustomEvent('mathan:sync-status', { detail: { status: 'synced' } })); return; }
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
