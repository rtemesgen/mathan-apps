import { useMemo } from 'react';
import type { Owner, Transaction, Truck } from './types';
import { calculateTruckFinancials } from './utils/formatters';

export function useTruckFinancials(trucks: Truck[], owners: Owner[], transactions: Transaction[], currentTruckId: string, sortBy: string) {
  return useMemo(() => {
    const activeTruck = trucks.find((truck) => truck.id === currentTruckId) || trucks[0] || { id: '', name: 'No trucks yet', unitNumber: '', makeModel: '', vin: '', cashOnHand: 0, licensePlate: '' };
    const activeTruckOwners = owners.filter((owner) => owner.truckId === activeTruck.id || (!owner.truckId && activeTruck.id === 'truck-1'));
    // This summary feeds operational screens. Historical dates belong only to
    // the explicitly filtered Cash Report/export flows, never to a saved UI
    // preference that can make a newly created record appear to disappear.
    const truckFinancials = calculateTruckFinancials(activeTruck, activeTruckOwners, transactions.filter((transaction) => transaction.truckId === activeTruck.id));
    const sortedOwnerSummaries = [...truckFinancials.ownerSummaries].sort((a, b) => {
      if (sortBy === 'balance') return b.totalUnpaidMoneyOwed - a.totalUnpaidMoneyOwed;
      if (sortBy === 'rate') return b.owner.monthlyDrawRate - a.owner.monthlyDrawRate;
      if (sortBy === 'equity') return b.owner.equityPercentage - a.owner.equityPercentage;
      if (sortBy === 'name') return a.owner.name.localeCompare(b.owner.name);
      return 0;
    });
    return { activeTruck, activeTruckOwners, truckFinancials, sortedOwnerSummaries };
  }, [trucks, owners, transactions, currentTruckId, sortBy]);
}
