import { useCallback, useEffect, useState } from 'react';
import { loadTruckData, loadTruckWorkspaceMembers, synchronizeTruckData } from './truckRepository';
import type { Customer, Owner, Transaction, Truck } from './types';
import { canAttemptBackend } from '../../lib/connectivity';

export function useTruckData(workspaceId: string | undefined, isGuest: boolean, userId?: string) {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currentTruckId, setCurrentTruckId] = useState('');
  const [members, setMembers] = useState<Array<{ user_id: string; email: string; display_name: string }>>([]);
  // Local hydration is the first render path. Starting in a loading state
  // prevents the dashboard from briefly presenting zero balances while the
  // durable Truck cache is being read after an offline restart.
  const [loading, setLoading] = useState(true);
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
      const data = await loadTruckData(workspaceId, !canAttemptBackend(), userId);
      applyData(data);
      setDataError('');
    } catch (reason) {
      setDataError(reason instanceof Error ? reason.message : 'Could not load Truck data.');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, userId, applyData]);

  const synchronize = useCallback(() => {
    if (!workspaceId || isGuest || !canAttemptBackend()) return;
    void synchronizeTruckData(workspaceId, userId).then((data) => { applyData(data); setDataError(''); }).catch((reason) => {
      // The browser can report itself online for the first render while the
      // backend request is already unreachable. Fall back to the durable
      // Truck cache without toggling the already-hydrated dashboard back into
      // a loading state.
      setDataError(`Could not refresh Truck data from the server. Cached data was retained${reason instanceof Error && reason.message ? `: ${reason.message}` : '.'}`);
      void loadTruckData(workspaceId, true, userId).then(applyData).catch(() => undefined);
    });
  }, [workspaceId, userId, isGuest, applyData]);

  useEffect(() => {
    let active = true;
    // Hydrate the durable cache before any cloud request. The browser/WebView
    // can still report online while the backend is unreachable; local data
    // must therefore become visible without waiting for the network timeout.
    if (!workspaceId) { setLoading(false); return () => { active = false; }; }
    setLoading(true);
    void loadTruckData(workspaceId, true, userId)
      .then((data) => {
        if (!active) return;
        applyData(data);
        setLoading(false);
        // Do not race cloud hydration against the local read: an older cache
        // read must never overwrite a newer cloud result on first render.
        if (canAttemptBackend() && !isGuest) void synchronize();
      })
      .catch(() => { if (active) { setLoading(false); setDataError('Could not load local Truck data.'); } });
    if (workspaceId && !isGuest) void loadTruckWorkspaceMembers(workspaceId).then(setMembers).catch(() => undefined);
    else setMembers([]);
    return () => { active = false; };
  }, [workspaceId, isGuest, userId, applyData, synchronize]);

  useEffect(() => {
    const handler = () => synchronize();
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, [synchronize]);

  return { trucks, setTrucks, owners, setOwners, customers, setCustomers, transactions, setTransactions, currentTruckId, setCurrentTruckId, members, loading, dataError, refresh };
}
