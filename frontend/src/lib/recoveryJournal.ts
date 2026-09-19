export type RecoveryEntry = { value?: unknown; commitId: string; deleted?: boolean };
export type RecoveryRecord = Record<string, RecoveryEntry>;
export type RecoveryReceipt = { commitId?: string; deleted?: boolean };

export function parseRecoveryRecord(raw: string | null): RecoveryRecord {
  if (raw === null) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed).flatMap(([key, entry]) => {
    if (entry && typeof entry === 'object' && !Array.isArray(entry) && typeof (entry as { commitId?: unknown }).commitId === 'string' && ('value' in entry || (entry as { deleted?: unknown }).deleted === true)) {
      return [[key, entry as RecoveryEntry]];
    }
    return [[key, { value: entry, commitId: 'legacy-v1' } satisfies RecoveryEntry]];
  }));
}

export function createRecoveryBatch(
  existing: RecoveryRecord,
  entries: Array<{ key: string; value: unknown }>,
  commitId: string,
): RecoveryRecord {
  const next = { ...existing };
  entries.forEach(({ key, value }) => { next[key] = { value, commitId }; });
  return next;
}

export function createRecoveryDeleteBatch(existing: RecoveryRecord, keys: string[], commitId: string): RecoveryRecord {
  const next = { ...existing };
  keys.forEach((key) => { next[key] = { commitId, deleted: true }; });
  return next;
}

export function selectRecoveredValue<T>(
  recovery: RecoveryEntry | undefined,
  receipt: RecoveryReceipt | undefined,
  primaryValue: T | undefined,
  legacyFallback: T | null | undefined,
): T | null {
  if (recovery?.deleted || receipt?.deleted) return null;
  if (recovery && receipt?.commitId === recovery.commitId) return primaryValue ?? null;
  return (recovery?.value as T | null) ?? legacyFallback ?? primaryValue ?? null;
}
