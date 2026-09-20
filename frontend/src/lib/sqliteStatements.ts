export type SqliteWriteTable = 'records' | 'metadata';

export function sqliteWriteStatement(table: SqliteWriteTable) {
  return `INSERT OR REPLACE INTO ${table} (key, value, updated_at) VALUES (?, ?, ?)`;
}
