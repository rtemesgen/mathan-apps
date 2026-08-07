import React, { useState, useEffect, useRef } from 'react';
import { Employee, Transaction, SalaryChange } from './types';
import { INITIAL_EMPLOYEES, INITIAL_TRANSACTIONS } from './data/mockData';
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
import { useCloudSnapshot } from '../../hooks/useCloudSnapshot';

export default function App() {
  // Navigation active tab
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
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

  const [employees, setEmployees] = useCloudSnapshot<Employee[]>('payroll', 'employees', INITIAL_EMPLOYEES);
  const [transactions, setTransactions] = useCloudSnapshot<Transaction[]>('payroll', 'transactions', INITIAL_TRANSACTIONS);

  // Global evaluation as-of date (defaults to today)
  const [asOfDate, setAsOfDate] = useState<string>(getTodayString());

  // Detail inspection drawer state
  const [selectedDetailEmp, setSelectedDetailEmp] = useState<Employee | null>(null);
  const [selectedPayEmployeeId, setSelectedPayEmployeeId] = useState<string | undefined>();

  // Keep selectedDetailEmp updated if underlying data changes
  useEffect(() => {
    if (selectedDetailEmp) {
      const updated = employees.find((e) => e.id === selectedDetailEmp.id);
      if (updated) setSelectedDetailEmp(updated);
    }
  }, [employees]);

  // Handlers
  const handleAddEmployee = (newEmp: Employee) => {
    setEmployees((prev) => [newEmp, ...prev]);
  };

  const handleSaveRaise = (employeeId: string, raise: SalaryChange) => {
    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id === employeeId) {
          const updatedHistory = [...(emp.salaryHistory || []), raise].sort((a, b) =>
            a.effectiveDate.localeCompare(b.effectiveDate)
          );
          return {
            ...emp,
            salaryHistory: updatedHistory,
          };
        }
        return emp;
      })
    );
  };

  const handleRecordWithdrawal = (newTx: Transaction) => {
    setTransactions((prev) => [newTx, ...prev]);
  };

  const handleDeleteTransaction = (txId: string) => {
    if (window.confirm('Are you sure you want to delete this transaction record?')) {
      setTransactions((prev) => prev.filter((t) => t.id !== txId));
    }
  };

  const handleResetData = () => {
    if (window.confirm('Reset all employee records and transaction logs to sample demo data?')) {
      setEmployees(INITIAL_EMPLOYEES);
      setTransactions(INITIAL_TRANSACTIONS);
      setAsOfDate(getTodayString());
    }
  };

  const stats = calculateCompanyStats(employees, transactions, asOfDate);

  return (
    <div className="min-h-screen bg-[#f6f5ef] text-zinc-900 flex flex-col md:flex-row font-sans antialiased selection:bg-zinc-800 selection:text-white">
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
            onResetData={handleResetData}
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
          <div ref={mobileSidebarRef} className="relative z-10 w-56 h-full flex flex-col shadow-2xl">
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
              onResetData={handleResetData}
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

        <main className="flex-1 p-2 sm:p-3 max-w-7xl w-full mx-auto">
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
        />
      )}
    </div>
  );
}
