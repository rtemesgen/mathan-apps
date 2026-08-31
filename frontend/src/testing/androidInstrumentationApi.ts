import { offlineStore } from '../lib/localStore';
import { enqueueMutationsAtomic, getQueuedMutations, replaceQueue } from '../lib/syncQueue';
import { getNativeDatabaseHealth, migrateLegacyRecords } from '../lib/sqliteStore';

type Entry = { id: string; amount: number; note: string };
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
  };
  Object.defineProperty(window, '__mathanAndroidTest', { value: Object.freeze(api), configurable: false });
}

declare global { interface Window { __mathanAndroidTest?: unknown } }
