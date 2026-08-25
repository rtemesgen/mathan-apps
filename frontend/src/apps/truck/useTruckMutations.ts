import type { Dispatch, SetStateAction } from 'react';
import { createTruck, createTruckCustomer, createTruckOwner, createTruckTransaction, createTruckTransactionBatch, deleteTruck, deleteTruckCustomer, deleteTruckOwner, softDeleteTruckTransaction, updateTruck, updateTruckCustomer, updateTruckOwner, updateTruckTransaction } from './truckRepository';
import type { Customer, Owner, Transaction, TransactionType, Truck } from './types';
import { formatCurrency, formatDate } from './utils/formatters';
import type { DeleteConfirmationRequest } from '../../hooks/useDeleteConfirmation';

/** Compatibility name for callers; the shared confirmation contract is canonical. */
export type TruckDeleteRequest = DeleteConfirmationRequest;

type TruckMutationArgs = {
  workspaceId?: string;
  userId?: string;
  isGuest: boolean;
  editable: boolean;
  trucks: Truck[];
  owners: Owner[];
  customers: Customer[];
  transactions: Transaction[];
  activeTruck: Truck;
  editingTransaction: Transaction | null;
  calculationDate: string;
  refresh: () => Promise<void>;
  setCurrentTruckId: Dispatch<SetStateAction<string>>;
  setEditingTransaction: Dispatch<SetStateAction<Transaction | null>>;
  setError: Dispatch<SetStateAction<string>>;
  openDelete: (request: TruckDeleteRequest) => void;
};

