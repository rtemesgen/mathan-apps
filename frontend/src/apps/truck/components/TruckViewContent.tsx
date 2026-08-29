import React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Customer, Owner, Transaction, TransactionType, Truck, TruckFinancialSummary } from '../types';
import { ReportsView } from './ReportsView';
import { LedgerHistoryView } from './LedgerHistoryView';
import { IncomePage } from './Pages/IncomePage';
import { ExpensesPage } from './Pages/ExpensesPage';
import { ManageTrucksPage } from './Pages/ManageTrucksPage';
import { CashReportView } from './Pages/CashReportView';
import { DashboardView } from './Pages/DashboardView';
import { PartnersPage } from './Pages/PartnersPage';
import { CustomersPage } from './Pages/CustomersPage';

type TruckTransactionInput = {
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
};

export type TruckViewContentProps = {
  currentView: string;
  setCurrentView: (view: string) => void;
  trucks: Truck[];
  owners: Owner[];
  customers: Customer[];
  transactions: Transaction[];
  currentTruckId: string;
  setCurrentTruckId: Dispatch<SetStateAction<string>>;
  activeTruck: Truck;
  activeTruckOwners: Owner[];
  truckFinancials: TruckFinancialSummary;
  sortedOwnerSummaries: TruckFinancialSummary['ownerSummaries'];
  sortBy: string;
  setSortBy: (value: string) => void;
  selectedPayOwnerId?: string;
  setSelectedPayOwnerId: (ownerId: string | undefined) => void;
  expensesTab: 'expense' | 'pay-owner' | 'distribute-profit';
  setExpensesTab: (tab: 'expense' | 'pay-owner' | 'distribute-profit') => void;
  setEditingOwner: (owner: Owner | null) => void;
  openPartnerModal: () => void;
  onOpenCustomers: () => void;
  onAddOrUpdateCustomer: (customer: { id?: string; truckId: string; name: string; phone?: string; address?: string; notes?: string }) => Promise<void>;
  onDeleteCustomer: (id: string) => void;
  setEditingTransaction: (transaction: Transaction | null) => void;
  handleAddTransaction: (input: TruckTransactionInput) => Promise<void>;
  handleUpdateTransaction: (input: Omit<Transaction, 'id'>) => Promise<void>;
  handlePayOwnerSubmit: (ownerId: string, amount: number, memo: string) => Promise<void>;
  handleExecuteProfitDistribution: (allocations: { ownerId: string; amount: number }[]) => Promise<void>;
  handleDeleteOwner: (ownerId: string) => void;
  handleDeleteTransaction: (transactionId: string) => void;
  handleAddTruckSubmit: (truck: Omit<Truck, 'id'>) => Promise<void>;
  handleUpdateTruck: (truck: Truck) => Promise<void>;
  handleDeleteTruck: (truckId: string) => void;
  loading: boolean;
  error: string;
  dataError: string;
  onExportReport: (reportId: string, reportName: string, filters?: { startDate?: string; endDate?: string; transactionType?: string; query?: string }) => void;
};

