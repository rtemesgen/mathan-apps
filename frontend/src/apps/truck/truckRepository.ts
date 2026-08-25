import { supabase } from '../../lib/supabase';
import { offlineStore } from '../../lib/localStore';
import { enqueueMutation, getWorkspaceMutationStatus } from '../../lib/syncQueue';
import { syncQueue } from '../../lib/offlineSync';
import { reportPersistenceNotice, type PersistenceState } from '../../lib/repositories/types';
import type { Owner, Transaction, Truck } from './types';

export type TruckPersistenceStatus = 'saving' | 'saved locally' | 'offline saved' | 'sync pending' | 'storage error' | 'sync conflict';
const TRUCK_TABLES = ['trucks', 'truck_owners', 'truck_transactions'];

function reportTruckStatus(status: TruckPersistenceStatus) {
  reportPersistenceNotice({ app: 'truck', state: status as PersistenceState });
}

function explain(error: { message?: string; code?: string }) {
  if (error.code === '42P01' || error.code === 'PGRST205' || error.message?.toLowerCase().includes('could not find the table')) return new Error('Truck tables are not installed in Supabase yet. Run the Truck migrations, then refresh the app.');
  return error;
}

const truckFromDb = (r: Record<string, unknown>): Truck => ({ id: String(r.id), name: String(r.name ?? ''), unitNumber: String(r.unit_number ?? ''), makeModel: String(r.make_model ?? ''), vin: String(r.vin ?? ''), cashOnHand: Number(r.cash_on_hand ?? 0), licensePlate: String(r.license_plate ?? '') });
const ownerFromDb = (r: Record<string, unknown>): Owner => ({ id: String(r.id), truckId: String(r.truck_id), name: String(r.name ?? ''), startDate: String(r.start_date ?? ''), equityPercentage: Number(r.equity_percentage ?? 0), monthlyDrawRate: Number(r.monthly_draw_rate ?? 0), avatarColor: String(r.avatar_color ?? 'bg-slate-800 text-white') });
const transactionFromDb = (r: Record<string, unknown>): Transaction => ({ id: String(r.id), truckId: String(r.truck_id), date: String(r.occurred_on), type: r.transaction_type as Transaction['type'], category: String(r.category ?? ''), amount: Number(r.amount ?? 0), ownerId: r.owner_id ? String(r.owner_id) : undefined, description: String(r.description ?? ''), referenceNo: r.reference_no ? String(r.reference_no) : undefined });

export type TruckCache = { trucks: Truck[]; owners: Owner[]; transactions: Transaction[] };
const cacheKey = async (workspaceId: string) => { const { data } = await supabase.auth.getSession(); return `truck:${data.session?.user.id ?? 'guest'}:${workspaceId}`; };
const emptyCache = (): TruckCache => ({ trucks: [], owners: [], transactions: [] });
const cacheTails = new Map<string, Promise<void>>();

function withCacheLock<T>(workspaceId: string, operation: () => Promise<T>) {
  const previous = cacheTails.get(workspaceId) ?? Promise.resolve();
  const result = previous.then(operation, operation);
  const tail = result.then(() => undefined, () => undefined);
  cacheTails.set(workspaceId, tail);
  return result.finally(() => { if (cacheTails.get(workspaceId) === tail) cacheTails.delete(workspaceId); });
}

async function getCache(workspaceId: string) { return (await offlineStore.read<TruckCache>(await cacheKey(workspaceId))) ?? emptyCache(); }

async function saveCache(workspaceId: string, value: TruckCache) {
  reportTruckStatus('saving');
  try {
    await offlineStore.write(await cacheKey(workspaceId), value);
    reportTruckStatus(navigator.onLine ? 'saved locally' : 'offline saved');
  } catch (error) {
    reportTruckStatus('storage error');
    throw error;
  }
}

async function updateCache(workspaceId: string, update: (cache: TruckCache) => TruckCache) {
  return withCacheLock(workspaceId, async () => {
    const next = update(await getCache(workspaceId));
    await saveCache(workspaceId, next);
    return next;
  });
}

async function queueRows(table: string, workspaceId: string, payloads: Record<string, unknown>[]) {
  if (!payloads.length) return;
  const { data } = await supabase.auth.getSession();
  for (const payload of payloads) {
    const entityId = String(payload.id ?? '');
    await enqueueMutation({ mutationId: crypto.randomUUID(), userId: data.session?.user.id ?? 'guest', companyId: workspaceId, entityType: table, entityId, table, operation: 'upsert', payload: { ...payload, workspace_id: workspaceId } });
  }
  reportTruckStatus('sync pending');
  if (navigator.onLine) void syncQueue(workspaceId).catch(() => undefined);
}

