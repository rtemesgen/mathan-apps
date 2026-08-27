import { supabase } from '../../lib/supabase';
import { offlineStore } from '../../lib/localStore';
import { getWorkspaceMutationStatus } from '../../lib/syncQueue';
import { syncQueue, writeTruckMutationOnline } from '../../lib/offlineSync';
import { reportPersistenceNotice, type PersistenceState } from '../../lib/repositories/types';
import { isConnectivityFailure, withConnectionTimeout } from '../../lib/connectivity';
import { diagnostic } from '../../lib/diagnostics';
import { recordCacheRepair } from '../../lib/cacheRepair';
import { saveOfflineFallback } from '../../lib/durablePersistence';
import type { Customer, Owner, Transaction, Truck } from './types';

export type TruckPersistenceStatus = 'saving' | 'saved' | 'saved locally' | 'offline saved' | 'sync pending' | 'storage error' | 'sync conflict';
const TRUCK_TABLES = ['trucks', 'truck_owners', 'truck_customers', 'truck_transactions'];

function reportTruckStatus(status: TruckPersistenceStatus) {
  reportPersistenceNotice({ app: 'truck', state: status as PersistenceState });
}

function explain(error: { message?: string; code?: string }) {
  if (error.code === '42P01' || error.code === 'PGRST205' || error.message?.toLowerCase().includes('could not find the table')) return new Error('Truck tables are not installed in Supabase yet. Run the Truck migrations, then refresh the app.');
  return error;
}

const updatedAt = (r: Record<string, unknown>) => r.updated_at ? String(r.updated_at) : undefined;
const truckFromDb = (r: Record<string, unknown>): Truck => ({ id: String(r.id), name: String(r.name ?? ''), unitNumber: String(r.unit_number ?? ''), makeModel: String(r.make_model ?? ''), vin: String(r.vin ?? ''), cashOnHand: Number(r.cash_on_hand ?? 0), licensePlate: String(r.license_plate ?? ''), updatedAt: updatedAt(r) });
const ownerFromDb = (r: Record<string, unknown>): Owner => ({ id: String(r.id), truckId: String(r.truck_id), name: String(r.name ?? ''), startDate: String(r.start_date ?? ''), equityPercentage: Number(r.equity_percentage ?? 0), monthlyDrawRate: Number(r.monthly_draw_rate ?? 0), avatarColor: String(r.avatar_color ?? 'bg-slate-800 text-white'), updatedAt: updatedAt(r) });
const customerFromDb = (r: Record<string, unknown>): Customer => ({ id: String(r.id), truckId: String(r.truck_id), name: String(r.name ?? ''), phone: r.phone ? String(r.phone) : undefined, address: r.address ? String(r.address) : undefined, notes: r.notes ? String(r.notes) : undefined, updatedAt: updatedAt(r) });
const transactionFromDb = (r: Record<string, unknown>): Transaction => ({ id: String(r.id), truckId: String(r.truck_id), date: String(r.occurred_on), type: r.transaction_type as Transaction['type'], category: String(r.category ?? ''), amount: Number(r.amount ?? 0), ownerId: r.owner_id ? String(r.owner_id) : undefined, customerId: r.customer_id ? String(r.customer_id) : undefined, description: String(r.description ?? ''), referenceNo: r.reference_no ? String(r.reference_no) : undefined, counterpartyType: r.counterparty_type as Transaction['counterpartyType'] | undefined, counterpartyName: r.counterparty_name ? String(r.counterparty_name) : undefined, settlesTransactionId: r.settles_transaction_id ? String(r.settles_transaction_id) : undefined, updatedAt: updatedAt(r) });

export type TruckCache = { trucks: Truck[]; owners: Owner[]; customers: Customer[]; transactions: Transaction[] };
const cacheKey = async (workspaceId: string, userId?: string) => {
  if (userId) return `truck:${userId}:${workspaceId}`;
  const { data } = await supabase.auth.getSession();
  return `truck:${data.session?.user.id ?? 'guest'}:${workspaceId}`;
};
const emptyCache = (): TruckCache => ({ trucks: [], owners: [], customers: [], transactions: [] });
const cacheTails = new Map<string, Promise<void>>();

function withCacheLock<T>(workspaceId: string, operation: () => Promise<T>) {
  const previous = cacheTails.get(workspaceId) ?? Promise.resolve();
  const result = previous.then(operation, operation);
  const tail = result.then(() => undefined, () => undefined);
  cacheTails.set(workspaceId, tail);
  return result.finally(() => { if (cacheTails.get(workspaceId) === tail) cacheTails.delete(workspaceId); });
}

