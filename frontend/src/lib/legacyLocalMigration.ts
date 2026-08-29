import { offlineStore } from './localStore';
import { diagnostic } from './diagnostics';

const SNAPSHOT_KEYS = [
  ['cash_book', 'books'],
  ['cash_book', 'transactions'],
  ['payroll', 'employees'],
  ['payroll', 'transactions'],
] as const;

export function legacySnapshotKeyMappings(userId: string, workspaceId: string) {
  return SNAPSHOT_KEYS.map(([domain, key]) => ({
    legacyKey: `${workspaceId}:${domain}:${key}`,
    currentKey: `${userId}:${workspaceId}:${domain}:${key}`,
  }));
}

/** Copy pre-user-scoping snapshots into current keys without deleting or
 * overwriting either source. A failed copy leaves the legacy key recoverable. */
export async function migrateLegacySnapshotKeys(userId: string, workspaceIds: string[]) {
  let migrated = 0;
  for (const workspaceId of [...new Set(workspaceIds)].filter(Boolean)) {
    for (const { legacyKey, currentKey } of legacySnapshotKeyMappings(userId, workspaceId)) {
      const current = await offlineStore.read<unknown>(currentKey);
      if (current !== null) continue;
      const legacy = await offlineStore.read<unknown>(legacyKey);
      if (legacy === null) continue;
      const legacyRevision = await offlineStore.read<number>(`${legacyKey}:revision`);
      await offlineStore.writeAtomic([
        { key: currentKey, value: legacy },
        { key: `${currentKey}:revision`, value: legacyRevision ?? 0 },
      ]);
      const verified = await offlineStore.read<unknown>(currentKey);
      if (JSON.stringify(verified) !== JSON.stringify(legacy)) throw new Error(`Legacy cache migration verification failed for ${workspaceId}`);
      migrated += 1;
    }
  }
  if (migrated) diagnostic('migration-completed', { adapter: 'offline-records', userId, migrated });
  return migrated;
}