async function queueRow(table: string, workspaceId: string, payload: Record<string, unknown>) {
  await queueRows(table, workspaceId, [payload]);
}

async function fetchTruckData(workspaceId: string) {
  const [trucks, owners, transactions] = await Promise.all([
    supabase.from('trucks').select('*').eq('workspace_id', workspaceId).is('deleted_at', null).order('created_at'),
    supabase.from('truck_owners').select('*').eq('workspace_id', workspaceId).is('deleted_at', null).order('created_at'),
    supabase.from('truck_transactions').select('*').eq('workspace_id', workspaceId).is('deleted_at', null).order('occurred_on', { ascending: false }),
  ]);
  const error = trucks.error ?? owners.error ?? transactions.error;
  if (error) throw explain(error);
  return {
    trucks: (trucks.data ?? []).map((r) => truckFromDb(r as Record<string, unknown>)),
    owners: (owners.data ?? []).map((r) => ownerFromDb(r as Record<string, unknown>)),
    transactions: (transactions.data ?? []).map((r) => transactionFromDb(r as Record<string, unknown>)),
  };
}

export async function loadTruckData(workspaceId: string, localOnly = false) {
  const cached = await getCache(workspaceId);
  if (localOnly || !navigator.onLine) {
    const mutationStatus = await getWorkspaceMutationStatus(workspaceId, TRUCK_TABLES);
    if (mutationStatus === 'conflict') reportTruckStatus('sync conflict');
    else if (mutationStatus === 'pending') reportTruckStatus('sync pending');
    return cached;
  }
  try { return await refreshTruckDataFromCloud(workspaceId); }
  catch (error) { if (cached.trucks.length || cached.owners.length || cached.transactions.length) return cached; throw error; }
}

export async function refreshTruckDataFromCloud(workspaceId: string) {
  return withCacheLock(workspaceId, async () => {
    const mutationStatus = await getWorkspaceMutationStatus(workspaceId, TRUCK_TABLES);
    if (mutationStatus === 'conflict') { reportTruckStatus('sync conflict'); return getCache(workspaceId); }
    if (mutationStatus === 'pending') { reportTruckStatus('sync pending'); return getCache(workspaceId); }
    const next = await fetchTruckData(workspaceId);
    await saveCache(workspaceId, next);
    return next;
  });
}

export async function createTruck(workspaceId: string, v: Omit<Truck, 'id'>, localOnly = false) {
  const row = { id: crypto.randomUUID(), workspace_id: workspaceId, name: v.name.trim(), unit_number: v.unitNumber.trim(), make_model: v.makeModel.trim(), vin: v.vin.trim(), cash_on_hand: v.cashOnHand, license_plate: v.licensePlate.trim() };
  const truck = truckFromDb(row);
  await updateCache(workspaceId, (cache) => ({ ...cache, trucks: [...cache.trucks.filter((item) => item.id !== truck.id), truck] }));
  if (!localOnly) await queueRow('trucks', workspaceId, row);
  return truck;
}

export async function createTruckOwner(workspaceId: string, v: Omit<Owner, 'id'> & { userId?: string | null }, localOnly = false) {
  const row = { id: crypto.randomUUID(), workspace_id: workspaceId, truck_id: v.truckId, user_id: v.userId ?? null, name: v.name, start_date: v.startDate, equity_percentage: v.equityPercentage, monthly_draw_rate: v.monthlyDrawRate, avatar_color: v.avatarColor };
  const owner = ownerFromDb(row);
  await updateCache(workspaceId, (cache) => ({ ...cache, owners: [...cache.owners.filter((item) => item.id !== owner.id), owner] }));
  if (!localOnly) await queueRow('truck_owners', workspaceId, row);
  return owner;
}

export async function updateTruckOwner(workspaceId: string, v: Owner, localOnly = false) {
  const row = { id: v.id, workspace_id: workspaceId, truck_id: v.truckId, name: v.name, start_date: v.startDate, equity_percentage: v.equityPercentage, monthly_draw_rate: v.monthlyDrawRate, avatar_color: v.avatarColor, updated_at: new Date().toISOString() };
  await updateCache(workspaceId, (cache) => ({ ...cache, owners: cache.owners.map((item) => item.id === v.id ? v : item) }));
  if (!localOnly) await queueRow('truck_owners', workspaceId, row);
  return v;
}

