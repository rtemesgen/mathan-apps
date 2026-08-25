import React, { useState } from 'react';
import { Truck, Owner, Transaction } from './types';
import { useAuth } from '../../auth/AuthProvider';
import { useAndroidBackHandler } from '../../hooks/useAndroidBackButton';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { ReportsView } from './components/ReportsView';
import { LedgerHistoryView } from './components/LedgerHistoryView';
import { IncomePage } from './components/Pages/IncomePage';
import { ExpensesPage } from './components/Pages/ExpensesPage';
import { ManageTrucksPage } from './components/Pages/ManageTrucksPage';
import { ExportPage } from './components/Pages/ExportPage';
import { CashReportView } from './components/Pages/CashReportView';
import { DashboardView } from './components/Pages/DashboardView';
import { PartnersPage } from './components/Pages/PartnersPage';
import { AddPartnerModal } from './components/AddPartnerModal';
import { RecordTransactionModal } from './components/Modals/RecordTransactionModal';
import { DeleteConfirmModal } from '../../components/DeleteConfirmModal';
import { useTruckData } from './useTruckData';
import { useTruckMutations, type TruckDeleteRequest } from './useTruckMutations';
import { useTruckFinancials } from './useTruckFinancials';
import { useTruckPreferences } from './useTruckPreferences';
import { useDeleteConfirmation } from '../../hooks/useDeleteConfirmation';
import './index.css';

