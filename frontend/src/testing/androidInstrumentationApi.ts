import { offlineStore } from '../lib/localStore';
import { enqueueMutationsAtomic, getQueuedMutations, replaceQueue } from '../lib/syncQueue';
import { getNativeDatabaseHealth, migrateLegacyRecords } from '../lib/sqliteStore';
import { supabase } from '../lib/supabase';
import { markBackendReachable, markBackendUnreachable } from '../lib/connectivity';
import { createTruckTransaction, refreshTruckDataFromCloud, synchronizeTruckData } from '../apps/truck/truckRepository';

type Entry = { id: string; amount: number; note: string };
const instrumentationEnv = import.meta.env as Record<string, string | undefined>;
const queueKey = 'sync-queue-v1';
const key = (workspace: string, domain: string) => `instrumentation:${workspace}:${domain}`;

/** Test-only API compiled into emulator builds by mobile:build:instrumentation.
 * Every persistence operation below goes through the same OfflineStore and
 * encrypted Capacitor SQLite connection used by the application. */
export function installAndroidInstrumentationApi() {
  const api = {
    async reset() {
      for (const recordKey of await offlineStore.listKeys()) await offlineStore.delete(recordKey);
      await offlineStore.flush();
    },
    async save(workspace: string, domain: string, entry: Entry) {
      const storageKey = key(workspace, domain);
      const current = (await offlineStore.read<Entry[]>(storageKey)) ?? [];
      await enqueueMutationsAtomic([{
        mutationId: entry.id, userId: 'instrumentation-user', companyId: workspace,
        entityType: domain, entityId: entry.id, table: 'app_state_snapshots', operation: 'upsert',
        payload: { workspace_id: workspace, domain, entry },
      }], [{ key: storageKey, value: [...current, entry] }]);
      return offlineStore.flush();
    },
    read: (workspace: string, domain: string) => offlineStore.read<Entry[]>(key(workspace, domain)),
    queue: () => getQueuedMutations(),
    health: () => getNativeDatabaseHealth(),
    async acknowledgeOnce(mutationId: string) {
      const queue = await getQueuedMutations();
      await replaceQueue(queue.filter((item) => item.mutationId !== mutationId), [mutationId]);
      return (await getQueuedMutations()).filter((item) => item.mutationId === mutationId).length;
    },
    async recoverQueue() {
      // Reading normalizes expired leases; persist the recovered representation.
      const recovered = await getQueuedMutations();
      await offlineStore.write(queueKey, recovered);
      return recovered;
    },
    async failWrite() {
      // Use the atomic business-write path here. The general single-record
      // store intentionally permits structured-clone-only values (the admin
      // backup CryptoKey is one example) in IndexedDB, while application
      // snapshots/outbox commits must be JSON-safe for SQLite.
      await offlineStore.writeAtomic([{ key: 'instrumentation:failed-write', value: { unsupported: BigInt(1) } }]);
    },
    async logout(workspace: string) {
      for (const recordKey of await offlineStore.listKeys()) {
        if (recordKey.includes(`:${workspace}:`)) await offlineStore.delete(recordKey);
      }
      const queue = (await getQueuedMutations()).filter((item) => item.companyId !== workspace);
      await offlineStore.write(queueKey, queue);
      await offlineStore.flush();
    },
    async exerciseInterruptedLegacyMigration() {
      const rows = new Map<string, unknown>();
      let marker = false;
      let interrupted = true;
      const store = {
        readMarker: async () => marker,
        writeEntries: async (records: Array<{ key: string; value: unknown }>) => {
          for (const row of records) rows.set(row.key, row.value);
          if (interrupted) { interrupted = false; throw new Error('simulated process death'); }
        },
        verifyEntries: async (records: Array<{ key: string; value: unknown }>) => {
          if (records.some((row) => !rows.has(row.key))) throw new Error('missing migrated row');
        },
        writeMarker: async () => { marker = true; },
      };
      try { await migrateLegacyRecords([{ key: 'released-v1', value: { retained: true } }], [], store); } catch { /* restart */ }
      await migrateLegacyRecords([{ key: 'released-v1', value: { retained: true } }], [], store);
      return { marker, value: rows.get('released-v1') };
    },
    async backendTruckRoundTrip() {
      const email = instrumentationEnv.VITE_ANDROID_E2E_EMAIL;
      const password = instrumentationEnv.VITE_ANDROID_E2E_PASSWORD;
      if (!email || !password) throw new Error('Android backend instrumentation credentials are not configured.');
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) throw sessionError ?? new Error('Android backend instrumentation session was not created.');
      const userId = sessionData.session.user.id;
      const { data: memberships, error: membershipError } = await supabase.from('workspace_members').select('workspace_id').eq('user_id', userId).limit(1);
      if (membershipError || !memberships?.[0]?.workspace_id) throw membershipError ?? new Error('No Android instrumentation workspace is available.');
      const workspaceId = String(memberships[0].workspace_id);
      const { data: trucks, error: truckError } = await supabase.from('trucks').select('id').eq('workspace_id', workspaceId).is('deleted_at', null).limit(1);
      if (truckError || !trucks?.[0]?.id) throw truckError ?? new Error('No Android instrumentation truck is available.');
      const transaction = await createTruckTransaction(workspaceId, {
        truckId: String(trucks[0].id), date: new Date().toISOString(), type: 'INCOME', category: 'Android instrumentation', amount: 1, description: `android-${crypto.randomUUID()}`,
      }, false, userId);
      const { data: serverRow, error: rowError } = await supabase.from('truck_transactions').select('id').eq('workspace_id', workspaceId).eq('id', transaction.id).maybeSingle();
      if (rowError) throw rowError;
      return { workspaceId, transactionId: transaction.id, serverCount: serverRow ? 1 : 0 };
    },
    async backendVerify(workspaceId: string, transactionId: string) {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) throw sessionError ?? new Error('Android backend instrumentation session is unavailable after restart.');
      const userId = sessionData.session.user.id;
      const { data: serverRow, error: rowError } = await supabase.from('truck_transactions').select('id').eq('workspace_id', workspaceId).eq('id', transactionId).maybeSingle();
      if (rowError) throw rowError;
      await refreshTruckDataFromCloud(workspaceId, userId);
      const cached = await offlineStore.read<{ transactions?: Array<{ id: string }> }>(`truck:${userId}:${workspaceId}`);
      return { serverCount: serverRow ? 1 : 0, localContains: Boolean(cached?.transactions?.some((row) => row.id === transactionId)) };
    },
    async backendOfflineTruckRoundTrip() {
      const email = instrumentationEnv.VITE_ANDROID_E2E_EMAIL;
      const password = instrumentationEnv.VITE_ANDROID_E2E_PASSWORD;
      if (!email || !password) throw new Error('Android backend instrumentation credentials are not configured.');
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) throw sessionError ?? new Error('Android backend instrumentation session was not created.');
      const userId = sessionData.session.user.id;
      const { data: memberships, error: membershipError } = await supabase.from('workspace_members').select('workspace_id').eq('user_id', userId).limit(1);
      if (membershipError || !memberships?.[0]?.workspace_id) throw membershipError ?? new Error('No Android instrumentation workspace is available.');
      const workspaceId = String(memberships[0].workspace_id);
      const { data: trucks, error: truckError } = await supabase.from('trucks').select('id').eq('workspace_id', workspaceId).is('deleted_at', null).limit(1);
      if (truckError || !trucks?.[0]?.id) throw truckError ?? new Error('No Android instrumentation truck is available.');

      // Exercise the same production local-first branch used when Android has
      // a network interface but Supabase is unreachable. The short test
      // cooldown is cleared before the process-death boundary; release code
      // never calls these controls.
      markBackendUnreachable(Date.now(), 60_000);
      const transaction = await createTruckTransaction(workspaceId, {
        truckId: String(trucks[0].id), date: new Date().toISOString(), type: 'INCOME', category: 'Android offline instrumentation', amount: 1, description: `android-offline-${crypto.randomUUID()}`,
      }, false, userId);
      const queued = (await getQueuedMutations()).filter((mutation) => mutation.entityId === transaction.id).length;
      markBackendReachable();
      return { workspaceId, transactionId: transaction.id, queued };
    },
    async backendSyncQueuedTruck(workspaceId: string, transactionId: string) {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) throw sessionError ?? new Error('Android backend instrumentation session is unavailable after restart.');
      await synchronizeTruckData(workspaceId, sessionData.session.user.id);
      const { data: serverRow, error: rowError } = await supabase.from('truck_transactions').select('id').eq('workspace_id', workspaceId).eq('id', transactionId).maybeSingle();
      if (rowError) throw rowError;
      const remaining = (await getQueuedMutations()).filter((mutation) => mutation.entityId === transactionId).length;
      return { serverCount: serverRow ? 1 : 0, queued: remaining };
    },
  };
  Object.defineProperty(window, '__mathanAndroidTest', { value: Object.freeze(api), configurable: false });
}

declare global { interface Window { __mathanAndroidTest?: unknown } }
