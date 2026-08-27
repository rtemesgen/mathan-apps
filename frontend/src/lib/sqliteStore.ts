import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { isJsonSerializable, jsonHash, jsonValue } from './sqliteJson';
import { diagnostic } from './diagnostics';

const DATABASE_NAME = 'mathan-erp-offline';
export const DATABASE_VERSION = 2;
const MIGRATION_KEY = '__offline_sqlite_migration_v1__';
export const SQLITE_V2_UPGRADE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, state TEXT NOT NULL CHECK (state IN ('ready')), completed_at INTEGER NOT NULL);`,
  `CREATE INDEX IF NOT EXISTS records_updated_at_idx ON records(updated_at);`,
  `CREATE INDEX IF NOT EXISTS metadata_updated_at_idx ON metadata(updated_at);`,
  `INSERT OR REPLACE INTO schema_migrations (version, state, completed_at) VALUES (2, 'ready', CAST(strftime('%s','now') AS INTEGER) * 1000);`,
] as const;
export const SQLITE_CURRENT_SCHEMA_SQL = `
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
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('ready')),
    completed_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS records_updated_at_idx ON records(updated_at);
  CREATE INDEX IF NOT EXISTS metadata_updated_at_idx ON metadata(updated_at);
  INSERT OR IGNORE INTO schema_migrations (version, state, completed_at)
    VALUES (${DATABASE_VERSION}, 'ready', CAST(strftime('%s','now') AS INTEGER) * 1000);
`;
const REQUIRED_TABLE_COLUMNS = {
  records: ['key', 'value', 'updated_at'],
  metadata: ['key', 'value', 'updated_at'],
  schema_migrations: ['version', 'state', 'completed_at'],
} as const;

export type NativeDatabaseHealth = {
  healthy: boolean;
  expectedVersion: number;
  actualVersion: number;
  missingTables: string[];
  missingColumns: string[];
  partialMigration: boolean;
};

export type LegacyEntry = { key: string; value: unknown };
export type MigrationStore = {
  readMarker: () => Promise<boolean | null>;
  writeEntries: (records: LegacyEntry[], metadata: LegacyEntry[]) => Promise<void>;
  verifyEntries: (records: LegacyEntry[], metadata: LegacyEntry[]) => Promise<void>;
  writeMarker: () => Promise<void>;
};

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
    diagnostic('local-schema-open', { database: DATABASE_NAME, expectedVersion: DATABASE_VERSION });
    if (!(await sqlite.isSecretStored()).result) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const secret = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      await sqlite.setEncryptionSecret(secret);
    }
    await sqlite.addUpgradeStatement(DATABASE_NAME, [{
      toVersion: 2,
      statements: [...SQLITE_V2_UPGRADE_STATEMENTS],
    }]);
    const consistent = (await sqlite.checkConnectionsConsistency()).result;
    const connected = (await sqlite.isConnection(DATABASE_NAME, false)).result;
    const database = consistent && connected
      ? await sqlite.retrieveConnection(DATABASE_NAME, false)
      : await sqlite.createConnection(DATABASE_NAME, true, 'secret', DATABASE_VERSION, false);
    await database.open();
    await database.execute(SQLITE_CURRENT_SCHEMA_SQL);
    const health = await inspectOpenDatabase(database);
    diagnostic('local-schema-health', {
      healthy: health.healthy,
      expectedVersion: health.expectedVersion,
      actualVersion: health.actualVersion,
      missingTables: health.missingTables.join(','),
      missingColumns: health.missingColumns.join(','),
      partialMigration: health.partialMigration,
    });
    if (!health.healthy) {
      throw new Error(`Offline database schema is invalid; data was preserved (${[
        health.actualVersion !== health.expectedVersion ? `version ${health.actualVersion}` : '',
        health.missingTables.length ? `missing tables: ${health.missingTables.join(', ')}` : '',
        health.missingColumns.length ? `missing columns: ${health.missingColumns.join(', ')}` : '',
        health.partialMigration ? 'partial migration detected' : '',
      ].filter(Boolean).join('; ')})`);
    }
    return database;
  })().catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

export function evaluateNativeDatabaseHealth(input: {
  actualVersion: number;
  tables: Record<string, string[]>;
  completedVersions: number[];
}): NativeDatabaseHealth {
  const missingTables = Object.keys(REQUIRED_TABLE_COLUMNS).filter((table) => !input.tables[table]);
  const missingColumns = Object.entries(REQUIRED_TABLE_COLUMNS).flatMap(([table, required]) => {
    const available = new Set(input.tables[table] ?? []);
    return required.filter((column) => !available.has(column)).map((column) => `${table}.${column}`);
  });
  const partialMigration = input.actualVersion >= DATABASE_VERSION && !input.completedVersions.includes(DATABASE_VERSION);
  return {
    healthy: input.actualVersion === DATABASE_VERSION && !missingTables.length && !missingColumns.length && !partialMigration,
    expectedVersion: DATABASE_VERSION,
    actualVersion: input.actualVersion,
    missingTables,
    missingColumns,
    partialMigration,
  };
}

async function inspectOpenDatabase(database: SQLiteDBConnection): Promise<NativeDatabaseHealth> {
  const versionResult = await database.query('PRAGMA user_version;');
  const actualVersion = Number(versionResult.values?.[0]?.user_version ?? 0);
  const tables: Record<string, string[]> = {};
  for (const table of Object.keys(REQUIRED_TABLE_COLUMNS)) {
    const exists = await database.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`, [table]);
    if (!exists.values?.length) continue;
    const columns = await database.query(`PRAGMA table_info(${table});`);
    tables[table] = (columns.values ?? []).map((row) => String(row.name));
  }
  const versions = tables.schema_migrations
    ? await database.query(`SELECT version FROM schema_migrations WHERE state = 'ready' ORDER BY version`)
    : { values: [] };
  return evaluateNativeDatabaseHealth({
    actualVersion,
    tables,
    completedVersions: (versions.values ?? []).map((row) => Number(row.version)),
  });
}

