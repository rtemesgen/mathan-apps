import React, { useState } from 'react';
import { Truck, Owner, Transaction } from './types';
import { useAuth } from '../../auth/AuthProvider';
import { useAndroidBackHandler } from '../../hooks/useAndroidBackButton';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { OwnerCard } from './components/OwnerCard';
import { ReportsView } from './components/ReportsView';
import { LedgerHistoryView } from './components/LedgerHistoryView';
import { IncomePage } from './components/Pages/IncomePage';
import { ExpensesPage } from './components/Pages/ExpensesPage';
import { ManageTrucksPage } from './components/Pages/ManageTrucksPage';
import { ExportPage } from './components/Pages/ExportPage';
import { CashReportView } from './components/Pages/CashReportView';
import { DashboardView } from './components/Pages/DashboardView';
import { AddPartnerModal } from './components/AddPartnerModal';
import { RecordTransactionModal } from './components/Modals/RecordTransactionModal';
import { DeleteConfirmModal } from '../../components/DeleteConfirmModal';
import { TruckSelect } from './components/TruckSelect';
import { useTruckData } from './useTruckData';
import { useTruckMutations, type TruckDeleteRequest } from './useTruckMutations';
import { useTruckFinancials } from './useTruckFinancials';
import { useTruckPreferences } from './useTruckPreferences';
import { UserPlus, Plus, Users, ArrowUpDown } from 'lucide-react';
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

  // Deletion confirmation modal state
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    itemName?: string;
    itemDetails?: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const editable = canEditApp('truck');
  const [error, setError] = useState('');
  const { activeTruck, activeTruckOwners, truckFinancials, sortedOwnerSummaries } = useTruckFinancials(trucks, owners, transactions, currentTruckId, calculationDate, sortBy);

  const openDelete = (request: TruckDeleteRequest) => setDeleteModal({ isOpen: true, ...request, onConfirm: async () => { await request.onConfirm(); setDeleteModal((previous) => ({ ...previous, isOpen: false })); } });
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
            <div className="p-3 sm:p-5 max-w-3xl mx-auto space-y-3">
              {/* Header with truck indicator & Add Partner button */}
              <div className="flex items-center justify-between pb-1.5 border-b border-[#e5dfd2] flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#1c1d1f] text-white flex items-center justify-center shadow-2xs">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h1 className="text-sm sm:text-base font-bold text-[#1c1d1f] uppercase tracking-tight">
                      Partners & Loans • {activeTruck.name}
                    </h1>
                    <p className="text-[10px] text-[#787672]">
                      Unit {activeTruck.unitNumber} • Equity percentages, draw rates & loan balances
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Sort Filter Selector */}
                  <div className="flex items-center gap-1 bg-white border border-[#d8d0be] rounded-lg px-2 py-1 text-xs">
                    <ArrowUpDown className="w-3 h-3 text-[#787672]" />
                    <span className="text-[10px] uppercase font-bold text-[#787672]">Sort:</span>
                    <TruckSelect value={sortBy} onChange={setSortBy} options={[{ value: 'balance', label: 'Highest Debt' }, { value: 'rate', label: 'Draw Rate' }, { value: 'equity', label: 'Equity %' }, { value: 'name', label: 'Name A-Z' }]} className="min-w-32" />
                  </div>

                  <button
                    onClick={() => {
                      setEditingOwner(null);
                      setIsAddPartnerModalOpen(true);
                    }}
                    className="bg-[#3f4d34] hover:bg-[#323e29] text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Partner</span>
                  </button>
                </div>
              </div>

              {/* Partner Cards List or Empty State */}
              {sortedOwnerSummaries.length === 0 ? (
                <div className="bg-white border border-[#e5dfd2] rounded-2xl p-8 text-center shadow-xs space-y-3">
                  <div className="w-12 h-12 rounded-full bg-[#f3efe6] flex items-center justify-center mx-auto text-[#787672]">
                    <UserPlus className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#1c1d1f]">
                      No partners added for {activeTruck.name}
                    </h3>
                    <p className="text-xs text-[#787672] max-w-sm mx-auto mt-1">
                      Partners and loans are tracked separately for each truck. Add partners to configure equity percentages and track capital loans.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingOwner(null);
                      setIsAddPartnerModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 bg-[#3f4d34] hover:bg-[#323e29] text-white text-xs font-bold px-4 py-2 rounded-lg shadow-2xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Partner to Unit {activeTruck.unitNumber}</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {sortedOwnerSummaries.map((summary) => (
                    <OwnerCard
                      key={summary.owner.id}
                      summary={summary}
                      transactions={transactions.filter((t) => t.truckId === activeTruck.id)}
                      onPayOwner={(ownerId) => {
                        setSelectedPayOwnerId(ownerId);
                        setExpensesTab('pay-owner');
                        setCurrentView('expenses');
                      }}
                      onInjectCapital={(ownerId) => {
                        setSelectedPayOwnerId(ownerId);
                        setCurrentView('income');
                      }}
                      onEditOwner={(owner) => {
                        setEditingOwner(owner);
                        setIsAddPartnerModalOpen(true);
                      }}
                      onDeleteOwner={handleDeleteOwner}
                      onDeleteTransaction={handleDeleteTransaction}
                      onEditTransaction={setEditingTransaction}
                    />
                  ))}
                </div>
              )}
            </div>
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
        isOpen={deleteModal.isOpen}
        title={deleteModal.title}
        message={deleteModal.message}
        itemName={deleteModal.itemName}
        itemDetails={deleteModal.itemDetails}
        onConfirm={deleteModal.onConfirm}
        onClose={() => setDeleteModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
