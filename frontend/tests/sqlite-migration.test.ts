import assert from 'node:assert/strict';
import { DATABASE_VERSION, evaluateNativeDatabaseHealth, migrateLegacyRecords, verifyMigratedEntries, type LegacyEntry, type MigrationStore } from '../src/lib/sqliteStore';

const records: LegacyEntry[] = [{ key: 'cash_book:user:workspace:books', value: [{ id: 'book-1' }] }];
const metadata: LegacyEntry[] = [{ key: 'sync:workspace', value: { pendingCount: 0 } }];
const storedRecords = new Map<string, unknown>([['existing-unrelated', { keep: true }], ['cash_book:user:workspace:books', [{ id: 'book-1' }]]]);
const storedMetadata = new Map<string, unknown>([['existing-meta', { keep: true }], ['sync:workspace', { pendingCount: 0 }]]);

await verifyMigratedEntries(records, metadata, {
  listRecords: async () => [...storedRecords.keys()],
  readRecord: async (key) => storedRecords.get(key),
  listMetadata: async () => [...storedMetadata.keys()],
  readMetadata: async (key) => storedMetadata.get(key),
});

storedRecords.set(records[0].key, [{ id: 'different' }]);
await assert.rejects(() => verifyMigratedEntries(records, metadata, {
  listRecords: async () => [...storedRecords.keys()],
  readRecord: async (key) => storedRecords.get(key),
  listMetadata: async () => [...storedMetadata.keys()],
  readMetadata: async (key) => storedMetadata.get(key),
}), /migration verification failed/);

const migratedRecords = new Map<string, unknown>();
const migratedMetadata = new Map<string, unknown>();
let marker = false;
let attempts = 0;
const retryStore: MigrationStore = {
  readMarker: async () => marker,
  writeEntries: async (nextRecords, nextMetadata) => {
    attempts += 1;
    if (attempts === 1) {
      migratedRecords.set(records[0].key, [{ id: 'stale-partial-row' }]);
      throw new Error('interrupted migration');
    }
    nextRecords.forEach((entry) => migratedRecords.set(entry.key, entry.value));
    nextMetadata.forEach((entry) => migratedMetadata.set(entry.key, entry.value));
  },
  verifyEntries: (nextRecords, nextMetadata) => verifyMigratedEntries(nextRecords, nextMetadata, {
    listRecords: async () => [...migratedRecords.keys()],
    readRecord: async (key) => migratedRecords.get(key),
    listMetadata: async () => [...migratedMetadata.keys()],
    readMetadata: async (key) => migratedMetadata.get(key),
  }),
  writeMarker: async () => { marker = true; },
};

await assert.rejects(() => migrateLegacyRecords([...records, { key: 'crypto-key', value: new Map([['unsupported', true]]) }], metadata, retryStore), /interrupted migration/);
assert.equal(marker, false, 'an interrupted migration must not set its completion marker');
await migrateLegacyRecords(records, metadata, retryStore);
assert.equal(marker, true, 'the migration marker is written only after verification');
assert.equal(attempts, 2, 'a failed migration must be retried');
await migrateLegacyRecords([{ key: 'should-not-write', value: { id: 'later' } }], [], retryStore);
assert.equal(attempts, 2, 'a completed migration must not run again');

const healthySchema = evaluateNativeDatabaseHealth({
  actualVersion: DATABASE_VERSION,
  tables: {
    records: ['key', 'value', 'updated_at'],
    metadata: ['key', 'value', 'updated_at'],
    schema_migrations: ['version', 'state', 'completed_at'],
  },
  completedVersions: [DATABASE_VERSION],
});
assert.equal(healthySchema.healthy, true, 'a fully upgraded database passes the startup health gate');
const oldSchema = evaluateNativeDatabaseHealth({
  actualVersion: 1,
  tables: { records: ['key', 'value', 'updated_at'], metadata: ['key', 'value', 'updated_at'] },
  completedVersions: [],
});
assert.equal(oldSchema.healthy, false, 'a previous schema version is not mistaken for a fresh empty database');
assert.deepEqual(oldSchema.missingTables, ['schema_migrations']);
const partialSchema = evaluateNativeDatabaseHealth({
  actualVersion: DATABASE_VERSION,
  tables: {
    records: ['key', 'value', 'updated_at'],
    metadata: ['key', 'value', 'updated_at'],
    schema_migrations: ['version', 'state', 'completed_at'],
  },
  completedVersions: [],
});
assert.equal(partialSchema.partialMigration, true, 'a version bump without a completion record is detected as partial');
assert.equal(partialSchema.healthy, false);

console.log('SQLite migration verification tests passed.');
