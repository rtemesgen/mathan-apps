import React, { useState, useEffect, useRef } from 'react';
import { Truck, Owner, Transaction, TransactionType } from './types';
import { calculateTruckFinancials, formatCurrency, formatDate } from './utils/formatters';
import { createTruck, createTruckOwner, createTruckTransaction, deleteTruck, deleteTruckOwner, loadTruckData, loadTruckWorkspaceMembers, softDeleteTruckTransaction, updateTruck, updateTruckOwner, updateTruckTransaction } from './truckApi';
import { useAuth } from '../../auth/AuthProvider';
import { useAndroidBackHandler } from '../../hooks/useAndroidBackButton';
import { syncQueue } from '../../lib/offlineSync';
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
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal';
import { TruckSelect } from './components/TruckSelect';
import { UserPlus, Plus, Users, ArrowUpDown } from 'lucide-react';
import './index.css';

export default function App() {
  const { workspace, canEditApp, isGuest } = useAuth();
  const [trucks, setTrucks] = useState<Truck[]>([]);

  const [currentTruckId, setCurrentTruckId] = useState<string>(() => {
    return '';
  });

  const [owners, setOwners] = useState<Owner[]>([]);

  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [sortBy, setSortBy] = useState<string>('balance');
  const [calculationDate, setCalculationDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

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
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const editable = canEditApp('truck');
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<Array<{ user_id: string; email: string; display_name: string }>>([]);
  const [error, setError] = useState('');
  const preferencesReady = useRef(false);
  const preferencesReadyKey = useRef('');
  const preferenceKey = workspace ? `mathan_truck_preferences_${workspace.id}` : '';
  useEffect(() => {
    if (!preferencesReady.current || preferencesReadyKey.current !== preferenceKey || !preferenceKey) return;
    localStorage.setItem(preferenceKey, JSON.stringify({ view: currentView, truckId: currentTruckId, date: calculationDate, sortBy }));
  }, [preferenceKey, currentView, currentTruckId, calculationDate, sortBy]);
  useEffect(() => {
    preferencesReady.current = false;
    preferencesReadyKey.current = '';
    if (!preferenceKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}') as { view?: string; truckId?: string; date?: string; sortBy?: string };
      if (saved.view) setCurrentView(saved.view);
      if (saved.truckId) setCurrentTruckId(saved.truckId);
      if (saved.date) setCalculationDate(saved.date);
      if (saved.sortBy) setSortBy(saved.sortBy);
    } catch { /* preferences are optional */ }
    preferencesReadyKey.current = preferenceKey;
    preferencesReady.current = true;
  }, [preferenceKey]);
  const refresh = async () => { if (!workspace) return; setLoading(true); try { if (!isGuest) await syncQueue(workspace.id); const data = await loadTruckData(workspace.id, isGuest); setTrucks(data.trucks); setOwners(data.owners); setTransactions(data.transactions); setCurrentTruckId((current) => data.trucks.some((truck) => truck.id === current) ? current : (data.trucks[0]?.id ?? '')); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load Truck data.'); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); if (workspace && !isGuest) void loadTruckWorkspaceMembers(workspace.id).then(setMembers).catch(() => undefined); else setMembers([]); }, [workspace?.id, isGuest]);
  useEffect(() => { const handler = () => { if (workspace) void refresh(); }; window.addEventListener('online', handler); return () => window.removeEventListener('online', handler); }, [workspace?.id]);

  const activeTruck = trucks.find((t) => t.id === currentTruckId) || trucks[0] || { id: '', name: 'No trucks yet', unitNumber: '', makeModel: '', vin: '', cashOnHand: 0, licensePlate: '' };

  // Filter owners strictly for the active truck
  const activeTruckOwners = owners.filter(
    (o) => o.truckId === activeTruck.id || (!o.truckId && activeTruck.id === 'truck-1')
  );

  // Calculate current financials for active truck and its specific partners
  const truckFinancials = calculateTruckFinancials(
    activeTruck,
    activeTruckOwners,
    transactions.filter((t) => t.truckId === activeTruck.id),
    calculationDate
  );

  // Sorting owner summaries according to active filter
  const sortedOwnerSummaries = [...truckFinancials.ownerSummaries].sort((a, b) => {
    if (sortBy === 'balance') {
      return b.totalUnpaidMoneyOwed - a.totalUnpaidMoneyOwed;
    } else if (sortBy === 'rate') {
      return b.owner.monthlyDrawRate - a.owner.monthlyDrawRate;
    } else if (sortBy === 'equity') {
      return b.owner.equityPercentage - a.owner.equityPercentage;
    } else if (sortBy === 'name') {
      return a.owner.name.localeCompare(b.owner.name);
    }
    return 0;
  });

  // Handlers for cash & equity actions
  const handleAddTransaction = async (txData: {
    truckId: string;
    date: string;
    type: TransactionType;
    category: string;
    amount: number;
    ownerId?: string;
    description: string;
    referenceNo?: string;
  }) => {
    if (!workspace || !editable) return;
    try { await createTruckTransaction(workspace.id, txData, isGuest); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save Truck transaction.'); }
  };

  const handleUpdateTransaction = async (txData: Omit<Transaction, 'id'>) => {
    if (!workspace || !editable || !editingTransaction) return;
    try { await updateTruckTransaction(workspace.id, { ...editingTransaction, ...txData }, isGuest); await refresh(); setEditingTransaction(null); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update Truck transaction.'); }
  };

  const handlePayOwnerSubmit = async (ownerId: string, amount: number, memo: string) => {
    const targetOwner = owners.find((o) => o.id === ownerId);
    await handleAddTransaction({
      truckId: activeTruck.id,
      date: calculationDate || new Date().toISOString().split('T')[0],
      type: 'CAPITAL_REPAYMENT',
      category: 'Owner Debt Clearance',
      amount,
      ownerId,
      description: memo || `Debt repayment to ${targetOwner?.name || 'Owner'}`,
      referenceNo: `PAY-${Math.floor(1000 + Math.random() * 9000)}`,
    });
  };

  const handleExecuteProfitDistribution = async (allocations: { ownerId: string; amount: number }[]) => {
    const today = calculationDate || new Date().toISOString().split('T')[0];
    allocations.forEach(({ ownerId, amount }) => {
      if (amount <= 0) return;
      const owner = owners.find((o) => o.id === ownerId);
      void handleAddTransaction({
        truckId: activeTruck.id,
        date: today,
        type: 'PROFIT_DISTRIBUTION',
        category: 'Profit Equity Dividend',
        amount,
        ownerId,
        description: `${owner?.name || 'Owner'} ${owner?.equityPercentage}% Net Profit Distribution`,
        referenceNo: `DIV-${Math.floor(1000 + Math.random() * 9000)}`,
      });
    });
  };

  const handleAddOrUpdateOwner = async (ownerData: {
    id?: string;
    truckId: string;
    name: string;
    startDate: string;
    equityPercentage: number;
    monthlyDrawRate: number;
  }) => {
    if (ownerData.id) {
      const existing = owners.find((owner) => owner.id === ownerData.id);
      if (workspace && editable && existing) { try { await updateTruckOwner(workspace.id, { ...existing, ...ownerData, id: ownerData.id }, isGuest); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update partner.'); } }
    } else {
      if (workspace && editable) { try { await createTruckOwner(workspace.id, { ...ownerData, truckId: ownerData.truckId || activeTruck.id, avatarColor: 'bg-slate-800 text-white' }, isGuest); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not add partner.'); } }
    }
  };

  const handleAddTruckSubmit = (truckData: {
    name: string;
    unitNumber: string;
    makeModel: string;
    vin: string;
    cashOnHand: number;
    licensePlate: string;
  }) => {
    if (!workspace || !editable) return;
    void createTruck(workspace.id, truckData, isGuest).then((newTruck) => { setCurrentTruckId(newTruck.id); return refresh(); }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not add truck.'));
  };

  const handleUpdateTruck = async (truckData: Truck) => {
    if (!workspace || !editable) return;
    try { await updateTruck(workspace.id, truckData, isGuest); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update truck.'); }
  };

  const handleDeleteTruck = (truckId: string) => {
    const truck = trucks.find((item) => item.id === truckId);
    setDeleteModal({
      isOpen: true,
      title: 'Delete truck',
      message: 'This removes the truck from active fleet lists. Its historical records remain recoverable.',
      itemName: truck?.name ?? 'Truck',
      itemDetails: truck ? `Unit ${truck.unitNumber} · ${truck.makeModel || 'Fleet vehicle'}` : undefined,
      onConfirm: () => {
        if (workspace && editable) void deleteTruck(workspace.id, truckId, isGuest).then(refresh).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not delete truck.'));
        setDeleteModal((previous) => ({ ...previous, isOpen: false }));
      },
    });
  };

  const handleDeleteTransaction = (txId: string) => {
    const tx = transactions.find((t) => t.id === txId);
    setDeleteModal({
      isOpen: true,
      title: 'Delete Transaction',
      message: 'Do you want to delete this transaction record?',
      itemName: tx ? `${tx.category || tx.type} • ${formatCurrency(tx.amount)}` : 'Transaction entry',
      itemDetails: tx ? `Date: ${formatDate(tx.date)} • ${tx.description}` : undefined,
      onConfirm: () => {
        if (workspace && editable) void softDeleteTruckTransaction(workspace.id, txId, isGuest).then(refresh).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not delete transaction.'));
        setDeleteModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleDeleteOwner = (ownerId: string) => {
    const owner = owners.find((o) => o.id === ownerId);
    setDeleteModal({
      isOpen: true,
      title: 'Delete Partner',
      message: 'Do you want to remove this partner from the fleet?',
      itemName: owner ? `${owner.name} (${owner.equityPercentage}% Equity)` : 'Partner',
      itemDetails: owner
        ? `Monthly Draw: $${owner.monthlyDrawRate.toLocaleString()} • Truck: ${trucks.find((t) => t.id === owner.truckId)?.name || 'Active Unit'}`
        : undefined,
      onConfirm: () => {
        if (workspace && editable) void deleteTruckOwner(workspace.id, ownerId, isGuest).then(refresh).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not delete partner.'));
        setDeleteModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

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
        <main className="mobile-content-safe flex-1 overflow-y-auto pb-16 sm:pb-8">{error && <div role="alert" className="mx-auto mt-3 max-w-3xl rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">{error}</div>}{loading && <div className="mx-auto mt-3 max-w-3xl rounded-xl bg-white p-3 text-xs text-zinc-500">Loading Truck data…</div>}
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
        onSubmit={(data) => void handleUpdateTransaction(data)}
        onClose={() => setEditingTransaction(null)}
      />

      {/* Global Confirmation Popup for Deleting */}
      <ConfirmDeleteModal
        isOpen={deleteModal.isOpen}
        title={deleteModal.title}
        message={deleteModal.message}
        itemName={deleteModal.itemName}
        itemDetails={deleteModal.itemDetails}
        onConfirm={deleteModal.onConfirm}
        onCancel={() => setDeleteModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
