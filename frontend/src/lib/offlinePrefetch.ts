import { supabase } from './supabase';
import { offlineStore } from './localStore';
import { hasPendingMutationsForWorkspace } from './syncQueue';

type SnapshotRow = { domain: string; payload: unknown; revision: number };

/** Warm every app cache for a workspace without requiring the user to open each app. */
export async function prefetchWorkspaceData(workspaceId: string, userId: string) {
  if (!navigator.onLine) return;
  const snapshots = await supabase.from('app_state_snapshots').select('domain,payload,revision').eq('workspace_id', workspaceId);
  if (!snapshots.error) {
    for (const row of (snapshots.data as SnapshotRow[] | null) ?? []) {
      const separator = row.domain.indexOf(':');
      if (separator < 1) continue;
      const domain = row.domain.slice(0, separator);
      const key = row.domain.slice(separator + 1);
      if (domain === 'cash_book' || domain === 'payroll') {
        const storageKey = `${userId}:${workspaceId}:${domain}:${key}`;
        await offlineStore.write(storageKey, row.payload);
        await offlineStore.write(`${storageKey}:revision`, row.revision);
      }
    }
  }

  const [trucks, owners, transactions] = await Promise.all([
    supabase.from('trucks').select('id,name,unit_number,make_model,vin,cash_on_hand,license_plate').eq('workspace_id', workspaceId).is('deleted_at', null).order('created_at'),
    supabase.from('truck_owners').select('id,truck_id,name,start_date,equity_percentage,monthly_draw_rate,avatar_color').eq('workspace_id', workspaceId).is('deleted_at', null).order('created_at'),
    supabase.from('truck_transactions').select('id,truck_id,owner_id,occurred_on,transaction_type,category,amount,description,reference_no').eq('workspace_id', workspaceId).is('deleted_at', null).order('occurred_on', { ascending: false }),
  ]);
  if (trucks.error || owners.error || transactions.error) return;
  // A prefetch is allowed to warm an empty cache, but it must never replace
  // Truck data that still has local mutations waiting for synchronization.
  if (await hasPendingMutationsForWorkspace(workspaceId, ['trucks', 'truck_owners', 'truck_transactions'])) return;
  await offlineStore.write(`truck:${userId}:${workspaceId}`, {
    trucks: (trucks.data ?? []).map((row) => ({ id: row.id, name: row.name, unitNumber: row.unit_number, makeModel: row.make_model, vin: row.vin, cashOnHand: Number(row.cash_on_hand ?? 0), licensePlate: row.license_plate })),
    owners: (owners.data ?? []).map((row) => ({ id: row.id, truckId: row.truck_id, name: row.name, startDate: row.start_date, equityPercentage: Number(row.equity_percentage ?? 0), monthlyDrawRate: Number(row.monthly_draw_rate ?? 0), avatarColor: row.avatar_color })),
    transactions: (transactions.data ?? []).map((row) => ({ id: row.id, truckId: row.truck_id, date: row.occurred_on, type: row.transaction_type, category: row.category, amount: Number(row.amount ?? 0), ownerId: row.owner_id ?? undefined, description: row.description, referenceNo: row.reference_no ?? undefined })),
  });
}
