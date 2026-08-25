import { supabase } from '../../lib/supabase';
import { offlineStore } from '../../lib/localStore';
import { enqueueMutationsAtomic, getWorkspaceMutationStatus, type QueuedMutationInput } from '../../lib/syncQueue';
import { syncQueue } from '../../lib/offlineSync';
import { reportPersistenceNotice, type PersistenceState } from '../../lib/repositories/types';
import type { Customer, Owner, Transaction, Truck } from './types';

export type TruckPersistenceStatus = 'saving' | 'saved locally' | 'offline saved' | 'sync pending' | 'storage error' | 'sync conflict';
const TRUCK_TABLES = ['trucks', 'truck_owners', 'truck_customers', 'truck_transactions'];

function reportTruckStatus(status: TruckPersistenceStatus) {
  reportPersistenceNotice({ app: 'truck', state: status as PersistenceState });
}

function explain(error: { message?: string; code?: string }) {
  if (error.code === '42P01' || error.code === 'PGRST205' || error.message?.toLowerCase().includes('could not find the table')) return new Error('Truck tables are not installed in Supabase yet. Run the Truck migrations, then refresh the app.');
  return error;
}

const truckFromDb = (r: Record<string, unknown>): Truck => ({ id: String(r.id), name: String(r.name ?? ''), unitNumber: String(r.unit_number ?? ''), makeModel: String(r.make_model ?? ''), vin: String(r.vin ?? ''), cashOnHand: Number(r.cash_on_hand ?? 0), licensePlate: String(r.license_plate ?? '') });
const ownerFromDb = (r: Record<string, unknown>): Owner => ({ id: String(r.id), truckId: String(r.truck_id), name: String(r.name ?? ''), startDate: String(r.start_date ?? ''), equityPercentage: Number(r.equity_percentage ?? 0), monthlyDrawRate: Number(r.monthly_draw_rate ?? 0), avatarColor: String(r.avatar_color ?? 'bg-slate-800 text-white') });
const customerFromDb = (r: Record<string, unknown>): Customer => ({ id: String(r.id), truckId: String(r.truck_id), name: String(r.name ?? ''), phone: r.phone ? String(r.phone) : undefined, address: r.address ? String(r.address) : undefined, notes: r.notes ? String(r.notes) : undefined });
const transactionFromDb = (r: Record<string, unknown>): Transaction => ({ id: String(r.id), truckId: String(r.truck_id), date: String(r.occurred_on), type: r.transaction_type as Transaction['type'], category: String(r.category ?? ''), amount: Number(r.amount ?? 0), ownerId: r.owner_id ? String(r.owner_id) : undefined, customerId: r.customer_id ? String(r.customer_id) : undefined, description: String(r.description ?? ''), referenceNo: r.reference_no ? String(r.reference_no) : undefined, counterpartyType: r.counterparty_type as Transaction['counterpartyType'] | undefined, counterpartyName: r.counterparty_name ? String(r.counterparty_name) : undefined, settlesTransactionId: r.settles_transaction_id ? String(r.settles_transaction_id) : undefined });

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

type TruckQueueWrite = { table: string; payload: Record<string, unknown> };

async function persistTruckChange(workspaceId: string, update: (cache: TruckCache) => TruckCache, writes: TruckQueueWrite[], localOnly: boolean, knownUserId?: string) {
  return withCacheLock(workspaceId, async () => {
    reportTruckStatus('saving');
    try {
      const { data } = await supabase.auth.getSession();
      const userId = knownUserId ?? data.session?.user.id ?? 'guest';
      const storageKey = `truck:${userId}:${workspaceId}`;
      const cached = await offlineStore.read<TruckCache>(storageKey);
      const next = update(cached ? { ...emptyCache(), ...cached, customers: cached.customers ?? [] } : emptyCache());
      if (localOnly || !writes.length) await offlineStore.write(storageKey, next);
      else {
        const mutations: QueuedMutationInput[] = writes.map(({ table, payload }) => ({
          mutationId: crypto.randomUUID(), userId, companyId: workspaceId,
          entityType: table, entityId: String(payload.id ?? ''), table,
          operation: 'upsert', payload: { ...payload, workspace_id: workspaceId },
        }));
        await enqueueMutationsAtomic(mutations, [{ key: storageKey, value: next }]);
      }
      reportTruckStatus(navigator.onLine ? 'saved locally' : 'offline saved');
      if (!localOnly && navigator.onLine) void syncQueue(workspaceId).catch(() => undefined);
      return next;
    } catch (error) {
      reportTruckStatus('storage error');
      throw error;
    }
  });
}

