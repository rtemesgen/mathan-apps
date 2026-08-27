import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { legacySnapshotKeyMappings } from '../src/lib/legacyLocalMigration';
import { businessRecordShapeError } from '../src/lib/dataLayerHealth';
import { combineLegacyCashBookSnapshots, mergeCashBookStates } from '../src/apps/book/cashBookRepository';
import { combineLegacyPayrollSnapshots } from '../src/apps/payroll/payrollRepository';

const migrationPath = path.resolve('../backend/supabase/migrations/202608270001_legacy_workspace_data_repair.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');
const truckIdempotency = fs.readFileSync(path.resolve('../backend/supabase/migrations/202608270002_truck_mutation_idempotency.sql'), 'utf8');

assert.doesNotMatch(migration, /\b(delete\s+from|drop\s+table|truncate|drop\s+column)\b/i, 'legacy repair must not delete or rebuild customer data');
assert.match(migration, /permission\.workspace_id is null/i, 'only missing legacy permission rows are backfilled');
assert.match(migration, /on conflict \(workspace_id, user_id, app_id\) do nothing/i, 'explicit permissions remain authoritative');
assert.match(migration, /candidate\.app_id <> 'truck' or member\.role = 'owner'/i, 'legacy members are not accidentally granted Truck edit access');
for (const domain of ['cash_book:books', 'cash_book:transactions', 'payroll:employees', 'payroll:transactions']) {
  assert.match(migration, new RegExp(domain.replace(':', '\\:')), `${domain} has a legacy relational migration path`);
}
assert.match(migration, /not exists[\s\S]*app_state_snapshots/i, 'existing authoritative snapshots are never overwritten');
assert.match(migration, /legacy_snapshot_migration_targets/i, 'record counts are captured before conversion');
assert.match(migration, /jsonb_array_length\(snapshot\.payload\) <> target\.source_count/i, 'converted record counts are validated before commit');
assert.match(migration, /raise exception 'Legacy snapshot migration verification failed/i, 'verification failure aborts without marking success');
assert.match(migration, /employee_id = employee\.id/i, 'salary-history relationships are rebuilt under their original employee');
assert.match(migration, /transaction\.book_id/i, 'Cash Book transaction relationships retain their original book ID');
assert.match(migration, /transaction\.employee_id/i, 'Payroll transaction relationships retain their original employee ID');

assert.deepEqual(legacySnapshotKeyMappings('user-a', 'workspace-old'), [
  { legacyKey: 'workspace-old:cash_book:books', currentKey: 'user-a:workspace-old:cash_book:books' },
  { legacyKey: 'workspace-old:cash_book:transactions', currentKey: 'user-a:workspace-old:cash_book:transactions' },
  { legacyKey: 'workspace-old:payroll:employees', currentKey: 'user-a:workspace-old:payroll:employees' },
  { legacyKey: 'workspace-old:payroll:transactions', currentKey: 'user-a:workspace-old:payroll:transactions' },
], 'all pre-user-scoping snapshot keys have deterministic non-destructive upgrade targets');

for (const table of ['trucks', 'truck_owners', 'truck_customers', 'truck_transactions']) {
  assert.match(truckIdempotency, new RegExp(`alter table public\\.${table} add column if not exists last_mutation_id uuid`), `${table} records durable mutation acknowledgements`);
}
assert.doesNotMatch(truckIdempotency, /\b(delete\s+from|drop\s+table|truncate|drop\s+column)\b/i, 'Truck idempotency upgrade is non-destructive');

assert.equal(businessRecordShapeError('user:workspace:cash_book:books', []), null);
assert.match(businessRecordShapeError('user:workspace:cash_book:books', {}) ?? '', /not an array/);
assert.equal(businessRecordShapeError('user:workspace:cash_book:state', { books: [], transactions: [] }), null);
assert.equal(businessRecordShapeError('user:workspace:payroll:state', { employees: [], transactions: [] }), null);
assert.equal(businessRecordShapeError('truck:user:workspace', { trucks: [], owners: [], transactions: [] }), null, 'pre-customer Truck caches remain compatible');
assert.match(businessRecordShapeError('truck:user:workspace', []) ?? '', /incompatible schema/);
assert.match(businessRecordShapeError('sync-queue-v1', {}) ?? '', /not an array/);

const orphanTransaction = { id: 'tx-old', bookId: 'book-old', type: 'in' as const, amount: 747, remark: 'Legacy', dateTime: '2026-08-01T10:00', createdAt: '2026-08-01T10:00:00.000Z' };
const recoveredCash = combineLegacyCashBookSnapshots({ transactions: [orphanTransaction] });
assert.equal(recoveredCash.books[0].id, 'book-old', 'a legacy transaction keeps its original parent identity navigable');
assert.equal(recoveredCash.transactions[0].bookId, recoveredCash.books[0].id);
const realBook = { id: 'book-old', name: 'Real server book', currency: '$', createdAt: '2026-07-01', updatedAt: '2026-08-01' };
assert.equal(mergeCashBookStates(recoveredCash, { books: [realBook], transactions: [orphanTransaction] }).books[0].name, 'Real server book', 'server parent metadata replaces only the temporary recovery projection');
assert.deepEqual(combineLegacyPayrollSnapshots({ employees: [{ id: 'employee-old' }], transactions: [{ id: 'payment-old', employeeId: 'employee-old' }] }), { employees: [{ id: 'employee-old' }], transactions: [{ id: 'payment-old', employeeId: 'employee-old' }] });

const canonicalMigration = fs.readFileSync(path.resolve('../backend/supabase/migrations/202608270003_canonical_business_snapshots.sql'), 'utf8');
assert.match(canonicalMigration, /'cash_book:state'/);
assert.match(canonicalMigration, /'payroll:state'/);
assert.doesNotMatch(canonicalMigration, /\b(delete\s+from|drop\s+table|truncate|drop\s+column)\b/i, 'canonical snapshot migration is non-destructive');

console.log('Legacy data-layer migration contract tests passed.');
