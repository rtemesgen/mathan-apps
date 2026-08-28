import { offlineStore, validateOfflineStorage } from './localStore';
import { getQueuedMutations } from './syncQueue';

export type OfflineDiagnosticRecord = {
  kind: 'cash-book' | 'payroll' | 'truck' | 'outbox' | 'other';
  scopeHash: string;
  counts: Record<string, number>;
};

export type OfflineDiagnosticMutation = {
  mutationId: string;
  table: string;
  entityType: string;
  entityId: string;
  operation: string;
  status: string;
  retryCount: number;
};

export type OfflineDiagnosticSnapshot = {
  capturedAt: string;
  build: { gitSha: string; assetHash: string; builtAt: string; diagnostics: boolean } | null;
  storage: Awaited<ReturnType<typeof validateOfflineStorage>>;
  records: OfflineDiagnosticRecord[];
  outbox: OfflineDiagnosticMutation[];
};

function recordKind(key: string): OfflineDiagnosticRecord['kind'] {
  if (key === 'sync-queue-v1') return 'outbox';
  if (key.includes(':cash_book:')) return 'cash-book';
  if (key.includes(':payroll:')) return 'payroll';
  if (key.startsWith('truck:')) return 'truck';
  return 'other';
}

function valueCounts(value: unknown) {
  if (Array.isArray(value)) return { items: value.length };
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => Array.isArray(item))
    .map(([name, item]) => [name, (item as unknown[]).length]));
}

async function shortHash(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest).slice(0, 6), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readBuildProvenance(): Promise<OfflineDiagnosticSnapshot['build']> {
  try {
    const response = await fetch('/build-provenance.json', { cache: 'no-store' });
    if (!response.ok) return null;
    const value = await response.json() as OfflineDiagnosticSnapshot['build'];
    return value && typeof value.gitSha === 'string' ? value : null;
  } catch {
    return null;
  }
}

/** Read-only and redacted. This intentionally exposes counts and stable IDs,
 * never business payloads, auth tokens, user IDs, workspace IDs, or secrets. */
export async function getOfflineDiagnosticSnapshot(): Promise<OfflineDiagnosticSnapshot> {
  const [storage, keys, queue, build] = await Promise.all([
    validateOfflineStorage(),
    offlineStore.listKeys(),
    getQueuedMutations(),
    readBuildProvenance(),
  ]);
  const records = await Promise.all(keys.sort().map(async (key) => ({
    kind: recordKind(key),
    scopeHash: await shortHash(key),
    counts: valueCounts(await offlineStore.read<unknown>(key)),
  })));
  return {
    capturedAt: new Date().toISOString(),
    build,
    storage,
    records,
    outbox: queue.map((mutation) => ({
      mutationId: mutation.mutationId,
      table: mutation.table,
      entityType: mutation.entityType,
      entityId: mutation.entityId,
      operation: mutation.operation,
      status: mutation.syncStatus,
      retryCount: mutation.retryCount,
    })),
  };
}