async function fetchTruckData(workspaceId: string) {
  const [trucks, owners, customers, transactions] = await Promise.all([
    supabase.from('trucks').select('*').eq('workspace_id', workspaceId).is('deleted_at', null).order('created_at'),
    supabase.from('truck_owners').select('*').eq('workspace_id', workspaceId).is('deleted_at', null).order('created_at'),
    supabase.from('truck_customers').select('*').eq('workspace_id', workspaceId).is('deleted_at', null).order('created_at'),
    supabase.from('truck_transactions').select('*').eq('workspace_id', workspaceId).is('deleted_at', null).order('occurred_on', { ascending: false }),
  ]);
  const error = trucks.error ?? owners.error ?? customers.error ?? transactions.error;
  if (error) throw explain(error);
  return {
    trucks: (trucks.data ?? []).map((r) => truckFromDb(r as Record<string, unknown>)),
    owners: (owners.data ?? []).map((r) => ownerFromDb(r as Record<string, unknown>)),
    customers: (customers.data ?? []).map((r) => customerFromDb(r as Record<string, unknown>)),
    transactions: (transactions.data ?? []).map((r) => transactionFromDb(r as Record<string, unknown>)),
  };
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
  catch (error) { if (cached.trucks.length || cached.owners.length || cached.transactions.length) return cached; throw error; }
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
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, trucks: [...cache.trucks.filter((item) => item.id !== truck.id), truck] }), [{ table: 'trucks', payload: row }], localOnly, userId);
  return truck;
}

export async function createTruckOwner(workspaceId: string, v: Omit<Owner, 'id'> & { userId?: string | null }, localOnly = false, userId?: string) {
  const row = { id: crypto.randomUUID(), workspace_id: workspaceId, truck_id: v.truckId, user_id: v.userId ?? null, name: v.name, start_date: v.startDate, equity_percentage: v.equityPercentage, monthly_draw_rate: v.monthlyDrawRate, avatar_color: v.avatarColor };
  const owner = ownerFromDb(row);
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, owners: [...cache.owners.filter((item) => item.id !== owner.id), owner] }), [{ table: 'truck_owners', payload: row }], localOnly, userId);
  return owner;
}

export async function createTruckCustomer(workspaceId: string, v: Omit<Customer, 'id'>, localOnly = false, userId?: string) {
  const row = { id: crypto.randomUUID(), workspace_id: workspaceId, truck_id: v.truckId, name: v.name.trim(), phone: v.phone?.trim() || null, address: v.address?.trim() || null, notes: v.notes?.trim() || null };
  const customer = customerFromDb(row);
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, customers: [...cache.customers.filter((item) => item.id !== customer.id), customer] }), [{ table: 'truck_customers', payload: row }], localOnly, userId);
  return customer;
}

export async function updateTruckCustomer(workspaceId: string, v: Customer, localOnly = false, userId?: string) {
  const row = { id: v.id, workspace_id: workspaceId, truck_id: v.truckId, name: v.name.trim(), phone: v.phone?.trim() || null, address: v.address?.trim() || null, notes: v.notes?.trim() || null, updated_at: new Date().toISOString() };
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, customers: cache.customers.map((item) => item.id === v.id ? v : item) }), [{ table: 'truck_customers', payload: row }], localOnly, userId);
  return v;
}

export async function deleteTruckCustomer(workspaceId: string, id: string, localOnly = false, userId?: string) {
  const deletedAt = new Date().toISOString();
  const row = { id, deleted_at: deletedAt, updated_at: deletedAt };
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, customers: cache.customers.filter((item) => item.id !== id) }), [{ table: 'truck_customers', payload: row }], localOnly, userId);
}

export async function updateTruckOwner(workspaceId: string, v: Owner, localOnly = false, userId?: string) {
  const row = { id: v.id, workspace_id: workspaceId, truck_id: v.truckId, name: v.name, start_date: v.startDate, equity_percentage: v.equityPercentage, monthly_draw_rate: v.monthlyDrawRate, avatar_color: v.avatarColor, updated_at: new Date().toISOString() };
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, owners: cache.owners.map((item) => item.id === v.id ? v : item) }), [{ table: 'truck_owners', payload: row }], localOnly, userId);
  return v;
}

