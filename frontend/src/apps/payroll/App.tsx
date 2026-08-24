import React, { useState, useEffect, useRef } from 'react';
import { Employee, Transaction, SalaryChange } from './types';
import { calculateCompanyStats, getTodayString } from './utils/calc';

import { Sidebar, ActiveTab } from './components/Sidebar';
import { TopNavbar } from './components/TopNavbar';
import { EmployeeDetailModal } from './components/EmployeeDetailModal';

import { DashboardView } from './views/DashboardView';
import { AddEmployeeView } from './views/AddEmployeeView';
import { PaySalaryView } from './views/PaySalaryView';
import { AddRaiseView } from './views/AddRaiseView';
import { ReportsView } from './views/ReportsView';
import { TransactionsView } from './views/TransactionsView';
import { ManageEmployeesView } from './views/ManageEmployeesView';
import { useAndroidBackHandler } from '../../hooks/useAndroidBackButton';
import { useAuth } from '../../auth/AuthProvider';
import { addEmployee, addRaise, addTransaction, removeEmployee, removeRaise, removeTransaction, updateEmployee, updateRaise, updateTransaction } from './payrollRepository';
import { usePayrollRepository } from './payrollStore';

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
      if (!isSidebarOpen) return;

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

  const { employees: [employees, , , , saveEmployees], transactions: [transactions, , , , saveTransactions] } = usePayrollRepository();

  // Global evaluation as-of date (defaults to today)
  const [asOfDate, setAsOfDate] = useState<string>(getTodayString());

  // Detail inspection drawer state
  const [selectedDetailEmp, setSelectedDetailEmp] = useState<Employee | null>(null);
  const [selectedPayEmployeeId, setSelectedPayEmployeeId] = useState<string | undefined>();

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
    await saveEmployees(addEmployee(newEmp, employees).data);
  };

  const handleSaveEmployee = async (updatedEmployee: Employee) => {
    await saveEmployees(updateEmployee(updatedEmployee, employees).data);
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    const result = removeEmployee(employeeId, employees, transactions).data;
    await saveEmployees(result.employees);
    await saveTransactions(result.transactions);
    if (selectedPayEmployeeId === employeeId) setSelectedPayEmployeeId(undefined);
  };

  const handleSaveRaise = async (employeeId: string, raise: SalaryChange) => {
    await saveEmployees(addRaise(employeeId, raise, employees).data);
  };

  const handleRecordWithdrawal = async (newTx: Transaction) => {
    await saveTransactions(addTransaction(newTx, transactions).data);
  };

  const handleDeleteTransaction = async (txId: string) => {
    await saveTransactions(removeTransaction(txId, transactions).data);
  };

  const handleUpdateTransaction = async (updated: Transaction) => {
    await saveTransactions(updateTransaction(updated, transactions).data);
  };

  const handleRemoveTransaction = async (txId: string) => {
    await saveTransactions(removeTransaction(txId, transactions).data);
  };

  const handleUpdateRaise = async (employeeId: string, updatedRaise: SalaryChange) => {
    await saveEmployees(updateRaise(employeeId, updatedRaise, employees).data);
  };

  const handleDeleteRaise = async (employeeId: string, raiseId: string) => {
    await saveEmployees(removeRaise(employeeId, raiseId, employees).data);
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

        <main className="mobile-content-safe flex-1 max-w-7xl w-full mx-auto p-2 pb-16 sm:p-3 sm:pb-6">
          {activeTab === 'dashboard' && (
            <DashboardView
              employees={employees}
              transactions={transactions}
              stats={stats}
              asOfDate={asOfDate}
              onSelectEmployee={(emp) => setSelectedDetailEmp(emp)}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onRecordWithdrawal={(emp) => {
                setSelectedPayEmployeeId(emp.id);
                setActiveTab('pay-salary');
              }}
              onAddRaise={(emp) => {
                setActiveTab('add-raise');
              }}
            />
          )}

          {activeTab === 'add-employee' && (
            <AddEmployeeView
              onAddEmployee={handleAddEmployee}
              asOfDate={asOfDate}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'manage-employees' && (
            <ManageEmployeesView
              employees={employees}
              onSaveEmployee={handleSaveEmployee}
              onDeleteEmployee={handleDeleteEmployee}
            />
          )}

          {activeTab === 'pay-salary' && (
            <PaySalaryView
              employees={employees}
              transactions={transactions}
              asOfDate={asOfDate}
              initialEmployeeId={selectedPayEmployeeId}
              onRecordWithdrawal={handleRecordWithdrawal}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'add-raise' && (
            <AddRaiseView
              employees={employees}
              asOfDate={asOfDate}
              onSaveRaise={handleSaveRaise}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              employees={employees}
              transactions={transactions}
              asOfDate={asOfDate}
              onSelectEmployee={setSelectedDetailEmp}
            />
          )}

          {activeTab === 'transactions' && (
            <TransactionsView
              transactions={transactions}
              employees={employees}
              onDeleteTransaction={handleDeleteTransaction}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

        </main>
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
    </div>
  );
}
