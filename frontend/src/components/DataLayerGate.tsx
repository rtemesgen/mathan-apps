import { useEffect, useState, type ReactNode } from 'react';
import { offlineStore, validateOfflineStorage, type OfflineStorageHealth } from '../lib/localStore';
import { recoverStaleQueuedMutations } from '../lib/syncQueue';
import { diagnostic } from '../lib/diagnostics';
import { businessRecordShapeError, isBusinessHealthKey } from '../lib/dataLayerHealth';

export function DataLayerGate({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<OfflineStorageHealth | null>(null);

  useEffect(() => {
    let active = true;
    void validateOfflineStorage().then(async (result) => {
      if (result.healthy) {
        const keys = await offlineStore.listKeys();
        const invalidRecords: string[] = [];
        for (const key of keys.filter(isBusinessHealthKey)) {
          const value = await offlineStore.read<unknown>(key);
          const error = businessRecordShapeError(key, value);
          if (error) invalidRecords.push(`${key}: ${error}`);
        }
        if (invalidRecords.length) {
          result = { ...result, healthy: false, message: `Local business cache validation failed (${invalidRecords.slice(0, 3).join('; ')}). Existing records were preserved.` };
        }
      }
      if (result.healthy) {
        const before = Date.now();
        const queue = await recoverStaleQueuedMutations();
        diagnostic('sync-lock-recovery', { elapsedMs: Date.now() - before });
        const invalid = queue.filter((mutation) => !mutation.mutationId || !mutation.companyId || !mutation.table || !mutation.entityId);
        if (invalid.length) {
          result = { ...result, healthy: false, message: `${invalid.length} pending mutation record(s) have invalid company or entity scope. They were preserved and synchronization was stopped.` };
        }
      }
      if (active) setHealth(result);
    }).catch((error) => {
      if (active) setHealth({ healthy: false, adapter: 'indexeddb', schemaVersion: 0, message: error instanceof Error ? error.message : 'Local data validation failed.' });
    });
    return () => { active = false; };
  }, []);

  if (!health) return <main className="flex min-h-screen items-center justify-center bg-[#f6f5ef] text-sm font-semibold text-zinc-500">Checking local data…</main>;
  if (health.healthy) return <>{children}</>;
  return <main className="flex min-h-screen items-center justify-center bg-[#f6f5ef] p-5 text-zinc-900"><section role="alert" className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-6 shadow-xl"><h1 className="font-serif text-2xl font-bold">Local data needs recovery</h1><p className="mt-3 text-sm leading-6 text-zinc-600">Mathan ERP stopped before loading company records because the local database did not pass its safety check. No cache or pending mutation was deleted.</p><p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{health.message}</p><button type="button" onClick={() => window.location.reload()} className="mt-5 w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white">Check again</button></section></main>;
}
