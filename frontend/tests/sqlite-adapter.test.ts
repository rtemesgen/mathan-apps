import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DATABASE_VERSION, SQLITE_CURRENT_SCHEMA_SQL, SQLITE_V2_UPGRADE_STATEMENTS } from '../src/lib/sqliteStore';

const sqlite = process.env.SQLITE3_BIN || 'sqlite3';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mathan-sqlite-adapter-'));
const upgradedPath = path.join(directory, 'upgraded-v1.db');
const freshPath = path.join(directory, 'fresh-v2.db');
const freshUpgradePath = path.join(directory, 'fresh-upgrade-v2.db');

function execute(database: string, sql: string) {
  // Android SDK's sqlite3 build can keep stdin open when launched by Node.
  // Passing the batch as an argument also models a fresh process per operation.
  execFileSync(sqlite, [database, sql], { encoding: 'utf8' });
}

function query<T>(database: string, sql: string): T[] {
  const output = execFileSync(sqlite, ['-json', database, sql], { encoding: 'utf8' }).trim();
  return output ? JSON.parse(output) as T[] : [];
}

const v1Schema = `
  PRAGMA user_version = 1;
  CREATE TABLE records (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
`;
execute(upgradedPath, v1Schema);

const businessKey = 'user-old:workspace-old:cash_book:state';
const book = { id: 'book-1', name: 'Offline Book', currency: '$', createdAt: '2026-08-27T00:00:00.000Z', updatedAt: '2026-08-27T01:00:00.000Z' };
const payment = [{ id: 'payment-1', bookId: 'book-1', type: 'in', amount: 125, remark: 'offline payment', dateTime: '2026-08-27T01:00', createdAt: '2026-08-27T01:00:00.000Z' }];
const businessState = { books: [book], transactions: payment };
const outbox = [{
  id: 'mutation-1', mutationId: 'mutation-1', userId: 'user-old', companyId: 'workspace-old',
  entityType: 'app_state_snapshot', entityId: 'cash_book:state', baseRevision: 2,
  table: 'app_state_snapshots', operation: 'upsert', payload: { workspace_id: 'workspace-old', domain: 'cash_book:state', payload: businessState, expected_revision: 2 },
  queuedAt: '2026-08-27T01:00:00.000Z', updatedAt: '2026-08-27T01:00:00.000Z', baseServerUpdatedAt: null,
  lastAttemptAt: null, syncStartedAt: null, syncAttemptId: null, leaseExpiresAt: null, syncStatus: 'pending', retryCount: 0,
}];

const sqlString = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'`;
execute(upgradedPath, `
  BEGIN IMMEDIATE;
  INSERT INTO records(key, value, updated_at) VALUES (${sqlString(businessKey)}, ${sqlString(businessState)}, 1);
  INSERT INTO records(key, value, updated_at) VALUES ('sync-queue-v1', ${sqlString(outbox)}, 1);
  COMMIT;
`);

// Simulate the Capacitor v1 -> v2 upgrade transaction, including SQLite's
// version bump performed by the native plugin after all statements succeed.
execute(upgradedPath, `BEGIN IMMEDIATE; ${SQLITE_V2_UPGRADE_STATEMENTS.join('\n')} PRAGMA user_version = ${DATABASE_VERSION}; COMMIT;`);
execute(freshPath, `${SQLITE_CURRENT_SCHEMA_SQL} PRAGMA user_version = ${DATABASE_VERSION};`);
// Capacitor applies registered upgrade statements before application code can
// execute the current schema. A brand-new database therefore enters this path
// from user_version 0 and must create the base tables itself.
execute(freshUpgradePath, `BEGIN IMMEDIATE; ${SQLITE_V2_UPGRADE_STATEMENTS.join('\n')} PRAGMA user_version = ${DATABASE_VERSION}; COMMIT;`);

function schemaDescriptor(database: string) {
  const tables = query<{ name: string }>(database, `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).map((row) => row.name);
  const columns = Object.fromEntries(tables.map((table) => [table, query<{ name: string; type: string; notnull: number; pk: number }>(database, `PRAGMA table_info(${table})`).map(({ name, type, notnull, pk }) => ({ name, type, notnull, pk }))]));
  const indexes = Object.fromEntries(tables.map((table) => [table, query<{ name: string; unique: number; origin: string }>(database, `PRAGMA index_list(${table})`).filter((index) => !index.name.startsWith('sqlite_')).map(({ name, unique, origin }) => ({ name, unique, origin })).sort((a, b) => a.name.localeCompare(b.name))]));
  return { tables, columns, indexes };
}

assert.deepEqual(schemaDescriptor(upgradedPath), schemaDescriptor(freshPath), 'upgraded-v1 and fresh-v2 SQLite schemas have identical tables, columns, and indexes');
assert.deepEqual(schemaDescriptor(freshUpgradePath), schemaDescriptor(freshPath), 'a native fresh install upgraded from version 0 creates the complete current schema');
assert.equal(query<{ user_version: number }>(upgradedPath, 'PRAGMA user_version')[0].user_version, DATABASE_VERSION);

// Test 1: server-confirmed/effective business data is physically present after
// closing and reopening the sqlite3 process (each query opens a new process).
const persistedPayment = query<{ value: string }>(upgradedPath, `SELECT value FROM records WHERE key=${sqlString(businessKey)}`);
assert.deepEqual(JSON.parse(persistedPayment[0].value), businessState, 'Cash Book parents and entries survive a direct SQLite restart read');

// Test 2: the local effective state and outbox are committed together.
const persistedPair = query<{ key: string; value: string }>(upgradedPath, `SELECT key, value FROM records WHERE key IN (${sqlString(businessKey)}, 'sync-queue-v1') ORDER BY key`);
assert.equal(persistedPair.length, 2, 'offline business state and pending outbox row both reached SQLite');
assert.equal((JSON.parse(persistedPair.find((row) => row.key === 'sync-queue-v1')!.value) as unknown[]).length, 1);

// Restart/read/sync/read contract: acknowledgement clears only the outbox;
// the effective payment remains durable and is never duplicated.
execute(upgradedPath, `BEGIN IMMEDIATE; UPDATE records SET value='[]', updated_at=2 WHERE key='sync-queue-v1'; COMMIT;`);
assert.deepEqual(JSON.parse(query<{ value: string }>(upgradedPath, `SELECT value FROM records WHERE key=${sqlString(businessKey)}`)[0].value), businessState);
assert.deepEqual(JSON.parse(query<{ value: string }>(upgradedPath, `SELECT value FROM records WHERE key='sync-queue-v1'`)[0].value), []);

fs.rmSync(directory, { recursive: true, force: true });
console.log('Direct SQLite cache/outbox, restart, sync, and fresh-vs-upgrade schema tests passed.');