export function useTruckMutations({ workspaceId, userId, isGuest, editable, trucks, owners, customers, transactions, activeTruck, editingTransaction, calculationDate, refresh, setCurrentTruckId, setEditingTransaction, setError, openDelete }: TruckMutationArgs) {
  const handleAddTransaction = async (txData: {
    truckId: string;
    date: string;
    type: TransactionType;
    category: string;
    amount: number;
    ownerId?: string;
    description: string;
    referenceNo?: string;
    counterpartyType?: 'CUSTOMER' | 'OWNER' | 'OTHER';
    customerId?: string;
    counterpartyName?: string;
  }) => {
    if (!workspaceId || !editable) throw new Error('You do not have permission to edit Truck data.');
    try { await createTruckTransaction(workspaceId, txData, isGuest, userId); await refresh(); setError(''); }
    catch (reason) { const message = reason instanceof Error ? reason.message : 'Could not save Truck transaction.'; setError(message); throw reason; }
  };

  const handleUpdateTransaction = async (txData: Omit<Transaction, 'id'>) => {
    if (!workspaceId || !editable || !editingTransaction) return;
    try { await updateTruckTransaction(workspaceId, { ...editingTransaction, ...txData }, isGuest, userId); await refresh(); setEditingTransaction(null); setError(''); }
    catch (reason) { const message = reason instanceof Error ? reason.message : 'Could not update Truck transaction.'; setError(message); throw reason; }
  };

  const handlePayOwnerSubmit = async (ownerId: string, amount: number, memo: string) => {
    const targetOwner = owners.find((owner) => owner.id === ownerId);
    await handleAddTransaction({ truckId: activeTruck.id, date: calculationDate || new Date().toISOString().split('T')[0], type: 'CAPITAL_REPAYMENT', category: 'Owner Debt Clearance', amount, ownerId, description: memo || `Debt repayment to ${targetOwner?.name || 'Owner'}`, referenceNo: `PAY-${Math.floor(1000 + Math.random() * 9000)}` });
  };

  const handleExecuteProfitDistribution = async (allocations: { ownerId: string; amount: number }[]) => {
    const batch: Omit<Transaction, 'id'>[] = allocations.flatMap(({ ownerId, amount }) => {
      if (amount <= 0) return [];
      const owner = owners.find((item) => item.id === ownerId);
      return [{ truckId: activeTruck.id, date: calculationDate || new Date().toISOString().split('T')[0], type: 'PROFIT_DISTRIBUTION', category: 'Profit Equity Dividend', amount, ownerId, description: `${owner?.name || 'Owner'} ${owner?.equityPercentage}% Net Profit Distribution`, referenceNo: `DIV-${Math.floor(1000 + Math.random() * 9000)}` }];
    });
    if (!workspaceId || !editable) throw new Error('You do not have permission to edit Truck data.');
    try { await createTruckTransactionBatch(workspaceId, batch, isGuest, userId); await refresh(); setError(''); }
    catch (reason) { const message = reason instanceof Error ? reason.message : 'Could not save profit distribution.'; setError(message); throw reason; }
  };

  const handleAddOrUpdateOwner = async (ownerData: { id?: string; truckId: string; name: string; startDate: string; equityPercentage: number; monthlyDrawRate: number }) => {
    if (ownerData.id) {
      const existing = owners.find((owner) => owner.id === ownerData.id);
      if (workspaceId && editable && existing) {
        try { await updateTruckOwner(workspaceId, { ...existing, ...ownerData, id: ownerData.id }, isGuest, userId); await refresh(); setError(''); }
        catch (reason) { const message = reason instanceof Error ? reason.message : 'Could not update partner.'; setError(message); throw reason; }
      }
      return;
    }
    if (workspaceId && editable) {
      try { await createTruckOwner(workspaceId, { ...ownerData, truckId: ownerData.truckId || activeTruck.id, avatarColor: 'bg-slate-800 text-white' }, isGuest, userId); await refresh(); setError(''); }
      catch (reason) { const message = reason instanceof Error ? reason.message : 'Could not add partner.'; setError(message); throw reason; }
    }
  };

  const handleAddOrUpdateCustomer = async (customerData: { id?: string; truckId: string; name: string; phone?: string; address?: string; notes?: string }) => {
    if (!workspaceId || !editable) throw new Error('You do not have permission to edit Truck data.');
    try {
      if (customerData.id) {
        const existing = customers.find((customer) => customer.id === customerData.id);
        if (existing) await updateTruckCustomer(workspaceId, { ...existing, ...customerData, id: customerData.id }, isGuest, userId);
      } else await createTruckCustomer(workspaceId, { ...customerData, truckId: customerData.truckId || activeTruck.id }, isGuest, userId);
      await refresh(); setError('');
    } catch (reason) { const message = reason instanceof Error ? reason.message : 'Could not save customer.'; setError(message); throw reason; }
  };

  const handleAddTruckSubmit = async (truckData: Omit<Truck, 'id'>) => {
    if (!workspaceId || !editable) throw new Error('You do not have permission to edit Truck data.');
      try { const newTruck = await createTruck(workspaceId, truckData, isGuest, userId); setCurrentTruckId(newTruck.id); await refresh(); setError(''); }
    catch (reason) { const message = reason instanceof Error ? reason.message : 'Could not add truck.'; setError(message); throw reason; }
  };

  const handleUpdateTruck = async (truckData: Truck) => {
    if (!workspaceId || !editable) return;
    try { await updateTruck(workspaceId, truckData, isGuest, userId); await refresh(); setError(''); }
    catch (reason) { const message = reason instanceof Error ? reason.message : 'Could not update truck.'; setError(message); throw reason; }
  };

  const handleDeleteTruck = (truckId: string) => {
    const truck = trucks.find((item) => item.id === truckId);
    openDelete({ title: 'Delete truck', message: 'This removes the truck from active fleet lists. Its historical records remain recoverable.', itemName: truck?.name ?? 'Truck', itemDetails: truck ? `Unit ${truck.unitNumber} · ${truck.makeModel || 'Fleet vehicle'}` : undefined, onConfirm: async () => {
      if (!workspaceId || !editable) return;
      try { await deleteTruck(workspaceId, truckId, isGuest, userId); await refresh(); setError(''); }
      catch (reason) { const error = reason instanceof Error ? reason : new Error('Could not delete truck.'); setError(error.message); throw error; }
    } });
  };

  const handleDeleteTransaction = (txId: string) => {
    const tx = transactions.find((item) => item.id === txId);
    openDelete({ title: 'Delete Transaction', message: 'Do you want to delete this transaction record?', itemName: tx ? `${tx.category || tx.type} • ${formatCurrency(tx.amount)}` : 'Transaction entry', itemDetails: tx ? `Date: ${formatDate(tx.date)} • ${tx.description}` : undefined, onConfirm: async () => {
      if (!workspaceId || !editable) return;
      try { await softDeleteTruckTransaction(workspaceId, txId, isGuest, userId); await refresh(); setError(''); }
      catch (reason) { const error = reason instanceof Error ? reason : new Error('Could not delete transaction.'); setError(error.message); throw error; }
    } });
  };

  const handleDeleteOwner = (ownerId: string) => {
    const owner = owners.find((item) => item.id === ownerId);
    openDelete({ title: 'Delete Partner', message: 'Do you want to remove this partner from the fleet?', itemName: owner ? `${owner.name} (${owner.equityPercentage}% Equity)` : 'Partner', itemDetails: owner ? `Monthly Draw: $${owner.monthlyDrawRate.toLocaleString()} • Truck: ${trucks.find((truck) => truck.id === owner.truckId)?.name || 'Active Unit'}` : undefined, onConfirm: async () => {
      if (!workspaceId || !editable) return;
      try { await deleteTruckOwner(workspaceId, ownerId, isGuest, userId); await refresh(); setError(''); }
      catch (reason) { const error = reason instanceof Error ? reason : new Error('Could not delete partner.'); setError(error.message); throw error; }
    } });
  };

  const handleDeleteCustomer = (customerId: string) => {
    const customer = customers.find((item) => item.id === customerId);
    openDelete({ title: 'Delete customer', message: 'Remove this customer from the Truck customer list? Existing transactions remain unchanged.', itemName: customer?.name ?? 'Customer', onConfirm: async () => {
      if (!workspaceId || !editable) return;
      try { await deleteTruckCustomer(workspaceId, customerId, isGuest, userId); await refresh(); setError(''); }
      catch (reason) { const error = reason instanceof Error ? reason : new Error('Could not delete customer.'); setError(error.message); throw error; }
    } });
  };

  return { handleAddTransaction, handleUpdateTransaction, handlePayOwnerSubmit, handleExecuteProfitDistribution, handleAddOrUpdateOwner, handleAddOrUpdateCustomer, handleAddTruckSubmit, handleUpdateTruck, handleDeleteTruck, handleDeleteTransaction, handleDeleteOwner, handleDeleteCustomer };
}
