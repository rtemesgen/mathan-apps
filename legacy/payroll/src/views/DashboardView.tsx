import React from 'react';
import { Employee, Transaction, CompanyStats } from '../types';
import { EmployeeList } from '../components/EmployeeList';
import {
  Users,
  DollarSign,
  TrendingUp,
  Banknote,
  Calendar,
  Building,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  CreditCard
} from 'lucide-react';

interface DashboardViewProps {
  employees: Employee[];
  transactions: Transaction[];
  stats: CompanyStats;
  asOfDate: string;
  onSelectEmployee: (emp: Employee) => void;
  onNavigateTab: (tab: 'add-employee' | 'pay-salary' | 'add-raise' | 'reports' | 'transactions') => void;
  onRecordWithdrawal: (emp: Employee) => void;
  onAddRaise: (emp: Employee) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  employees,
  transactions,
  stats,
  asOfDate,
  onSelectEmployee,
  onNavigateTab,
  onRecordWithdrawal,
  onAddRaise,
}) => {
  const formatMoney = (val: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);

  return (
    <div className="space-y-2 sm:space-y-2.5">
      {/* Top Banner KPI Cards Grid (3 Columns) */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {/* KPI 1: Net Owed / Company Liability */}
        <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-[#e8e6dc] shadow-2xs flex flex-col justify-between">
          <span className="text-[9px] sm:text-xs font-semibold text-zinc-500 block truncate">Total Owed</span>
          <div className="font-serif-title text-xs sm:text-base lg:text-lg font-bold text-zinc-900 mt-0.5 truncate">
            {formatMoney(stats.totalCompanyLiability)}
          </div>
          <p className="text-[8px] sm:text-[10px] text-zinc-400 mt-0.5 font-medium truncate">Unpaid balance</p>
        </div>

        {/* KPI 2: Total Earned */}
        <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-[#e8e6dc] shadow-2xs flex flex-col justify-between">
          <span className="text-[9px] sm:text-xs font-semibold text-zinc-500 block truncate">Total Earned</span>
          <div className="font-serif-title text-xs sm:text-base lg:text-lg font-bold text-zinc-900 mt-0.5 truncate">
            {formatMoney(stats.totalCompanyAccrued)}
          </div>
          <p className="text-[8px] sm:text-[10px] text-zinc-400 mt-0.5 font-medium truncate">Cumulative earned</p>
        </div>

        {/* KPI 3: Total Withdrawn */}
        <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-[#e8e6dc] shadow-2xs flex flex-col justify-between">
          <span className="text-[9px] sm:text-xs font-semibold text-zinc-500 block truncate">Total Paid Out</span>
          <div className="font-serif-title text-xs sm:text-base lg:text-lg font-bold text-emerald-800 mt-0.5 truncate">
            {formatMoney(stats.totalCompanyPaidOut)}
          </div>
          <p className="text-[8px] sm:text-[10px] text-zinc-400 mt-0.5 font-medium truncate">{transactions.length} payments</p>
        </div>
      </div>

      {/* Main Employee Balance Table & Cards Section */}
      <EmployeeList
        employees={employees}
        transactions={transactions}
        asOfDate={asOfDate}
        onSelectEmployee={onSelectEmployee}
        onRecordWithdrawal={onRecordWithdrawal}
        onAddRaise={onAddRaise}
        onEditEmployee={onSelectEmployee}
        onOpenAddModal={() => onNavigateTab('add-employee')}
      />
    </div>
  );
};

