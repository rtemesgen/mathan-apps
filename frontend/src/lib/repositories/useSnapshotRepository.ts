import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth, type AppId } from '../../auth/AuthProvider';
import { syncQueue } from '../offlineSync';
import { hydrateSnapshot, persistSnapshot, readSnapshot, type SnapshotRepositoryContext } from './snapshotRepository';
import { reportPersistenceNotice, type PersistenceState } from './types';
import { emitSyncStatus } from '../toast';

export type SnapshotPersistenceStatus = 'idle' | PersistenceState;

/** React adapter for the shared snapshot repository. Domain stores consume this adapter; they do not own storage or sync policy. */
export function useSnapshotRepository<T>(domain: 'cash_book' | 'payroll', key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>, boolean, SnapshotPersistenceStatus, (next: SetStateAction<T>) => Promise<PersistenceState>, (update: (current: T) => T) => Promise<PersistenceState>] {
  const { workspace, user, isGuest, canEditApp } = useAuth();
  const appId: AppId = domain === 'cash_book' ? 'book' : 'payroll';
  const standalone = import.meta.env.VITE_STANDALONE === 'true' || isGuest;
  const [value, setValue] = useState<T>(initialValue);
  const [ready, setReady] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState<SnapshotPersistenceStatus>('idle');
  const hydrated = useRef(false);
  const localMutationStarted = useRef(false);
  const hydrationWaiter = useRef<{ promise: Promise<void>; resolve: () => void }>({ promise: Promise.resolve(), resolve: () => undefined });
  const lastHydratedValue = useRef<string | null>(null);
  const revision = useRef(0);
  const valueRef = useRef(initialValue);
  const initialValueRef = useRef(initialValue);
  const storageKey = `${standalone ? 'standalone' : user?.id ?? 'anonymous'}:${workspace?.id ?? 'none'}:${domain}:${key}`;

  useEffect(() => {
    let active = true;
    hydrated.current = false;
    localMutationStarted.current = false;
    let resolveHydration!: () => void;
    hydrationWaiter.current = { promise: new Promise<void>((resolve) => { resolveHydration = resolve; }), resolve: () => resolveHydration() };
    setReady(false);
    void (async () => {
      const local = await readSnapshot(storageKey, initialValueRef.current);
      const localValue = local.value;
      valueRef.current = localValue;
      lastHydratedValue.current = JSON.stringify(localValue);
      if (active) setValue(localValue);
      revision.current = local.revision;
      if (active) { hydrated.current = true; setReady(true); resolveHydration(); }
      if (workspace && !standalone && navigator.onLine) {
        void (async () => {
          const context: SnapshotRepositoryContext = { storageKey, workspaceId: workspace.id, userId: user?.id, standalone, domain, key };
          const hydratedRemote = await hydrateSnapshot<T>(context, revision.current);
          if (hydratedRemote.value !== undefined && active && !localMutationStarted.current) {
            revision.current = hydratedRemote.revision;
            valueRef.current = hydratedRemote.value;
            lastHydratedValue.current = JSON.stringify(hydratedRemote.value);
            setValue(hydratedRemote.value);
          }
        })().catch(() => undefined);
      }
    })();
    return () => { active = false; resolveHydration(); };
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
        const context: SnapshotRepositoryContext = { storageKey, workspaceId: workspace?.id, userId: user?.id, standalone, domain, key };
        const persistence = await persistSnapshot(context, value, revision.current);
        setPersistenceStatus(persistence);
      } catch {
        setPersistenceStatus('storage error');
        reportPersistenceNotice({ app: domain, state: 'storage error' });
        emitSyncStatus('error');
      }
    })();
  }, [value, workspace?.id, domain, key, storageKey, appId, standalone, canEditApp]);

  const persistValue = useCallback(async (next: SetStateAction<T>) => {
    await hydrationWaiter.current.promise;
    localMutationStarted.current = true;
    if (!standalone && !workspace) throw new Error('A workspace is required to save this record.');
    if (!standalone && !canEditApp(appId)) throw new Error('You do not have permission to edit this app.');
    const nextValue = typeof next === 'function' ? (next as (current: T) => T)(valueRef.current) : next;
    const previousValue = valueRef.current;
    valueRef.current = nextValue;
    setPersistenceStatus('saving');
    reportPersistenceNotice({ app: domain, state: 'saving' });
    try {
      const context: SnapshotRepositoryContext = { storageKey, workspaceId: workspace?.id, userId: user?.id, standalone, domain, key };
      const persistence = await persistSnapshot(context, nextValue, revision.current);
      lastHydratedValue.current = JSON.stringify(nextValue);
      setValue(nextValue);
      setPersistenceStatus(persistence);
      return persistence;
    } catch (error) {
      if (valueRef.current === nextValue) {
        valueRef.current = previousValue;
        lastHydratedValue.current = JSON.stringify(previousValue);
      }
      setPersistenceStatus('storage error');
      reportPersistenceNotice({ app: domain, state: 'storage error' });
      throw error;
    }
  }, [appId, canEditApp, domain, key, standalone, storageKey, user?.id, workspace, workspace?.id]);

  useEffect(() => {
    const resync = () => { if (workspace) void syncQueue(workspace.id); };
    window.addEventListener('online', resync);
    return () => window.removeEventListener('online', resync);
  }, [workspace?.id]);

  const guardedSetValue: Dispatch<SetStateAction<T>> = (next) => {
    if (!standalone && !canEditApp(appId)) return;
    valueRef.current = typeof next === 'function' ? (next as (current: T) => T)(valueRef.current) : next;
    setValue(next);
  };
  return [value, guardedSetValue, ready, persistenceStatus, persistValue, (update) => persistValue(update)];
}
