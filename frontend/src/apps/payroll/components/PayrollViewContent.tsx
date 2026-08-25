import React from 'react';
import type { Employee, SalaryChange, Transaction, CompanyStats } from '../types';
import type { ActiveTab } from './Sidebar';
import { DashboardView } from '../views/DashboardView';
import { AddEmployeeView } from '../views/AddEmployeeView';
import { PaySalaryView } from '../views/PaySalaryView';
import { AddRaiseView } from '../views/AddRaiseView';
import { ReportsView } from '../views/ReportsView';
import { TransactionsView } from '../views/TransactionsView';
import { ManageEmployeesView } from '../views/ManageEmployeesView';

type PayrollViewContentProps = {
  activeTab: ActiveTab;
  employees: Employee[];
  transactions: Transaction[];
  stats: CompanyStats;
  asOfDate: string;
  selectedPayEmployeeId?: string;
  onSelectEmployee: (employee: Employee) => void;
  onNavigateTab: (tab: ActiveTab) => void;
  onRequestPay: (employee: Employee) => void;
  onRecordWithdrawal: (transaction: Transaction) => Promise<void>;
  onAddEmployee: (employee: Employee) => Promise<void>;
  onSaveEmployee: (employee: Employee) => Promise<void>;
  onDeleteEmployee: (employeeId: string) => Promise<void>;
  onSaveRaise: (employeeId: string, raise: SalaryChange) => Promise<void>;
  onDeleteTransaction: (transactionId: string) => Promise<void>;
  onOpenExport: (filters?: { entityId?: string; startDate?: string; endDate?: string; transactionType?: string; query?: string }) => void;
};

export function PayrollViewContent({
  activeTab,
  employees,
  transactions,
  stats,
  asOfDate,
  selectedPayEmployeeId,
  onSelectEmployee,
  onNavigateTab,
  onRequestPay,
  onRecordWithdrawal,
  onAddEmployee,
  onSaveEmployee,
  onDeleteEmployee,
  onSaveRaise,
  onDeleteTransaction,
  onOpenExport,
}: PayrollViewContentProps) {
  return <main className="mobile-content-safe flex-1 max-w-7xl w-full mx-auto p-2 pb-16 sm:p-3 sm:pb-6">
    {activeTab === 'dashboard' && <DashboardView
      employees={employees}
      transactions={transactions}
      stats={stats}
      asOfDate={asOfDate}
      onSelectEmployee={onSelectEmployee}
      onNavigateTab={onNavigateTab}
      onRecordWithdrawal={onRequestPay}
      onAddRaise={() => onNavigateTab('add-raise')}
    />}

    {activeTab === 'add-employee' && <AddEmployeeView onAddEmployee={onAddEmployee} asOfDate={asOfDate} onNavigateTab={onNavigateTab} />}

    {activeTab === 'manage-employees' && <ManageEmployeesView employees={employees} onSaveEmployee={onSaveEmployee} onDeleteEmployee={onDeleteEmployee} />}

    {activeTab === 'pay-salary' && <PaySalaryView
      employees={employees}
      transactions={transactions}
      asOfDate={asOfDate}
      initialEmployeeId={selectedPayEmployeeId}
      onRecordWithdrawal={onRecordWithdrawal}
      onNavigateTab={onNavigateTab}
    />}

    {activeTab === 'add-raise' && <AddRaiseView employees={employees} asOfDate={asOfDate} onSaveRaise={onSaveRaise} onNavigateTab={onNavigateTab} />}

    {activeTab === 'reports' && <ReportsView employees={employees} transactions={transactions} asOfDate={asOfDate} onSelectEmployee={onSelectEmployee} onOpenExport={onOpenExport} />}

    {activeTab === 'transactions' && <TransactionsView transactions={transactions} employees={employees} onDeleteTransaction={onDeleteTransaction} onNavigateTab={onNavigateTab} onOpenExport={onOpenExport} />}
  </main>;
}