export async function updateTruck(workspaceId: string, v: Truck, localOnly = false, userId?: string) {
  const row = { id: v.id, workspace_id: workspaceId, name: v.name, unit_number: v.unitNumber, make_model: v.makeModel, vin: v.vin, cash_on_hand: v.cashOnHand, license_plate: v.licensePlate, updated_at: new Date().toISOString() };
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, trucks: cache.trucks.map((item) => item.id === v.id ? v : item) }), [{ table: 'trucks', payload: row }], localOnly, userId);
  return v;
}

export async function deleteTruck(workspaceId: string, id: string, localOnly = false, userId?: string) {
  const deletedAt = new Date().toISOString();
  const row = { id, deleted_at: deletedAt, updated_at: deletedAt };
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, trucks: cache.trucks.filter((item) => item.id !== id) }), [{ table: 'trucks', payload: row }], localOnly, userId);
}

export async function createTruckTransaction(workspaceId: string, v: Omit<Transaction, 'id'>, localOnly = false, userId?: string) {
  const row = { id: crypto.randomUUID(), workspace_id: workspaceId, truck_id: v.truckId, owner_id: v.ownerId ?? null, customer_id: v.customerId ?? null, occurred_on: v.date, transaction_type: v.type, category: v.category, amount: v.amount, description: v.description, reference_no: v.referenceNo ?? null, counterparty_type: v.counterpartyType ?? null, counterparty_name: v.counterpartyName ?? null, settles_transaction_id: v.settlesTransactionId ?? null };
  const transaction = transactionFromDb(row);
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, transactions: [...cache.transactions.filter((item) => item.id !== transaction.id), transaction] }), [{ table: 'truck_transactions', payload: row }], localOnly, userId);
  return transaction;
}

export async function createTruckTransactionBatch(workspaceId: string, values: Omit<Transaction, 'id'>[], localOnly = false, userId?: string) {
  if (!values.length) return [];
  const rows = values.map((v) => ({ id: crypto.randomUUID(), workspace_id: workspaceId, truck_id: v.truckId, owner_id: v.ownerId ?? null, customer_id: v.customerId ?? null, occurred_on: v.date, transaction_type: v.type, category: v.category, amount: v.amount, description: v.description, reference_no: v.referenceNo ?? null, counterparty_type: v.counterpartyType ?? null, counterparty_name: v.counterpartyName ?? null, settles_transaction_id: v.settlesTransactionId ?? null }));
  const transactions = rows.map((row) => transactionFromDb(row));
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, transactions: [...transactions, ...cache.transactions] }), rows.map((payload) => ({ table: 'truck_transactions', payload })), localOnly, userId);
  return transactions;
}

export async function updateTruckTransaction(workspaceId: string, v: Transaction, localOnly = false, userId?: string) {
  const row = { id: v.id, workspace_id: workspaceId, truck_id: v.truckId, owner_id: v.ownerId ?? null, customer_id: v.customerId ?? null, occurred_on: v.date, transaction_type: v.type, category: v.category, amount: v.amount, description: v.description, reference_no: v.referenceNo ?? null, counterparty_type: v.counterpartyType ?? null, counterparty_name: v.counterpartyName ?? null, settles_transaction_id: v.settlesTransactionId ?? null, updated_at: new Date().toISOString() };
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, transactions: cache.transactions.map((item) => item.id === v.id ? v : item) }), [{ table: 'truck_transactions', payload: row }], localOnly, userId);
  return v;
}

export async function softDeleteTruckTransaction(workspaceId: string, id: string, localOnly = false, userId?: string) {
  const deletedAt = new Date().toISOString();
  const row = { id, deleted_at: deletedAt, updated_at: deletedAt };
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, transactions: cache.transactions.filter((item) => item.id !== id) }), [{ table: 'truck_transactions', payload: row }], localOnly, userId);
}

export async function deleteTruckOwner(workspaceId: string, id: string, localOnly = false, userId?: string) {
  const deletedAt = new Date().toISOString();
  const row = { id, deleted_at: deletedAt, updated_at: deletedAt };
  await persistTruckChange(workspaceId, (cache) => ({ ...cache, owners: cache.owners.filter((item) => item.id !== id) }), [{ table: 'truck_owners', payload: row }], localOnly, userId);
}

export async function loadTruckWorkspaceMembers(workspaceId: string) { const { data, error } = await supabase.rpc('list_workspace_members', { target_workspace: workspaceId }); if (error) throw error; return (data ?? []) as Array<{ user_id: string; email: string; display_name: string }>; }