export async function updateTruck(workspaceId: string, v: Truck, localOnly = false) {
  const row = { id: v.id, workspace_id: workspaceId, name: v.name, unit_number: v.unitNumber, make_model: v.makeModel, vin: v.vin, cash_on_hand: v.cashOnHand, license_plate: v.licensePlate, updated_at: new Date().toISOString() };
  await updateCache(workspaceId, (cache) => ({ ...cache, trucks: cache.trucks.map((item) => item.id === v.id ? v : item) }));
  if (!localOnly) await queueRow('trucks', workspaceId, row);
  return v;
}

export async function deleteTruck(workspaceId: string, id: string, localOnly = false) {
  const deletedAt = new Date().toISOString();
  const row = { id, deleted_at: deletedAt, updated_at: deletedAt };
  await updateCache(workspaceId, (cache) => ({ ...cache, trucks: cache.trucks.filter((item) => item.id !== id) }));
  if (!localOnly) await queueRow('trucks', workspaceId, row);
}

export async function createTruckTransaction(workspaceId: string, v: Omit<Transaction, 'id'>, localOnly = false) {
  const row = { id: crypto.randomUUID(), workspace_id: workspaceId, truck_id: v.truckId, owner_id: v.ownerId ?? null, occurred_on: v.date, transaction_type: v.type, category: v.category, amount: v.amount, description: v.description, reference_no: v.referenceNo ?? null };
  const transaction = transactionFromDb(row);
  await updateCache(workspaceId, (cache) => ({ ...cache, transactions: [...cache.transactions.filter((item) => item.id !== transaction.id), transaction] }));
  if (!localOnly) await queueRow('truck_transactions', workspaceId, row);
  return transaction;
}

export async function createTruckTransactionBatch(workspaceId: string, values: Omit<Transaction, 'id'>[], localOnly = false) {
  if (!values.length) return [];
  const rows = values.map((v) => ({ id: crypto.randomUUID(), workspace_id: workspaceId, truck_id: v.truckId, owner_id: v.ownerId ?? null, occurred_on: v.date, transaction_type: v.type, category: v.category, amount: v.amount, description: v.description, reference_no: v.referenceNo ?? null }));
  const transactions = rows.map((row) => transactionFromDb(row));
  await withCacheLock(workspaceId, async () => {
    const cache = await getCache(workspaceId);
    await saveCache(workspaceId, { ...cache, transactions: [...transactions, ...cache.transactions] });
  });
  if (!localOnly) await queueRows('truck_transactions', workspaceId, rows);
  return transactions;
}

export async function updateTruckTransaction(workspaceId: string, v: Transaction, localOnly = false) {
  const row = { id: v.id, workspace_id: workspaceId, truck_id: v.truckId, owner_id: v.ownerId ?? null, occurred_on: v.date, transaction_type: v.type, category: v.category, amount: v.amount, description: v.description, reference_no: v.referenceNo ?? null, updated_at: new Date().toISOString() };
  await updateCache(workspaceId, (cache) => ({ ...cache, transactions: cache.transactions.map((item) => item.id === v.id ? v : item) }));
  if (!localOnly) await queueRow('truck_transactions', workspaceId, row);
  return v;
}

export async function softDeleteTruckTransaction(workspaceId: string, id: string, localOnly = false) {
  const deletedAt = new Date().toISOString();
  const row = { id, deleted_at: deletedAt, updated_at: deletedAt };
  await updateCache(workspaceId, (cache) => ({ ...cache, transactions: cache.transactions.filter((item) => item.id !== id) }));
  if (!localOnly) await queueRow('truck_transactions', workspaceId, row);
}

export async function deleteTruckOwner(workspaceId: string, id: string, localOnly = false) {
  const deletedAt = new Date().toISOString();
  const row = { id, deleted_at: deletedAt, updated_at: deletedAt };
  await updateCache(workspaceId, (cache) => ({ ...cache, owners: cache.owners.filter((item) => item.id !== id) }));
  if (!localOnly) await queueRow('truck_owners', workspaceId, row);
}

export async function loadTruckWorkspaceMembers(workspaceId: string) { const { data, error } = await supabase.rpc('list_workspace_members', { target_workspace: workspaceId }); if (error) throw error; return (data ?? []) as Array<{ user_id: string; email: string; display_name: string }>; }