async function getCache(workspaceId: string, userId?: string) { const cached = await offlineStore.read<TruckCache>(await cacheKey(workspaceId, userId)); return cached ? { ...emptyCache(), ...cached, customers: cached.customers ?? [] } : emptyCache(); }

async function saveCache(workspaceId: string, value: TruckCache, userId?: string) {
  await offlineStore.write(await cacheKey(workspaceId, userId), value);
}

type TruckQueueWrite = { table: string; payload: Record<string, unknown>; operation: 'create' | 'update' | 'delete' };

function cachedUpdatedAt(cache: TruckCache, table: string, id: string) {
  const collection = table === 'trucks' ? cache.trucks : table === 'truck_owners' ? cache.owners : table === 'truck_customers' ? cache.customers : cache.transactions;
  return collection.find((item) => item.id === id)?.updatedAt ?? null;
}

function applyConfirmedTruckRows(cache: TruckCache, writes: TruckQueueWrite[], rows: Array<Record<string, unknown> | null>) {
  const confirmed = { ...cache, trucks: [...cache.trucks], owners: [...cache.owners], customers: [...cache.customers], transactions: [...cache.transactions] };
  writes.forEach(({ table, operation }, index) => {
    const row = rows[index];
    if (!row || operation === 'delete') return;
    const value = table === 'trucks' ? truckFromDb(row)
      : table === 'truck_owners' ? ownerFromDb(row)
      : table === 'truck_customers' ? customerFromDb(row)
      : transactionFromDb(row);
    const collection = table === 'trucks' ? confirmed.trucks
      : table === 'truck_owners' ? confirmed.owners
      : table === 'truck_customers' ? confirmed.customers
      : confirmed.transactions;
    const existing = collection.findIndex((item) => item.id === value.id);
    if (existing >= 0) collection[existing] = value as never;
    else collection.push(value as never);
  });
  return confirmed;
}

async function persistTruckChange(workspaceId: string, update: (cache: TruckCache) => TruckCache, writes: TruckQueueWrite[], localOnly: boolean, knownUserId?: string) {
  return withCacheLock(workspaceId, async () => {
    reportTruckStatus('saving');
    try {
      // The workspace/auth provider already supplies the signed-in ID in the
      // normal path. Avoid waiting on Supabase auth storage for every local
      // Truck save; only resolve a session for legacy callers that omit it.
      const userId = knownUserId ?? (await supabase.auth.getSession()).data.session?.user.id ?? 'guest';
      const storageKey = `truck:${userId}:${workspaceId}`;
      const cached = await offlineStore.read<TruckCache>(storageKey);
      const currentCache = cached ? { ...emptyCache(), ...cached, customers: cached.customers ?? [] } : emptyCache();
      const next = update(currentCache);
      // Allocate identities before the first network attempt. If PostgreSQL
      // commits but the response is lost, the fallback queue must retry with
      // the same ID that the server row already acknowledges.
      const durableWrites = writes.map((write) => ({ ...write, mutationId: crypto.randomUUID() }));
      if (localOnly || !navigator.onLine || !writes.length) {
        if (localOnly || !writes.length) await offlineStore.write(storageKey, next);
        else {
          await saveOfflineFallback(durableWrites.map(({ table, payload, operation, mutationId }) => ({
            mutationId, userId, companyId: workspaceId,
            entityType: table, entityId: String(payload.id ?? ''), table,
            operation, baseServerUpdatedAt: operation === 'create' ? null : cachedUpdatedAt(currentCache, table, String(payload.id ?? '')), payload: { ...payload, workspace_id: workspaceId },
          })), [{ key: storageKey, value: next }]);
        }
      } else {
        // Online-first: write relational Truck rows to Supabase directly. The
        // cache is updated only after every row is accepted by the server.
        const pendingStatus = await getWorkspaceMutationStatus(workspaceId, TRUCK_TABLES);
        if (pendingStatus) {
          try { await syncQueue(workspaceId); } catch { /* the queue remains the source of truth */ }
          const remainingStatus = await getWorkspaceMutationStatus(workspaceId, TRUCK_TABLES);
          if (remainingStatus) {
            reportTruckStatus(remainingStatus === 'conflict' ? 'sync conflict' : 'sync pending');
            diagnostic('local-write-queued', { app: 'truck', workspaceId, operation: 'truck', reason: 'earlier-mutation-unresolved' });
            return next;
          }
        }
        try {
          diagnostic('online-save-attempt', { app: 'truck', workspaceId, operation: 'truck' });
          const confirmedRows = await Promise.all(durableWrites.map(({ table, payload, operation, mutationId }) => withConnectionTimeout(writeTruckMutationOnline(workspaceId, table, { ...payload, workspace_id: workspaceId }, operation, operation === 'create' ? null : cachedUpdatedAt(currentCache, table, String(payload.id ?? '')), mutationId))));
          try {
            await offlineStore.write(storageKey, applyConfirmedTruckRows(next, writes, confirmedRows));
          } catch (cacheError) {
            // The relational write is already authoritative. Mark the cache
            // for refresh instead of queuing a second business mutation.
            await recordCacheRepair(userId, workspaceId, 'truck');
            throw cacheError;
          }
          diagnostic('online-save-success', { app: 'truck', workspaceId, operation: 'truck' });
        } catch (error) {
          if (!isConnectivityFailure(error)) throw error;
          await saveOfflineFallback(durableWrites.map(({ table, payload, operation, mutationId }) => ({
              mutationId, userId, companyId: workspaceId,
              entityType: table, entityId: String(payload.id ?? ''), table,
              operation, baseServerUpdatedAt: operation === 'create' ? null : cachedUpdatedAt(currentCache, table, String(payload.id ?? '')), payload: { ...payload, workspace_id: workspaceId },
            })), [{ key: storageKey, value: next }]);
          reportTruckStatus('offline saved');
          diagnostic('offline-fallback', { app: 'truck', workspaceId, operation: 'truck' });
          return next;
        }
      }
      reportTruckStatus(navigator.onLine ? 'saved' : 'offline saved');
      return next;
    } catch (error) {
      if ((error as { code?: string })?.code === 'CONFLICT') reportTruckStatus('sync conflict');
      else reportTruckStatus('storage error');
      throw error;
    }
  });
}

