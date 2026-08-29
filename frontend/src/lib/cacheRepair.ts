import { offlineStore } from './localStore';

const repairKey = (userId: string, workspaceId: string, scope: string) =>
  `cache-repair-v1:${userId}:${workspaceId}:${scope}`;

/**
 * A server write can succeed even when the subsequent local-cache write does
 * not. Record that state separately so a later authoritative refresh can
 * repair the cache without replaying the business mutation.
 *
 * Metadata is deliberately best effort: if the storage adapter itself is
 * unavailable, the caller still reports the cache failure and the next online
 * startup refresh remains the recovery path.
 */
export async function recordCacheRepair(userId: string, workspaceId: string, scope: string) {
  await offlineStore.writeMetadata(repairKey(userId, workspaceId, scope), {
    userId,
    companyId: workspaceId,
    scope,
    recordedAt: new Date().toISOString(),
  });
}

export async function clearCacheRepair(userId: string, workspaceId: string, scope: string) {
  await offlineStore.writeMetadata(repairKey(userId, workspaceId, scope), null);
}