export default function App() {
  const { workspace, canEditApp, isGuest } = useAuth();
  const { trucks, setTrucks, owners, setOwners, transactions, setTransactions, currentTruckId, setCurrentTruckId, members, loading, dataError, refresh } = useTruckData(workspace?.id, isGuest);

  const { currentView, setCurrentView, sortBy, setSortBy, calculationDate, setCalculationDate, isSidebarOpen, setIsSidebarOpen } = useTruckPreferences(workspace?.id, currentTruckId, setCurrentTruckId);

  const [isAddPartnerModalOpen, setIsAddPartnerModalOpen] = useState<boolean>(false);
  const [editingOwner, setEditingOwner] = useState<Owner | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedPayOwnerId, setSelectedPayOwnerId] = useState<string | undefined>();
  const [expensesTab, setExpensesTab] = useState<'expense' | 'pay-owner' | 'distribute-profit'>('expense');

  const editable = canEditApp('truck');
  const [error, setError] = useState('');
  const { activeTruck, activeTruckOwners, truckFinancials, sortedOwnerSummaries } = useTruckFinancials(trucks, owners, transactions, currentTruckId, calculationDate, sortBy);

  const deleteConfirmation = useDeleteConfirmation('Truck record deleted successfully.');
  const openDelete = (request: TruckDeleteRequest) => deleteConfirmation.open(request);
  const { handleAddTransaction, handleUpdateTransaction, handlePayOwnerSubmit, handleExecuteProfitDistribution, handleAddOrUpdateOwner, handleAddTruckSubmit, handleUpdateTruck, handleDeleteTruck, handleDeleteTransaction, handleDeleteOwner } = useTruckMutations({ workspaceId: workspace?.id, isGuest, editable, trucks, owners, transactions, activeTruck, editingTransaction, calculationDate, refresh, setCurrentTruckId, setEditingTransaction, setError, openDelete });

  const handleResetDemoData = () => setError('Demo reset is unavailable for cloud workspaces.');

  useAndroidBackHandler(() => {
    if (isSidebarOpen && window.innerWidth < 768) { setIsSidebarOpen(false); return true; }
    if (currentView !== 'dashboard') { setCurrentView('dashboard'); return true; }
    return false;
  }, [isSidebarOpen, currentView]);

  return (
    <div className="erp-app truck-app min-h-screen bg-[#f8f6f0] text-[#1c1d1f] flex font-sans antialiased">
      {/* Slide-over Drawer Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        currentView={currentView}
        setCurrentView={setCurrentView}
        summary={truckFinancials}
        trucks={trucks}
        currentTruckId={currentTruckId}
        onSelectTruck={setCurrentTruckId}
        calculationDate={calculationDate}
        setCalculationDate={setCalculationDate}
        onResetDemoData={handleResetDemoData}
        onOpenAddOwner={() => {
          setEditingOwner(null);
          setIsAddPartnerModalOpen(true);
        }}
        onOpenIncome={() => {
          setSelectedPayOwnerId(undefined);
          setCurrentView('income');
        }}
        onOpenExpenses={() => {
          setSelectedPayOwnerId(undefined);
          setExpensesTab('expense');
          setCurrentView('expenses');
        }}
        onOpenAddTruck={() => setCurrentView('manage-trucks')}
      />

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Controls */}
        <TopHeader
          currentView={currentView}
          setCurrentView={setCurrentView}
          trucks={trucks}
          currentTruckId={currentTruckId}
          onSelectTruck={setCurrentTruckId}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        />

        {/* Dynamic Main View Content (All views render as full pages) */}
        <main className="mobile-content-safe flex-1 overflow-y-auto pb-16 sm:pb-8">{(error || dataError) && <div role="alert" className="mx-auto mt-3 max-w-3xl rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">{error || dataError}</div>}{loading && <div className="mx-auto mt-3 max-w-3xl rounded-xl bg-white p-3 text-xs text-zinc-500">Loading Truck data…</div>}
          {currentView === 'dashboard' && (
            <DashboardView
              trucks={trucks}
              currentTruckId={currentTruckId}
              onSelectTruck={setCurrentTruckId}
              allOwners={owners}
              allTransactions={transactions}
              onOpenManageTrucks={() => setCurrentView('manage-trucks')}
            />
          )}

          {currentView === 'partners' && (
            <PartnersPage
              activeTruck={activeTruck}
              transactions={transactions}
              sortedOwnerSummaries={sortedOwnerSummaries}
              sortBy={sortBy}
              onSortByChange={setSortBy}
              onAddPartner={() => { setEditingOwner(null); setIsAddPartnerModalOpen(true); }}
              onPayOwner={(ownerId) => { setSelectedPayOwnerId(ownerId); setExpensesTab('pay-owner'); setCurrentView('expenses'); }}
              onInjectCapital={(ownerId) => { setSelectedPayOwnerId(ownerId); setCurrentView('income'); }}
              onEditOwner={(owner) => { setEditingOwner(owner); setIsAddPartnerModalOpen(true); }}
              onDeleteOwner={handleDeleteOwner}
              onDeleteTransaction={handleDeleteTransaction}
              onEditTransaction={setEditingTransaction}
            />
          )}

          {currentView === 'cash-report' && (
            <CashReportView
              truck={activeTruck}
              transactions={transactions.filter((t) => t.truckId === activeTruck.id)}
              owners={activeTruckOwners}
              onOpenIncome={() => setCurrentView('income')}
              onOpenExpense={() => {
                setExpensesTab('expense');
                setCurrentView('expenses');
              }}
              onExport={() => setCurrentView('export')}
              onEditTransaction={setEditingTransaction}
              onDeleteTransaction={handleDeleteTransaction}
            />
          )}

          {currentView === 'income' && (
            <IncomePage
              owners={activeTruckOwners}
              trucks={trucks}
              currentTruckId={currentTruckId}
              defaultOwnerId={selectedPayOwnerId}
              cashOnHand={truckFinancials.cashOnHand}
              onSubmit={handleAddTransaction}
              onBack={() => setCurrentView('dashboard')}
            />
          )}

          {currentView === 'expenses' && (
            <ExpensesPage
              summary={truckFinancials}
              owners={activeTruckOwners}
              trucks={trucks}
              currentTruckId={currentTruckId}
              defaultTab={expensesTab}
              selectedOwnerId={selectedPayOwnerId}
              onSubmitExpense={handleAddTransaction}
              onSubmitPayOwner={handlePayOwnerSubmit}
              onExecuteProfitDistribution={handleExecuteProfitDistribution}
              onBack={() => setCurrentView('dashboard')}
            />
          )}

          {currentView === 'reports' && (
            <ReportsView
              summary={truckFinancials}
              onPayOwner={(ownerId) => {
                setSelectedPayOwnerId(ownerId);
                setExpensesTab('pay-owner');
                setCurrentView('expenses');
              }}
              onExport={() => setCurrentView('export')}
            />
          )}

          {currentView === 'history' && (
            <LedgerHistoryView
              transactions={transactions.filter((t) => t.truckId === activeTruck.id)}
              owners={activeTruckOwners}
              onDeleteTransaction={handleDeleteTransaction}
              onEditTransaction={setEditingTransaction}
              onOpenIncome={() => setCurrentView('income')}
              onOpenExpense={() => {
                setExpensesTab('expense');
                setCurrentView('expenses');
              }}
            />
          )}

          {currentView === 'manage-trucks' && (
            <ManageTrucksPage
              trucks={trucks}
              currentTruckId={currentTruckId}
              onSelectTruck={setCurrentTruckId}
              onAddTruck={handleAddTruckSubmit}
              onUpdateTruck={handleUpdateTruck}
              onDeleteTruck={handleDeleteTruck}
              onBack={() => setCurrentView('dashboard')}
            />
          )}

          {currentView === 'export' && (
            <ExportPage
              summary={truckFinancials}
              transactions={transactions.filter((t) => t.truckId === activeTruck.id)}
              owners={activeTruckOwners}
              truck={activeTruck}
              onBack={() => setCurrentView('dashboard')}
            />
          )}
        </main>
      </div>

      {/* Add / Edit Partner Popup Modal */}
      <AddPartnerModal
        isOpen={isAddPartnerModalOpen}
        editingOwner={editingOwner}
        currentTruckId={currentTruckId}
        trucks={trucks}
        members={members}
        onSubmitPartner={handleAddOrUpdateOwner}
        onDeletePartner={handleDeleteOwner}
        onClose={() => {
          setIsAddPartnerModalOpen(false);
          setEditingOwner(null);
        }}
      />

      <RecordTransactionModal
        isOpen={!!editingTransaction}
        editingTransaction={editingTransaction}
        owners={activeTruckOwners}
        trucks={trucks}
        currentTruckId={currentTruckId}
          onSubmit={(data) => handleUpdateTransaction(data)}
        onClose={() => setEditingTransaction(null)}
      />

      {/* Global Confirmation Popup for Deleting */}
      <DeleteConfirmModal
        isOpen={!!deleteConfirmation.request}
        title={deleteConfirmation.request?.title ?? ''}
        message={deleteConfirmation.request?.message ?? ''}
        itemName={deleteConfirmation.request?.itemName}
        itemDetails={deleteConfirmation.request?.itemDetails}
        onConfirm={deleteConfirmation.confirm}
        onClose={deleteConfirmation.close}
        successMessage={deleteConfirmation.successMessage}
      />
    </div>
  );
}
