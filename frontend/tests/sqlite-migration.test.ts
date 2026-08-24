import assert from 'node:assert/strict';
import { verifyMigratedEntries, type LegacyEntry } from '../src/lib/sqliteStore';

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

console.log('SQLite migration verification tests passed.');