export async function getNativeDatabaseHealth() {
  return inspectOpenDatabase(await openDatabase());
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
export async function isNativeMigrationComplete() { return (await readNativeMetadata<boolean>(MIGRATION_KEY)) === true; }

export async function verifyMigratedEntries(
  records: LegacyEntry[],
  metadata: LegacyEntry[],
  readers: {
    listRecords: () => Promise<string[]>;
    readRecord: (key: string) => Promise<unknown>;
    listMetadata: () => Promise<string[]>;
    readMetadata: (key: string) => Promise<unknown>;
  } = { listRecords: listNativeRecords, readRecord: readNativeRecord, listMetadata: () => listTable('metadata'), readMetadata: readNativeMetadata },
) {
  const recordKeys = new Set(await readers.listRecords());
  for (const entry of records) {
    if (!recordKeys.has(entry.key)) throw new Error(`Offline record migration verification failed for ${entry.key}`);
    if (await jsonHash(await readers.readRecord(entry.key)) !== await jsonHash(entry.value)) throw new Error(`Offline record migration verification failed for ${entry.key}`);
  }
  const metadataKeys = new Set(await readers.listMetadata());
  for (const entry of metadata) {
    if (!metadataKeys.has(entry.key)) throw new Error(`Offline metadata migration verification failed for ${entry.key}`);
    if (await jsonHash(await readers.readMetadata(entry.key)) !== await jsonHash(entry.value)) throw new Error(`Offline metadata migration verification failed for ${entry.key}`);
  }
}

export async function migrateLegacyRecords(entries: LegacyEntry[], metadata: LegacyEntry[], store?: MigrationStore) {
  const migrationStore: MigrationStore = store ?? {
    readMarker: () => readNativeMetadata<boolean>(MIGRATION_KEY),
    writeEntries: async (records, metadataEntries) => {
      const database = await openDatabase();
      // A migration can be interrupted after SQLite has written some rows but
      // before verification/marker commit. Upsert on retry so a stale partial
      // row is repaired from the still-preserved legacy stores instead of
      // causing verification to fail forever.
      const recordStatements = records.map(({ key, value }) => ({ statement: `INSERT INTO records (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, values: [key, jsonValue(value), Date.now()] }));
      const metadataStatements = metadataEntries.map(({ key, value }) => ({ statement: `INSERT INTO metadata (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, values: [key, jsonValue(value), Date.now()] }));
      if (recordStatements.length || metadataStatements.length) await database.executeTransaction([...recordStatements, ...metadataStatements]);
    },
    verifyEntries: (records, metadataEntries) => verifyMigratedEntries(records, metadataEntries),
    writeMarker: () => writeNativeMetadata(MIGRATION_KEY, true),
  };
  if (await migrationStore.readMarker()) return;
  const records = entries.filter(({ value }) => jsonValue(value) !== null);
  const metadataEntries = metadata.filter(({ value }) => jsonValue(value) !== null);
  await migrationStore.writeEntries(records, metadataEntries);
  await migrationStore.verifyEntries(records, metadataEntries);
  await migrationStore.writeMarker();
}

export { isJsonSerializable } from './sqliteJson';