async function fetchTruckData(workspaceId: string) {
  diagnostic('supabase-fetch-start', { app: 'truck', workspaceId, entity: 'truck-dataset' });
  const [trucks, owners, customers, transactions] = await withConnectionTimeout(Promise.all([
    supabase.from('trucks').select('*').eq('workspace_id', workspaceId).is('deleted_at', null).order('created_at'),
    supabase.from('truck_owners').select('*').eq('workspace_id', workspaceId).is('deleted_at', null).order('created_at'),
    supabase.from('truck_customers').select('*').eq('workspace_id', workspaceId).is('deleted_at', null).order('created_at'),
    supabase.from('truck_transactions').select('*').eq('workspace_id', workspaceId).is('deleted_at', null).order('occurred_on', { ascending: false }),
  ]));
  const error = trucks.error ?? owners.error ?? customers.error ?? transactions.error;
  if (error) {
    diagnostic('supabase-fetch-error', { app: 'truck', workspaceId, entity: 'truck-dataset', code: error.code ?? 'unknown' });
    throw explain(error);
  }
  const result = {
    trucks: (trucks.data ?? []).map((r) => truckFromDb(r as Record<string, unknown>)),
    owners: (owners.data ?? []).map((r) => ownerFromDb(r as Record<string, unknown>)),
    customers: (customers.data ?? []).map((r) => customerFromDb(r as Record<string, unknown>)),
    transactions: (transactions.data ?? []).map((r) => transactionFromDb(r as Record<string, unknown>)),
  };
  diagnostic('supabase-fetch-success', { app: 'truck', workspaceId, entity: 'truck-dataset', empty: !result.trucks.length && !result.owners.length && !result.customers.length && !result.transactions.length });
  return result;
}

export async function loadTruckData(workspaceId: string, localOnly = false, userId?: string) {
  const cached = await getCache(workspaceId, userId);
  if (localOnly) return cached;
  if (!navigator.onLine) {
    const mutationStatus = await getWorkspaceMutationStatus(workspaceId, TRUCK_TABLES);
    if (mutationStatus === 'conflict') reportTruckStatus('sync conflict');
    else if (mutationStatus === 'pending') reportTruckStatus('sync pending');
    return cached;
  }
  try { return await refreshTruckDataFromCloud(workspaceId, userId); }
  catch (error) {
    // A failed request is not a successful empty response. Keep the durable
    // local snapshot (including any optimistic records written alongside the
    // outbox) as the effective dataset even when the valid snapshot happens
    // to contain no rows. This is what lets a newly-created empty workspace
    // render offline without turning a transport failure into a data reset.
    diagnostic('offline-fallback', {
      app: 'truck',
      workspaceId,
      operation: 'cloud-fetch',
      error: error instanceof Error ? error.message : String(error),
    });
    return cached;
  }
}

