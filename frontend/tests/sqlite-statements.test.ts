import assert from 'node:assert/strict';
import { sqliteWriteStatement } from '../src/lib/sqliteStatements';

assert.equal(
  sqliteWriteStatement('records'),
  'INSERT OR REPLACE INTO records (key, value, updated_at) VALUES (?, ?, ?)',
);
assert.equal(
  sqliteWriteStatement('metadata'),
  'INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES (?, ?, ?)',
);
assert.doesNotMatch(sqliteWriteStatement('records'), /ON CONFLICT/i);

console.log('SQLite write statement tests passed.');
