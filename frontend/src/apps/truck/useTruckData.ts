import { useCallback, useEffect, useState } from 'react';
import { loadTruckData, loadTruckWorkspaceMembers, synchronizeTruckData } from './truckRepository';
import type { Customer, Owner, Transaction, Truck } from './types';

export function useTruckData(workspaceId: string | undefined, isGuest: boolean, userId?: string) {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currentTruckId, setCurrentTruckId] = useState('');
  const [members, setMembers] = useState<Array<{ user_id: string; email: string; display_name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [dataError, setDataError] = useState('');

  const applyData = useCallback((data: Awaited<ReturnType<typeof loadTruckData>>) => {
    setTrucks(data.trucks);
    setOwners(data.owners);
    setCustomers(data.customers);
    setTransactions(data.transactions);
    setCurrentTruckId((current) => data.trucks.some((truck) => truck.id === current) ? current : (data.trucks[0]?.id ?? ''));
  }, []);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      // Online sessions use the synchronized cloud view. Offline sessions use
      // the durable local cache; queued local changes are protected from a
      // cloud refresh by the repository.
      const data = await loadTruckData(workspaceId, !navigator.onLine, userId);
      applyData(data);
      setDataError('');
    } catch (reason) {
      setDataError(reason instanceof Error ? reason.message : 'Could not load Truck data.');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, userId, applyData]);

  const synchronize = useCallback(() => {
    if (!workspaceId || isGuest || !navigator.onLine) return;
    void synchronizeTruckData(workspaceId, userId).then(applyData).catch(() => {
      // The browser can report itself online for the first render while the
      // backend request is already unreachable. Fall back to the durable
      // Truck cache instead of leaving the screen at its empty initial state.
      void refresh();
    });
  }, [workspaceId, userId, isGuest, applyData]);

  useEffect(() => {
    // Hydrate the durable cache immediately. The browser's first online
    // signal can be stale during an offline reload, and waiting for a failed
    // cloud request would otherwise leave the screen at its empty initial
    // state. A cloud reconciliation still follows for connected sessions.
    if (workspaceId) void loadTruckData(workspaceId, true, userId).then(applyData).catch(() => undefined);
    if (navigator.onLine && !isGuest) void synchronize();
    else void refresh();
    if (workspaceId && !isGuest) void loadTruckWorkspaceMembers(workspaceId).then(setMembers).catch(() => undefined);
    else setMembers([]);
  }, [workspaceId, isGuest, refresh, synchronize]);

  useEffect(() => {
    const handler = () => synchronize();
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, [synchronize]);

  return { trucks, setTrucks, owners, setOwners, customers, setCustomers, transactions, setTransactions, currentTruckId, setCurrentTruckId, members, loading, dataError, refresh };
}
