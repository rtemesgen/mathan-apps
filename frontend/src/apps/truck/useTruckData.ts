import { useCallback, useEffect, useState } from 'react';
import { loadTruckData, loadTruckWorkspaceMembers, synchronizeTruckData } from './truckRepository';
import type { Owner, Transaction, Truck } from './types';

export function useTruckData(workspaceId: string | undefined, isGuest: boolean) {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currentTruckId, setCurrentTruckId] = useState('');
  const [members, setMembers] = useState<Array<{ user_id: string; email: string; display_name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [dataError, setDataError] = useState('');

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const data = await loadTruckData(workspaceId, true);
      setTrucks(data.trucks);
      setOwners(data.owners);
      setTransactions(data.transactions);
      setCurrentTruckId((current) => data.trucks.some((truck) => truck.id === current) ? current : (data.trucks[0]?.id ?? ''));
      setDataError('');
    } catch (reason) {
      setDataError(reason instanceof Error ? reason.message : 'Could not load Truck data.');
    } finally {
      setLoading(false);
    }
    if (!isGuest && navigator.onLine) {
      void synchronizeTruckData(workspaceId)
        .then((data) => { setTrucks(data.trucks); setOwners(data.owners); setTransactions(data.transactions); })
        .catch(() => undefined);
    }
  }, [workspaceId, isGuest]);

  useEffect(() => {
    void refresh();
    if (workspaceId && !isGuest) void loadTruckWorkspaceMembers(workspaceId).then(setMembers).catch(() => undefined);
    else setMembers([]);
  }, [workspaceId, isGuest, refresh]);

  useEffect(() => {
    const handler = () => { if (workspaceId) void refresh(); };
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, [workspaceId, refresh]);

  return { trucks, setTrucks, owners, setOwners, transactions, setTransactions, currentTruckId, setCurrentTruckId, members, loading, dataError, refresh };
}
