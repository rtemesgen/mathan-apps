import assert from 'node:assert/strict';
import type { QueuedMutation } from '../src/lib/syncQueue';
import { offlineStore } from '../src/lib/localStore';

const exitModule = await import('../src/lib/androidExit').catch(() => null);
assert.ok(exitModule, 'Android Exit requires a durable persistence barrier');

const { createPersistenceActivityTracker, executePreparedExit, persistenceActivity, prepareForAndroidExit, summarizeStartupProtection, verifyPendingMutationRecords } = exitModule!;
assert.equal(typeof offlineStore.flush, 'function', 'OfflineStore must expose a flush barrier for Android Exit');
assert.equal(typeof prepareForAndroidExit, 'function', 'Android Exit must coordinate save, queue, and durable-record barriers');
assert.equal(typeof executePreparedExit, 'function', 'Android Exit must call the native exit only after preparation succeeds');
assert.equal(typeof summarizeStartupProtection, 'function', 'Startup reconciliation needs redacted queue/effective boundary diagnostics');

const tracker = createPersistenceActivityTracker();
let release!: () => void;
const activeSave = tracker.track(new Promise<void>((resolve) => { release = resolve; }));
let idleResolved = false;
const idle = tracker.waitForIdle(250).then(() => { idleResolved = true; });
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(idleResolved, false, 'Exit must remain blocked while an accepted save is still committing');
release();
await activeSave;
await idle;
assert.equal(idleResolved, true, 'Exit may continue after the active save settles');

const mutation = (overrides: Partial<QueuedMutation>): QueuedMutation => ({
  id: crypto.randomUUID(), mutationId: crypto.randomUUID(), userId: 'user-a', companyId: 'workspace-a',
  entityType: 'app_state_snapshot', entityId: 'cash_book:state', baseRevision: 0,
  table: 'app_state_snapshots', operation: 'upsert', payload: {}, queuedAt: '2026-08-29T00:00:00.000Z',
  updatedAt: '2026-08-29T00:00:00.000Z', baseServerUpdatedAt: null, lastAttemptAt: null,
  syncStartedAt: null, syncAttemptId: null, leaseExpiresAt: null, syncStatus: 'pending', retryCount: 0,
  ...overrides,
});

const queue = [
  mutation({ entityId: 'cash_book:state', payload: { domain: 'cash_book:state' } }),
  mutation({ entityId: 'payroll:state', payload: { domain: 'payroll:state' } }),
  mutation({ table: 'trucks', entityType: 'truck', entityId: 'truck-1', operation: 'create', payload: { id: 'truck-1' } }),
  mutation({ table: 'truck_owners', entityType: 'truck_owner', entityId: 'owner-1', operation: 'update', payload: { id: 'owner-1' } }),
  mutation({ table: 'truck_customers', entityType: 'truck_customer', entityId: 'customer-deleted', operation: 'delete', payload: { id: 'customer-deleted' } }),
  mutation({ table: 'truck_transactions', entityType: 'truck_transaction', entityId: 'transaction-1', operation: 'create', payload: { id: 'transaction-1' } }),
];
const durable = new Map<string, unknown>([
  ['user-a:workspace-a:cash_book:state', { books: [], transactions: [{ id: 'cash-1' }] }],
  ['user-a:workspace-a:payroll:state', { employees: [{ id: 'employee-1' }], transactions: [] }],
  ['truck:user-a:workspace-a', {
    trucks: [{ id: 'truck-1' }], owners: [{ id: 'owner-1' }], customers: [], transactions: [{ id: 'transaction-1' }],
  }],
]);
const verified = await verifyPendingMutationRecords(queue, (key: string) => Promise.resolve(durable.get(key) ?? null));
assert.deepEqual(verified, { pendingMutationCount: 6, verifiedRecordCount: 3 });
assert.deepEqual(await summarizeStartupProtection('before-fetch', queue, (key: string) => Promise.resolve(durable.has(key))), {
  stage: 'before-fetch',
  pendingMutationCount: 6,
  pendingMutationIds: queue.map((item) => item.mutationId).join(','),
  effectiveRecordCount: 3,
  pendingWithoutEffective: 0,
  scopeMismatchCount: 0,
});

await assert.rejects(
  verifyPendingMutationRecords(queue, (key: string) => Promise.resolve(key.includes('payroll') ? null : durable.get(key) ?? null)),
  /payroll:state/i,
  'Exit must be blocked when a pending snapshot has no durable effective record',
);
await assert.rejects(
  verifyPendingMutationRecords([
    mutation({ entityId: 'cash_book:state', payload: { domain: 'cash_book:state', payload: { books: [], transactions: [] } } }),
  ], (key: string) => Promise.resolve(durable.get(key) ?? null)),
  /does not match.*outbox/i,
  'Exit must be blocked when the latest snapshot outbox payload differs from its durable effective record',
);
await assert.rejects(
  verifyPendingMutationRecords([mutation({ table: 'truck_owners', entityId: 'missing-owner', payload: { id: 'missing-owner' } })], (key: string) => Promise.resolve(durable.get(key) ?? null)),
  /missing-owner/i,
  'Exit must be blocked when a pending Truck create/update is absent from the canonical cache',
);
await assert.rejects(
  verifyPendingMutationRecords([mutation({ table: 'truck_customers', entityId: 'customer-present', operation: 'delete', payload: { id: 'customer-present' } })], () => Promise.resolve({ trucks: [], owners: [], customers: [{ id: 'customer-present' }], transactions: [] })),
  /customer-present/i,
  'Exit must be blocked when a pending Truck delete is still present in the canonical cache',
);

let releaseCoordinatorSave!: () => void;
const coordinatorSave = persistenceActivity.track(new Promise<void>((resolve) => { releaseCoordinatorSave = resolve; }));
let queueWaited = false;
let storageFlushed = false;
const preparing = prepareForAndroidExit({
  timeoutMs: 250,
  waitForQueueIdle: async () => { queueWaited = true; },
  flush: async () => { storageFlushed = true; return { pendingMutationCount: 0, verifiedRecordCount: 0 }; },
  readQueue: async () => queue,
  readDurableRecord: async (key: string) => durable.get(key) ?? null,
});
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(queueWaited, false, 'Queue verification cannot start before the active save finishes');
assert.equal(storageFlushed, false, 'Storage cannot be reported flushed before the active save finishes');
releaseCoordinatorSave();
await coordinatorSave;
assert.deepEqual(await preparing, { pendingMutationCount: 6, verifiedRecordCount: 3 });
assert.equal(queueWaited, true);
assert.equal(storageFlushed, true);

await assert.rejects(
  prepareForAndroidExit({
    timeoutMs: 20,
    waitForQueueIdle: () => new Promise<void>(() => { setTimeout(() => undefined, 1_000); }),
    flush: async () => ({ pendingMutationCount: 0, verifiedRecordCount: 0 }),
    readQueue: async () => [],
    readDurableRecord: async () => null,
  }),
  /timed out.*local saves/i,
  'Exit must stay open when queue persistence does not settle before the deadline',
);

let nativeExitCalls = 0;
await assert.rejects(executePreparedExit(
  async () => { throw new Error('durable verification failed'); },
  async () => { nativeExitCalls += 1; },
), /durable verification failed/);
assert.equal(nativeExitCalls, 0, 'a failed durable verification must keep Android open');
await executePreparedExit(async () => ({ pendingMutationCount: 1, verifiedRecordCount: 1 }), async () => { nativeExitCalls += 1; });
assert.equal(nativeExitCalls, 1, 'native Exit runs exactly once after durable verification succeeds');

console.log('Android exit persistence barrier tests passed.');
