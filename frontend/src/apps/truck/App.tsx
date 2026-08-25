import React, { useState } from 'react';
import { Truck, Owner, Transaction } from './types';
import { useAuth } from '../../auth/AuthProvider';
import { ExportDialog } from '../../components/ExportDialog';
import { buildTruckExportReports } from './truckExport';
import { useAndroidBackHandler } from '../../hooks/useAndroidBackButton';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { TruckViewContent } from './components/TruckViewContent';
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
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSelection, setExportSelection] = useState({ id: 'complete-statement', name: 'Truck Financial Report' });
  const openExport = (id = 'complete-statement', name = 'Truck Financial Report') => { setExportSelection({ id, name }); setExportOpen(true); };

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
          onOpenExport={() => openExport(currentView === 'cash-report' ? 'income-expenses' : currentView === 'reports' ? 'owner-shares-loans' : currentView === 'history' ? 'transactions-by-truck-owner' : undefined, currentView === 'cash-report' ? 'Cash Flow' : currentView === 'reports' ? 'Partner Financials' : currentView === 'history' ? 'Activity History' : undefined)}
        />

        <TruckViewContent
          currentView={currentView}
          setCurrentView={setCurrentView}
          trucks={trucks}
          owners={owners}
          transactions={transactions}
          currentTruckId={currentTruckId}
          setCurrentTruckId={setCurrentTruckId}
          activeTruck={activeTruck}
          activeTruckOwners={activeTruckOwners}
          truckFinancials={truckFinancials}
          sortedOwnerSummaries={sortedOwnerSummaries}
          sortBy={sortBy}
          setSortBy={setSortBy}
          selectedPayOwnerId={selectedPayOwnerId}
          setSelectedPayOwnerId={setSelectedPayOwnerId}
          expensesTab={expensesTab}
          setExpensesTab={setExpensesTab}
          setEditingOwner={setEditingOwner}
          openPartnerModal={() => setIsAddPartnerModalOpen(true)}
          setEditingTransaction={setEditingTransaction}
          handleAddTransaction={handleAddTransaction}
          handleUpdateTransaction={handleUpdateTransaction}
          handlePayOwnerSubmit={handlePayOwnerSubmit}
          handleExecuteProfitDistribution={handleExecuteProfitDistribution}
          handleDeleteOwner={handleDeleteOwner}
          handleDeleteTransaction={handleDeleteTransaction}
          handleAddTruckSubmit={handleAddTruckSubmit}
          handleUpdateTruck={handleUpdateTruck}
          handleDeleteTruck={handleDeleteTruck}
          loading={loading}
          error={error}
          dataError={dataError}
          onExportReport={openExport}
        />
      </div>

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} context={{ companyName: workspace?.name ?? 'Company', appName: 'Truck Equity', reportName: exportSelection.name, report: (buildTruckExportReports({ trucks, owners, transactions }).find((item) => item.id === exportSelection.id) ?? buildTruckExportReports({ trucks, owners, transactions })[0]), selectedEntity: activeTruck ? { value: activeTruck.id, label: `${activeTruck.name} (${activeTruck.unitNumber})` } : undefined, activeFilters: activeTruck ? { entityId: activeTruck.id } : undefined, availableEntities: trucks.map((truck) => ({ value: truck.id, label: `${truck.name} (${truck.unitNumber})` })) }} />

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
