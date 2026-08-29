import { offlineStore, readDurableOffline } from './localStore';
import { getQueuedMutations, waitForQueueIdle, type QueuedMutation } from './syncQueue';
import { createPersistenceActivityTracker, persistenceActivity } from './persistenceActivity';

export { createPersistenceActivityTracker, persistenceActivity } from './persistenceActivity';

export type OfflineFlushResult = {
  pendingMutationCount: number;
  verifiedRecordCount: number;
};

const truckCollection = (table: string) => table === 'trucks' ? 'trucks'
  : table === 'truck_owners' ? 'owners'
    : table === 'truck_customers' ? 'customers'
      : table === 'truck_transactions' ? 'transactions'
        : null;

const effectiveRecordKey = (mutation: QueuedMutation) => mutation.table === 'app_state_snapshots'
  ? `${mutation.userId}:${mutation.companyId}:${String(mutation.payload.domain ?? mutation.entityId)}`
  : `truck:${mutation.userId}:${mutation.companyId}`;

export async function summarizeStartupProtection(
  stage: string,
  queue: QueuedMutation[],
  recordExists: (key: string) => Promise<boolean>,
) {
  const pending = queue.filter((mutation) => mutation.syncStatus !== 'completed');
  const keys = [...new Set(pending.map(effectiveRecordKey))];
  const existing = await Promise.all(keys.map(async (key) => ({ key, exists: await recordExists(key) })));
  const available = new Set(existing.filter((item) => item.exists).map((item) => item.key));
  return {
    stage,
    pendingMutationCount: pending.length,
    pendingMutationIds: pending.map((mutation) => mutation.mutationId).join(','),
    effectiveRecordCount: available.size,
    pendingWithoutEffective: pending.filter((mutation) => !available.has(effectiveRecordKey(mutation))).length,
    scopeMismatchCount: pending.filter((mutation) => !mutation.companyId || !mutation.entityId || !mutation.userId || mutation.userId === 'unknown').length,
  };
}

export async function verifyPendingMutationRecords(
  queue: QueuedMutation[],
  readDurableRecord: (key: string) => Promise<unknown | null>,
): Promise<OfflineFlushResult> {
  const pending = queue.filter((mutation) => mutation.syncStatus !== 'completed');
  const latestSnapshots = new Map<string, string>();
  pending.forEach((mutation) => {
    if (mutation.table === 'app_state_snapshots') latestSnapshots.set(`${mutation.companyId}:${mutation.entityId}`, mutation.mutationId);
  });
  const verifiedKeys = new Set<string>();
  for (const mutation of pending) {
    if (!mutation.userId || mutation.userId === 'unknown' || !mutation.companyId || !mutation.entityId) {
      throw new Error(`Pending mutation ${mutation.mutationId || mutation.id} has an invalid user, workspace, or entity scope.`);
    }
    if (mutation.table === 'app_state_snapshots') {
      const domain = String(mutation.payload.domain ?? mutation.entityId);
      const key = effectiveRecordKey(mutation);
      const effective = await readDurableRecord(key);
      if (effective === null) throw new Error(`Pending ${domain} mutation has no durable effective record.`);
      const latestMutationId = latestSnapshots.get(`${mutation.companyId}:${mutation.entityId}`);
      if (latestMutationId === mutation.mutationId && mutation.payload.payload !== undefined
        && JSON.stringify(effective) !== JSON.stringify(mutation.payload.payload)) {
        throw new Error(`Pending ${domain} effective record does not match its latest durable outbox payload.`);
      }
      verifiedKeys.add(key);
      continue;
    }
    const collectionName = truckCollection(mutation.table);
    if (!collectionName) throw new Error(`Pending mutation ${mutation.mutationId} uses unsupported table ${mutation.table}.`);
    const key = effectiveRecordKey(mutation);
    const cache = await readDurableRecord(key) as Record<string, unknown> | null;
    const collection = Array.isArray(cache?.[collectionName]) ? cache[collectionName] as Array<{ id?: string }> : null;
    if (!collection) throw new Error(`Pending Truck mutation ${mutation.entityId} has no durable canonical cache.`);
    const present = collection.some((record) => record?.id === mutation.entityId);
    if (mutation.operation === 'delete' ? present : !present) {
      throw new Error(`Pending Truck mutation ${mutation.entityId} does not match the durable canonical cache.`);
    }
    verifiedKeys.add(key);
  }
  return { pendingMutationCount: pending.length, verifiedRecordCount: verifiedKeys.size };
}

export type AndroidExitDependencies = {
  timeoutMs?: number;
  waitForQueueIdle?: () => Promise<void>;
  flush?: () => Promise<OfflineFlushResult>;
  readQueue?: () => Promise<QueuedMutation[]>;
  readDurableRecord?: (key: string) => Promise<unknown | null>;
};

async function beforeExitDeadline<T>(operation: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Timed out while finishing local saves. The app was kept open.');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Timed out while finishing local saves. The app was kept open.')), remaining);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function prepareForAndroidExit(dependencies: AndroidExitDependencies = {}): Promise<OfflineFlushResult> {
  const timeoutMs = dependencies.timeoutMs ?? 15_000;
  const deadline = Date.now() + timeoutMs;
  await persistenceActivity.waitForIdle(timeoutMs);
  await beforeExitDeadline((dependencies.waitForQueueIdle ?? waitForQueueIdle)(), deadline);
  await beforeExitDeadline((dependencies.flush ?? (() => offlineStore.flush()))(), deadline);
  // A queue operation can schedule its final storage transaction while the
  // first activity wait is settling. Require a second stable idle boundary
  // before bypassing memory and validating native storage.
  await persistenceActivity.waitForIdle(Math.max(0, deadline - Date.now()));
  const queue = await beforeExitDeadline((dependencies.readQueue ?? (async () => (await readDurableOffline<QueuedMutation[]>('sync-queue-v1')) ?? getQueuedMutations()))(), deadline);
  const readRecord = dependencies.readDurableRecord ?? ((key: string) => readDurableOffline(key));
  return beforeExitDeadline(verifyPendingMutationRecords(queue, readRecord), deadline);
}

export async function executePreparedExit(
  prepare: () => Promise<OfflineFlushResult>,
  exit: () => Promise<void>,
) {
  const result = await prepare();
  await exit();
  return result;
}