export async function refreshTruckDataFromCloud(workspaceId: string, userId?: string) {
  return withCacheLock(workspaceId, async () => {
    const mutationStatus = await getWorkspaceMutationStatus(workspaceId, TRUCK_TABLES);
    if (mutationStatus === 'conflict') { reportTruckStatus('sync conflict'); return getCache(workspaceId, userId); }
    if (mutationStatus === 'pending') { reportTruckStatus('sync pending'); return getCache(workspaceId, userId); }
    const next = await fetchTruckData(workspaceId);
    await saveCache(workspaceId, next, userId);
    return next;
  });
}

/** Synchronize queued Truck mutations, then refresh only when the repository can safely replace local data. */
export async function synchronizeTruckData(workspaceId: string, userId?: string) {
  await syncQueue(workspaceId);
  return refreshTruckDataFromCloud(workspaceId, userId);
}

export async function createTruck(workspaceId: string, v: Omit<Truck, 'id'>, localOnly = false, userId?: string) {
  const row = { id: crypto.randomUUID(), workspace_id: workspaceId, name: v.name.trim(), unit_number: v.unitNumber.trim(), make_model: v.makeModel.trim(), vin: v.vin.trim(), cash_on_hand: v.cashOnHand, license_plate: v.licensePlate.trim() };
  const truck = truckFromDb(row);
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, trucks: [...cache.trucks.filter((item) => item.id !== truck.id), truck] }), [{ table: 'trucks', payload: row, operation: 'create' }], localOnly, userId);
  return truck;
}

export async function createTruckOwner(workspaceId: string, v: Omit<Owner, 'id'> & { userId?: string | null }, localOnly = false, userId?: string) {
  const row = { id: crypto.randomUUID(), workspace_id: workspaceId, truck_id: v.truckId, user_id: v.userId ?? null, name: v.name, start_date: v.startDate, equity_percentage: v.equityPercentage, monthly_draw_rate: v.monthlyDrawRate, avatar_color: v.avatarColor };
  const owner = ownerFromDb(row);
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, owners: [...cache.owners.filter((item) => item.id !== owner.id), owner] }), [{ table: 'truck_owners', payload: row, operation: 'create' }], localOnly, userId);
  return owner;
}

export async function createTruckCustomer(workspaceId: string, v: Omit<Customer, 'id'>, localOnly = false, userId?: string) {
  const row = { id: crypto.randomUUID(), workspace_id: workspaceId, truck_id: v.truckId, name: v.name.trim(), phone: v.phone?.trim() || null, address: v.address?.trim() || null, notes: v.notes?.trim() || null };
  const customer = customerFromDb(row);
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, customers: [...cache.customers.filter((item) => item.id !== customer.id), customer] }), [{ table: 'truck_customers', payload: row, operation: 'create' }], localOnly, userId);
  return customer;
}

export async function updateTruckCustomer(workspaceId: string, v: Customer, localOnly = false, userId?: string) {
  const row = { id: v.id, workspace_id: workspaceId, truck_id: v.truckId, name: v.name.trim(), phone: v.phone?.trim() || null, address: v.address?.trim() || null, notes: v.notes?.trim() || null, updated_at: new Date().toISOString() };
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, customers: cache.customers.map((item) => item.id === v.id ? v : item) }), [{ table: 'truck_customers', payload: row, operation: 'update' }], localOnly, userId);
  return v;
}

export async function deleteTruckCustomer(workspaceId: string, id: string, localOnly = false, userId?: string) {
  const deletedAt = new Date().toISOString();
  const row = { id, deleted_at: deletedAt, updated_at: deletedAt };
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, customers: cache.customers.filter((item) => item.id !== id) }), [{ table: 'truck_customers', payload: row, operation: 'delete' }], localOnly, userId);
}

export async function updateTruckOwner(workspaceId: string, v: Owner, localOnly = false, userId?: string) {
  const row = { id: v.id, workspace_id: workspaceId, truck_id: v.truckId, name: v.name, start_date: v.startDate, equity_percentage: v.equityPercentage, monthly_draw_rate: v.monthlyDrawRate, avatar_color: v.avatarColor, updated_at: new Date().toISOString() };
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, owners: cache.owners.map((item) => item.id === v.id ? v : item) }), [{ table: 'truck_owners', payload: row, operation: 'update' }], localOnly, userId);
  return v;
}

