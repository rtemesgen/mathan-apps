import React, { useState, useEffect, useRef } from 'react';
import { Employee, Transaction, SalaryChange } from './types';
import { calculateCompanyStats, getTodayString } from './utils/calc';

import { Sidebar, ActiveTab } from './components/Sidebar';
import { TopNavbar } from './components/TopNavbar';
import { EmployeeDetailModal } from './components/EmployeeDetailModal';

import { PayrollViewContent } from './components/PayrollViewContent';
import { useAndroidBackHandler } from '../../hooks/useAndroidBackButton';
import { useAuth } from '../../auth/AuthProvider';
import { usePayrollRepository } from './payrollRepository';
import { ExportDialog } from '../../components/ExportDialog';
import { buildPayrollExportReports } from './payrollExport';

const PAYROLL_TABS: ActiveTab[] = ['dashboard', 'add-employee', 'manage-employees', 'pay-salary', 'add-raise', 'reports', 'transactions'];

export default function App() {
  const { workspace, isGuest } = useAuth();
  const payrollTabKey = `mathan_payroll_active_tab_${isGuest ? 'standalone' : workspace?.id ?? 'anonymous'}`;
  // Navigation active tab
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [tabHydrated, setTabHydrated] = useState(false);

  useEffect(() => {
    setTabHydrated(false);
    const saved = window.localStorage.getItem(payrollTabKey) as ActiveTab | null;
    if (saved && PAYROLL_TABS.includes(saved)) setActiveTab(saved);
    setTabHydrated(true);
  }, [payrollTabKey]);

  useEffect(() => {
    if (tabHydrated) window.localStorage.setItem(payrollTabKey, activeTab);
  }, [activeTab, payrollTabKey, tabHydrated]);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024; // Default open on large screens, closed on mobile/tablet
    }
    return true;
  });

  const desktopSidebarRef = useRef<HTMLDivElement>(null);
  const mobileSidebarRef = useRef<HTMLDivElement>(null);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);

  // Close side menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!isSidebarOpen || window.innerWidth >= 768) return;

      const target = event.target as Node;
      const isInsideDesktop = desktopSidebarRef.current?.contains(target);
      const isInsideMobile = mobileSidebarRef.current?.contains(target);
      const isInsideToggleBtn = toggleBtnRef.current?.contains(target);

      if (!isInsideDesktop && !isInsideMobile && !isInsideToggleBtn) {
        setIsSidebarOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSidebarOpen]);

  const { employees: [employees, , employeesReady], transactions: [transactions, , transactionsReady], actions } = usePayrollRepository();

  // Global evaluation as-of date (defaults to today)
  const [asOfDate, setAsOfDate] = useState<string>(getTodayString());

  // Detail inspection drawer state
  const [selectedDetailEmp, setSelectedDetailEmp] = useState<Employee | null>(null);
  const [selectedPayEmployeeId, setSelectedPayEmployeeId] = useState<string | undefined>();
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFilters, setExportFilters] = useState<{ entityId?: string; startDate?: string; endDate?: string; transactionType?: string; query?: string }>({});
  const openExport = (filters: typeof exportFilters = {}) => { setExportFilters(filters); setExportOpen(true); };

  useAndroidBackHandler(() => {
    if (selectedDetailEmp) {
      setSelectedDetailEmp(null);
      return true;
    }
    if (isSidebarOpen && window.innerWidth < 768) {
      setIsSidebarOpen(false);
      return true;
    }
    if (activeTab !== 'dashboard') {
      setActiveTab('dashboard');
      return true;
    }
    return false;
  }, [selectedDetailEmp, isSidebarOpen, activeTab]);

  // Keep selectedDetailEmp updated if underlying data changes
  useEffect(() => {
    if (selectedDetailEmp) {
      const updated = employees.find((e) => e.id === selectedDetailEmp.id);
      if (updated) setSelectedDetailEmp(updated);
    }
  }, [employees]);

  // Handlers
  const handleAddEmployee = async (newEmp: Employee) => {
    await actions.saveEmployee(newEmp);
  };

  const handleSaveEmployee = async (updatedEmployee: Employee) => {
    await actions.saveEmployee(updatedEmployee);
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    await actions.deleteEmployee(employeeId);
    if (selectedPayEmployeeId === employeeId) setSelectedPayEmployeeId(undefined);
  };

  const handleSaveRaise = async (employeeId: string, raise: SalaryChange) => {
    await actions.saveRaise(employeeId, raise);
  };

  const handleRecordWithdrawal = async (newTx: Transaction) => {
    await actions.saveTransaction(newTx);
  };

  const handleDeleteTransaction = async (txId: string) => {
    await actions.deleteTransaction(txId);
  };

  const handleUpdateTransaction = async (updated: Transaction) => {
    await actions.saveTransaction(updated);
  };

  const handleRemoveTransaction = async (txId: string) => {
    await actions.deleteTransaction(txId);
  };

  const handleUpdateRaise = async (employeeId: string, updatedRaise: SalaryChange) => {
    await actions.updateRaise(employeeId, updatedRaise);
  };

  const handleDeleteRaise = async (employeeId: string, raiseId: string) => {
    await actions.deleteRaise(employeeId, raiseId);
  };

  const stats = calculateCompanyStats(employees, transactions, asOfDate);

  return (
    <div className="erp-app min-h-screen bg-[#f8f6f0] text-zinc-900 flex flex-col md:flex-row font-sans antialiased selection:bg-zinc-800 selection:text-white">
      {/* Sidebar for Desktop (visible when isSidebarOpen is true) */}
      {isSidebarOpen && (
        <div ref={desktopSidebarRef} className="hidden md:block shrink-0 z-30 transition-all duration-300">
          <Sidebar
            activeTab={activeTab}
            setActiveTab={(tab) => {
              setActiveTab(tab);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            stats={stats}
            asOfDate={asOfDate}
            onAsOfDateChange={setAsOfDate}
            employeeCount={employees.length}
            onClose={() => setIsSidebarOpen(false)}
          />
        </div>
      )}

      {/* Mobile / Tablet Sidebar Drawer Overlay */}
      {isSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-[100] flex animate-in fade-in duration-200">
          <div
            className="fixed inset-0 bg-zinc-900/60 backdrop-blur-xs"
            onClick={() => setIsSidebarOpen(false)}
          ></div>
          <div ref={mobileSidebarRef} className="mobile-sidebar-drawer relative z-10 flex h-[100dvh] max-h-[100dvh] w-72 flex-col overflow-y-auto overscroll-contain shadow-2xl">
            <Sidebar
              activeTab={activeTab}
              setActiveTab={(tab) => {
                setActiveTab(tab);
                setIsSidebarOpen(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              stats={stats}
              asOfDate={asOfDate}
              onAsOfDateChange={setAsOfDate}
              employeeCount={employees.length}
              onClose={() => setIsSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <TopNavbar
          activeTab={activeTab}
          asOfDate={asOfDate}
          onAsOfDateChange={setAsOfDate}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          toggleButtonRef={toggleBtnRef}
        />

        <PayrollViewContent
          activeTab={activeTab}
          employees={employees}
          transactions={transactions}
          dataReady={employeesReady && transactionsReady}
          stats={stats}
          asOfDate={asOfDate}
          selectedPayEmployeeId={selectedPayEmployeeId}
          onSelectEmployee={setSelectedDetailEmp}
          onNavigateTab={setActiveTab}
          onRequestPay={(employee) => { setSelectedPayEmployeeId(employee.id); setActiveTab('pay-salary'); }}
          onAddEmployee={handleAddEmployee}
          onSaveEmployee={handleSaveEmployee}
          onDeleteEmployee={handleDeleteEmployee}
          onSaveRaise={handleSaveRaise}
          onRecordWithdrawal={handleRecordWithdrawal}
          onDeleteTransaction={handleDeleteTransaction}
          onOpenExport={openExport}
        />
      </div>

      {/* Employee Detail Inspector Sheet */}
      {selectedDetailEmp && (
        <EmployeeDetailModal
          employee={selectedDetailEmp}
          transactions={transactions}
          asOfDate={asOfDate}
          onClose={() => setSelectedDetailEmp(null)}
          onRecordWithdrawal={(emp) => {
            setSelectedDetailEmp(null);
            setSelectedPayEmployeeId(emp.id);
            setActiveTab('pay-salary');
          }}
          onAddRaise={(emp) => {
            setSelectedDetailEmp(null);
            setActiveTab('add-raise');
          }}
          onDeleteTransaction={handleDeleteTransaction}
          onUpdateTransaction={handleUpdateTransaction}
          onRemoveTransaction={handleRemoveTransaction}
          onUpdateRaise={handleUpdateRaise}
          onDeleteRaise={handleDeleteRaise}
        />
      )}
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} context={{ companyName: workspace?.name ?? 'Company', appName: 'Payroll', reportName: activeTab === 'transactions' ? 'Payment History' : 'Payroll History', report: buildPayrollExportReports({ employees, transactions, asOfDate })[activeTab === 'transactions' ? 3 : 1], activeFilters: { ...exportFilters, ...(activeTab === 'reports' ? { endDate: exportFilters.endDate ?? asOfDate } : {}) }, availableDetailLevels: ['condensed', 'detailed', 'full'], availableEntities: employees.map(employee => ({ value: employee.id, label: employee.name })) }} />
    </div>
  );
}
