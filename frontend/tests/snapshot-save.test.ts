import assert from 'node:assert/strict';
import { offlineStore } from '../src/lib/localStore';
import { SYNC_QUEUE_KEY, type QueuedMutation } from '../src/lib/syncQueue';
import { supabase } from '../src/lib/supabase';
import { persistSnapshot } from '../src/lib/repositories/snapshotRepository';

Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
const storageKey = 'user-a:workspace-a:cash_book:state';
const oldMutation: QueuedMutation = {
  id: 'old-mutation', mutationId: 'old-mutation', userId: 'user-a', companyId: 'workspace-a', entityType: 'app_state_snapshot', entityId: 'cash_book:state',
  baseRevision: 1, table: 'app_state_snapshots', operation: 'upsert', payload: { workspace_id: 'workspace-a', domain: 'cash_book:state', payload: { transactions: [{ id: 'old' }] }, expected_revision: 1, affected_client_ids: ['old'] },
  queuedAt: '2026-09-19T00:00:00.000Z', updatedAt: '2026-09-19T00:00:00.000Z', baseServerUpdatedAt: null, lastAttemptAt: null, syncStartedAt: null, syncAttemptId: null, leaseExpiresAt: null, syncStatus: 'pending', retryCount: 0,
};
const durable = new Map<string, unknown>([
  [`${storageKey}:revision`, 1],
  [`${storageKey}:confirmed`, { transactions: [{ id: 'baseline' }] }],
  [SYNC_QUEUE_KEY, [oldMutation]],
  [storageKey, { transactions: [{ id: 'old' }] }],
]);
const originalRead = offlineStore.read;
const originalWrite = offlineStore.write;
const originalWriteAtomic = offlineStore.writeAtomic;
const originalWriteMetadata = offlineStore.writeMetadata;
const originalRpc = supabase.rpc;
const expectedRevisions: number[] = [];
offlineStore.read = (async <T>(key: string) => (durable.get(key) as T | undefined) ?? null) as typeof offlineStore.read;
offlineStore.write = (async (key: string, value: unknown) => { durable.set(key, value); }) as typeof offlineStore.write;
offlineStore.writeAtomic = (async (records: Array<{ key: string; value: unknown }>) => { records.forEach(({ key, value }) => durable.set(key, value)); }) as typeof offlineStore.writeAtomic;
offlineStore.writeMetadata = (async () => undefined) as typeof offlineStore.writeMetadata;
supabase.rpc = (async (_name: string, params: { expected_revision: number; target_payload: unknown }) => {
  expectedRevisions.push(params.expected_revision);
  const revision = expectedRevisions.length === 1 ? 2 : 3;
  return { data: [{ status: 'written', revision, payload: params.target_payload }], error: null };
}) as unknown as typeof supabase.rpc;
try {
  const result = await persistSnapshot({ storageKey, workspaceId: 'workspace-a', userId: 'user-a', standalone: false, domain: 'cash_book', key: 'state' }, { transactions: [{ id: 'new' }] }, 1);
  assert.equal(result, 'saved');
  assert.deepEqual(expectedRevisions, [1, 2], 'the second save must use the revision acknowledged by its earlier queue flush');
  assert.equal(durable.get(`${storageKey}:revision`), 3);
  assert.deepEqual(durable.get(storageKey), { transactions: [{ id: 'new' }] });
} finally {
  offlineStore.read = originalRead;
  offlineStore.write = originalWrite;
  offlineStore.writeAtomic = originalWriteAtomic;
  offlineStore.writeMetadata = originalWriteMetadata;
  supabase.rpc = originalRpc;
}

console.log('Snapshot revision-after-flush tests passed.');