export async function updateTruck(workspaceId: string, v: Truck, localOnly = false, userId?: string) {
  const row = { id: v.id, workspace_id: workspaceId, name: v.name, unit_number: v.unitNumber, make_model: v.makeModel, vin: v.vin, cash_on_hand: v.cashOnHand, license_plate: v.licensePlate, updated_at: new Date().toISOString() };
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, trucks: cache.trucks.map((item) => item.id === v.id ? v : item) }), [{ table: 'trucks', payload: row, operation: 'update' }], localOnly, userId);
  return v;
}

export async function deleteTruck(workspaceId: string, id: string, localOnly = false, userId?: string) {
  const deletedAt = new Date().toISOString();
  const row = { id, deleted_at: deletedAt, updated_at: deletedAt };
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, trucks: cache.trucks.filter((item) => item.id !== id) }), [{ table: 'trucks', payload: row, operation: 'delete' }], localOnly, userId);
}

export async function createTruckTransaction(workspaceId: string, v: Omit<Transaction, 'id'>, localOnly = false, userId?: string) {
  const row = { id: crypto.randomUUID(), workspace_id: workspaceId, truck_id: v.truckId, owner_id: v.ownerId ?? null, customer_id: v.customerId ?? null, occurred_on: v.date, transaction_type: v.type, category: v.category, amount: v.amount, description: v.description, reference_no: v.referenceNo ?? null, counterparty_type: v.counterpartyType ?? null, counterparty_name: v.counterpartyName ?? null, settles_transaction_id: v.settlesTransactionId ?? null };
  const transaction = transactionFromDb(row);
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, transactions: [...cache.transactions.filter((item) => item.id !== transaction.id), transaction] }), [{ table: 'truck_transactions', payload: row, operation: 'create' }], localOnly, userId);
  return transaction;
}

export async function createTruckTransactionBatch(workspaceId: string, values: Omit<Transaction, 'id'>[], localOnly = false, userId?: string) {
  if (!values.length) return [];
  const rows = values.map((v) => ({ id: crypto.randomUUID(), workspace_id: workspaceId, truck_id: v.truckId, owner_id: v.ownerId ?? null, customer_id: v.customerId ?? null, occurred_on: v.date, transaction_type: v.type, category: v.category, amount: v.amount, description: v.description, reference_no: v.referenceNo ?? null, counterparty_type: v.counterpartyType ?? null, counterparty_name: v.counterpartyName ?? null, settles_transaction_id: v.settlesTransactionId ?? null }));
  const transactions = rows.map((row) => transactionFromDb(row));
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, transactions: [...transactions, ...cache.transactions] }), rows.map((payload) => ({ table: 'truck_transactions', payload, operation: 'create' })), localOnly, userId);
  return transactions;
}

export async function updateTruckTransaction(workspaceId: string, v: Transaction, localOnly = false, userId?: string) {
  const row = { id: v.id, workspace_id: workspaceId, truck_id: v.truckId, owner_id: v.ownerId ?? null, customer_id: v.customerId ?? null, occurred_on: v.date, transaction_type: v.type, category: v.category, amount: v.amount, description: v.description, reference_no: v.referenceNo ?? null, counterparty_type: v.counterpartyType ?? null, counterparty_name: v.counterpartyName ?? null, settles_transaction_id: v.settlesTransactionId ?? null, updated_at: new Date().toISOString() };
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, transactions: cache.transactions.map((item) => item.id === v.id ? v : item) }), [{ table: 'truck_transactions', payload: row, operation: 'update' }], localOnly, userId);
  return v;
}

export async function softDeleteTruckTransaction(workspaceId: string, id: string, localOnly = false, userId?: string) {
  const deletedAt = new Date().toISOString();
  const row = { id, deleted_at: deletedAt, updated_at: deletedAt };
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, transactions: cache.transactions.filter((item) => item.id !== id) }), [{ table: 'truck_transactions', payload: row, operation: 'delete' }], localOnly, userId);
}

export async function deleteTruckOwner(workspaceId: string, id: string, localOnly = false, userId?: string) {
  const deletedAt = new Date().toISOString();
  const row = { id, deleted_at: deletedAt, updated_at: deletedAt };
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, owners: cache.owners.filter((item) => item.id !== id) }), [{ table: 'truck_owners', payload: row, operation: 'delete' }], localOnly, userId);
}

export async function loadTruckWorkspaceMembers(workspaceId: string) { const { data, error } = await supabase.rpc('list_workspace_members', { target_workspace: workspaceId }); if (error) throw error; return (data ?? []) as Array<{ user_id: string; email: string; display_name: string }>; }
