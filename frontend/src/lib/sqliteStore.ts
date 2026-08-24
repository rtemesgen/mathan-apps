import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { isJsonSerializable, jsonHash, jsonValue } from './sqliteJson';

const DATABASE_NAME = 'mathan-erp-offline';
const DATABASE_VERSION = 1;
const MIGRATION_KEY = '__offline_sqlite_migration_v1__';

export type LegacyEntry = { key: string; value: unknown };

let connection: SQLiteConnection | null = null;
let databasePromise: Promise<SQLiteDBConnection> | null = null;

function nativeDatabaseConnection() {
  connection ??= new SQLiteConnection(CapacitorSQLite);
  return connection;
}

async function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = (async () => {
    const sqlite = nativeDatabaseConnection();
    if (!(await sqlite.isSecretStored()).result) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const secret = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      await sqlite.setEncryptionSecret(secret);
    }
    const consistent = (await sqlite.checkConnectionsConsistency()).result;
    const connected = (await sqlite.isConnection(DATABASE_NAME, false)).result;
    const database = consistent && connected
      ? await sqlite.retrieveConnection(DATABASE_NAME, false)
      : await sqlite.createConnection(DATABASE_NAME, true, 'secret', DATABASE_VERSION, false);
    await database.open();
    await database.execute(`
      CREATE TABLE IF NOT EXISTS records (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    return database;
  })().catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

async function readTable<T>(table: 'records' | 'metadata', key: string): Promise<T | null> {
  const database = await openDatabase();
  const result = await database.query(`SELECT value FROM ${table} WHERE key = ? LIMIT 1`, [key]);
  const raw = result.values?.[0]?.value as string | undefined;
  if (raw === undefined) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

async function writeTable(table: 'records' | 'metadata', key: string, value: unknown) {
  const serialized = jsonValue(value);
  if (serialized === null) throw new Error(`Offline value for ${key} is not JSON serializable`);
  const database = await openDatabase();
  await database.run(
    `INSERT INTO ${table} (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, serialized, Date.now()],
  );
}

async function deleteTable(table: 'records' | 'metadata', key: string) {
  const database = await openDatabase();
  await database.run(`DELETE FROM ${table} WHERE key = ?`, [key]);
}

async function listTable(table: 'records' | 'metadata') {
  const database = await openDatabase();
  const result = await database.query(`SELECT key FROM ${table} ORDER BY key`);
  return (result.values ?? []).map((row) => String(row.key));
}

export async function readNativeRecord<T>(key: string) { return readTable<T>('records', key); }
export async function writeNativeRecord(key: string, value: unknown) { return writeTable('records', key, value); }
export async function writeNativeRecordsAtomic(entries: LegacyEntry[]) {
  const database = await openDatabase();
  const statements = entries.map(({ key, value }) => {
    const serialized = jsonValue(value);
    if (serialized === null) throw new Error(`Offline value for ${key} is not JSON serializable`);
    return { statement: `INSERT INTO records (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, values: [key, serialized, Date.now()] };
  });
  if (statements.length) await database.executeTransaction(statements);
}
export async function deleteNativeRecord(key: string) { return deleteTable('records', key); }
export async function listNativeRecords() { return listTable('records'); }
export async function readNativeMetadata<T>(key: string) { return readTable<T>('metadata', key); }
export async function writeNativeMetadata(key: string, value: unknown) { return writeTable('metadata', key, value); }

export async function migrateLegacyRecords(entries: LegacyEntry[], metadata: LegacyEntry[]) {
  if (await readNativeMetadata<boolean>(MIGRATION_KEY)) return;
  const database = await openDatabase();
  const records = entries.filter(({ value }) => jsonValue(value) !== null);
  const metadataEntries = metadata.filter(({ value }) => jsonValue(value) !== null);
  const recordStatements = records.map(({ key, value }) => ({ statement: `INSERT INTO records (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING`, values: [key, jsonValue(value), Date.now()] }));
  const metadataStatements = metadataEntries.map(({ key, value }) => ({ statement: `INSERT INTO metadata (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING`, values: [key, jsonValue(value), Date.now()] }));
  if (recordStatements.length || metadataStatements.length) await database.executeTransaction([...recordStatements, ...metadataStatements]);

  const migratedKeys = await listNativeRecords();
  if (migratedKeys.length !== new Set(records.map(({ key }) => key)).size) throw new Error('Offline record migration count verification failed');
  for (const entry of records) {
    const migrated = await readNativeRecord(entry.key);
    if (await jsonHash(migrated) !== await jsonHash(entry.value)) throw new Error(`Offline record migration verification failed for ${entry.key}`);
  }
  const migratedMetadataKeys = await listTable('metadata');
  if (migratedMetadataKeys.length < new Set(metadataEntries.map(({ key }) => key)).size) throw new Error('Offline metadata migration count verification failed');
  for (const entry of metadataEntries) {
    const migrated = await readNativeMetadata(entry.key);
    if (await jsonHash(migrated) !== await jsonHash(entry.value)) throw new Error(`Offline metadata migration verification failed for ${entry.key}`);
  }
  await writeNativeMetadata(MIGRATION_KEY, true);
}

export { isJsonSerializable } from './sqliteJson';