export function TruckViewContent({
  currentView,
  setCurrentView,
  trucks,
  owners,
  customers,
  transactions,
  currentTruckId,
  setCurrentTruckId,
  activeTruck,
  activeTruckOwners,
  truckFinancials,
  sortedOwnerSummaries,
  sortBy,
  setSortBy,
  selectedPayOwnerId,
  setSelectedPayOwnerId,
  expensesTab,
  setExpensesTab,
  setEditingOwner,
  openPartnerModal,
  onOpenCustomers: _onOpenCustomers,
  onAddOrUpdateCustomer,
  onDeleteCustomer,
  setEditingTransaction,
  handleAddTransaction,
  handleUpdateTransaction,
  handlePayOwnerSubmit,
  handleExecuteProfitDistribution,
  handleDeleteOwner,
  handleDeleteTransaction,
  handleAddTruckSubmit,
  handleUpdateTruck,
  handleDeleteTruck,
  loading,
  error,
  dataError,
  onExportReport,
}: TruckViewContentProps) {
  const activeTransactions = transactions.filter((transaction) => transaction.truckId === activeTruck.id);
  const openExpenses = () => {
    setExpensesTab('expense');
    setCurrentView('expenses');
  };

  return (
    <main className="mobile-content-safe flex-1 overflow-y-auto pb-16 sm:pb-8">
      {(error || dataError) && <div role="alert" className="mx-auto mt-3 max-w-3xl rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">{error || dataError}</div>}
      {loading && <div className="mx-auto mt-3 max-w-3xl rounded-xl bg-white p-3 text-xs text-zinc-500">Loading Truck data…</div>}
      {!loading && !error && !dataError && !navigator.onLine && trucks.length === 0 && transactions.length === 0 && <div className="mx-auto mt-3 max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">No offline Truck data available. Connect to the internet once to load this company.</div>}

      {currentView === 'dashboard' && <DashboardView trucks={trucks} currentTruckId={currentTruckId} onSelectTruck={setCurrentTruckId} allOwners={owners} allTransactions={transactions} onOpenManageTrucks={() => setCurrentView('manage-trucks')} />}

      {currentView === 'partners' && <PartnersPage
        activeTruck={activeTruck}
        transactions={transactions}
        sortedOwnerSummaries={sortedOwnerSummaries}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        onAddPartner={() => { setEditingOwner(null); openPartnerModal(); }}
        onPayOwner={(ownerId) => { setSelectedPayOwnerId(ownerId); setExpensesTab('pay-owner'); setCurrentView('expenses'); }}
        onInjectCapital={(ownerId) => { setSelectedPayOwnerId(ownerId); setCurrentView('income'); }}
        onEditOwner={(owner) => { setEditingOwner(owner); openPartnerModal(); }}
        onDeleteOwner={handleDeleteOwner}
        onDeleteTransaction={handleDeleteTransaction}
        onEditTransaction={setEditingTransaction}
      />}

      {currentView === 'customers' && <CustomersPage truck={activeTruck} customers={customers} transactions={activeTransactions} balances={truckFinancials.counterpartyBalances} onSave={onAddOrUpdateCustomer} onDelete={onDeleteCustomer} />}

      {currentView === 'cash-report' && <CashReportView
        truck={activeTruck}
        transactions={activeTransactions}
        owners={activeTruckOwners}
        onOpenIncome={() => setCurrentView('income')}
        onOpenExpense={openExpenses}
        onExport={(filters) => onExportReport('income-expenses', 'Cash Flow', filters)}
        onEditTransaction={setEditingTransaction}
        onDeleteTransaction={handleDeleteTransaction}
      />}

      {currentView === 'income' && <IncomePage
        owners={activeTruckOwners}
        customers={customers.filter((customer) => customer.truckId === activeTruck.id)}
        trucks={trucks}
        currentTruckId={currentTruckId}
        defaultOwnerId={selectedPayOwnerId}
        cashOnHand={truckFinancials.cashOnHand}
        onSubmit={handleAddTransaction}
        onBack={() => setCurrentView('dashboard')}
      />}

      {currentView === 'expenses' && <ExpensesPage
        summary={truckFinancials}
        owners={activeTruckOwners}
        customers={customers.filter((customer) => customer.truckId === activeTruck.id)}
        trucks={trucks}
        currentTruckId={currentTruckId}
        defaultTab={expensesTab}
        selectedOwnerId={selectedPayOwnerId}
        onSubmitExpense={handleAddTransaction}
        onSubmitPayOwner={handlePayOwnerSubmit}
        onExecuteProfitDistribution={handleExecuteProfitDistribution}
        onBack={() => setCurrentView('dashboard')}
      />}

      {currentView === 'reports' && <ReportsView
        summary={truckFinancials}
        onPayOwner={(ownerId) => { setSelectedPayOwnerId(ownerId); setExpensesTab('pay-owner'); setCurrentView('expenses'); }}
        onExport={(filters) => onExportReport('owner-shares-loans', 'Partner Financials', filters)}
      />}

      {currentView === 'history' && <LedgerHistoryView
        transactions={activeTransactions}
        owners={activeTruckOwners}
        onDeleteTransaction={handleDeleteTransaction}
        onEditTransaction={setEditingTransaction}
        onOpenIncome={() => setCurrentView('income')}
        onOpenExpense={openExpenses}
        onExport={(filters) => onExportReport('transactions-by-truck-owner', 'Activity History', filters)}
      />}

      {currentView === 'manage-trucks' && <ManageTrucksPage
        trucks={trucks}
        currentTruckId={currentTruckId}
        onSelectTruck={setCurrentTruckId}
        onAddTruck={handleAddTruckSubmit}
        onUpdateTruck={handleUpdateTruck}
        onDeleteTruck={handleDeleteTruck}
        onBack={() => setCurrentView('dashboard')}
      />}

    </main>
  );
}
