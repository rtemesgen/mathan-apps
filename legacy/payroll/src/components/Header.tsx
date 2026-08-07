import React from 'react';
import { CompanyStats } from '../types';
import { formatCurrency, formatDate } from '../utils/calc';
import {
  Building2,
  Users,
  Wallet,
  TrendingUp,
  HandCoins,
  Plus,
  FileSpreadsheet,
  Calendar,
  RotateCcw,
  Receipt,
} from 'lucide-react';

interface HeaderProps {
  stats: CompanyStats;
  asOfDate: string;
  onAsOfDateChange: (date: string) => void;
  onOpenAddEmployee: () => void;
  onOpenExportModal: () => void;
  onOpenTransactions: () => void;
  onResetData: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  stats,
  asOfDate,
  onAsOfDateChange,
  onOpenAddEmployee,
  onOpenExportModal,
  onOpenTransactions,
  onResetData,
}) => {
  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
      {/* Top Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-100">
                  Employee Salary & Balance Tracker
                </h1>
                <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30">
                  Real-time Ledger
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Automated wage accruals, backdated raises, and withdrawal balances
              </p>
            </div>
          </div>

          {/* Controls: Evaluation Date & Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Evaluation As-Of Date Selector */}
            <div className="flex items-center bg-slate-800/80 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs">
              <Calendar className="w-3.5 h-3.5 text-indigo-400 mr-2 shrink-0" />
              <span className="text-slate-400 mr-2 whitespace-nowrap">As of Date:</span>
              <input
                type="date"
                value={asOfDate}
                onChange={(e) => onAsOfDateChange(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <button
              onClick={onOpenAddEmployee}
              className="inline-flex items-center px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Employee
            </button>

            <button
              onClick={onOpenTransactions}
              className="inline-flex items-center px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition cursor-pointer"
            >
              <Receipt className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
              All Transactions
            </button>

            <button
              onClick={onOpenExportModal}
              className="inline-flex items-center px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium rounded-lg transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
              Export Payroll
            </button>

            <button
              onClick={onResetData}
              title="Reset to sample demo data"
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg border border-slate-700 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Company Stats KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800/80">
          {/* Total Company Liability / Balance Held */}
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Total Balance Held (Liability)
              </p>
              <p className="text-lg sm:text-xl font-bold text-amber-400 mt-0.5 font-mono">
                {formatCurrency(stats.totalCompanyLiability)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">Money kept with company</p>
            </div>
            <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
              <Wallet className="w-5 h-5" />
            </div>
          </div>

          {/* Total Accrued Earnings */}
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Total Wages Accrued
              </p>
              <p className="text-lg sm:text-xl font-bold text-indigo-300 mt-0.5 font-mono">
                {formatCurrency(stats.totalCompanyAccrued)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">Earned from start dates</p>
            </div>
            <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          {/* Total Paid Out */}
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Total Paid / Withdrawn
              </p>
              <p className="text-lg sm:text-xl font-bold text-emerald-400 mt-0.5 font-mono">
                {formatCurrency(stats.totalCompanyPaidOut)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">Disbursed to employees</p>
            </div>
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
              <HandCoins className="w-5 h-5" />
            </div>
          </div>

          {/* Active Employees & Monthly Payroll */}
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Active Employees
              </p>
              <p className="text-lg sm:text-xl font-bold text-slate-100 mt-0.5 font-mono">
                {stats.activeEmployees}{' '}
                <span className="text-xs text-slate-400 font-normal">/ {stats.totalEmployees}</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Run rate: {formatCurrency(stats.totalMonthlyPayrollRate)}/mo
              </p>
            </div>
            <div className="p-2.5 bg-slate-700/50 text-slate-300 rounded-lg border border-slate-600/50">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
