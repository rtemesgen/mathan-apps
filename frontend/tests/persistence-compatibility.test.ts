import assert from 'node:assert/strict';
import { enqueueMutationsAtomic, SYNC_QUEUE_META_KEY, SYNC_QUEUE_KEY } from '../src/lib/syncQueue';
import { offlineStore } from '../src/lib/localStore';

const records = new Map<string, unknown>();
const originalRead = offlineStore.read;
const originalWriteAtomic = offlineStore.writeAtomic;
offlineStore.read = (async (key: string) => records.get(key) ?? null) as typeof offlineStore.read;
offlineStore.writeAtomic = (async (writes: Array<{ key: string; value: unknown }>) => {
  writes.forEach(({ key, value }) => records.set(key, value));
}) as typeof offlineStore.writeAtomic;

try {
  records.set(SYNC_QUEUE_KEY, [{
    id: 'legacy-mutation', mutationId: 'legacy-mutation', userId: 'user-a', companyId: 'workspace-a',
    entityType: 'truck_transaction', entityId: 'row-a', baseRevision: 0, table: 'truck_transactions', operation: 'create',
    payload: { id: 'row-a', workspace_id: 'workspace-a' }, queuedAt: '2026-09-19T00:00:00.000Z', updatedAt: '2026-09-19T00:00:00.000Z',
    baseServerUpdatedAt: null, lastAttemptAt: null, syncStartedAt: null, syncAttemptId: null, leaseExpiresAt: null,
    syncStatus: 'pending', retryCount: 0,
  }]);

  await enqueueMutationsAtomic([{
    userId: 'user-a', companyId: 'workspace-a', entityType: 'truck_transaction', entityId: 'row-b',
    baseRevision: 0, table: 'truck_transactions', operation: 'create',
    payload: { id: 'row-b', workspace_id: 'workspace-a' },
  }], []);

  const firstQueue = records.get(SYNC_QUEUE_KEY) as Array<Record<string, unknown>>;
  const firstMeta = records.get(SYNC_QUEUE_META_KEY) as Record<string, unknown>;
  assert.equal(firstQueue.length, 2);
  assert.equal(firstQueue[0].formatVersion, 2, 'legacy queue entries are normalized to v2 on the first durable mutation');
  assert.equal(firstQueue[0].localSequence, 1);
  assert.equal(firstQueue[1].formatVersion, 2);
  assert.equal(firstQueue[1].localSequence, 2);
  assert.equal(firstMeta.formatVersion, 2);
  assert.equal(firstMeta.queueGeneration, 1);
  assert.equal(firstMeta.nextLocalSequence, 3);

  await enqueueMutationsAtomic([{
    userId: 'user-a', companyId: 'workspace-a', entityType: 'truck_transaction', entityId: 'row-c',
    baseRevision: 0, table: 'truck_transactions', operation: 'create',
    payload: { id: 'row-c', workspace_id: 'workspace-a' },
  }], []);
  const secondMeta = records.get(SYNC_QUEUE_META_KEY) as Record<string, unknown>;
  const secondQueue = records.get(SYNC_QUEUE_KEY) as Array<Record<string, unknown>>;
  assert.equal(secondQueue[2].localSequence, 3);
  assert.equal(secondMeta.queueGeneration, 2);
  assert.equal(secondMeta.nextLocalSequence, 4);
} finally {
  offlineStore.read = originalRead;
  offlineStore.writeAtomic = originalWriteAtomic;
}

console.log('Persistence compatibility tests passed.');
