import React, { useState } from 'react';
import { Employee, Transaction } from '../types';
import { calculateEmployeeAccrual, formatCurrency, formatDate } from '../utils/calc';
import {
  Search,
  Filter,
  Plus,
  TrendingUp,
  HandCoins,
  Calendar,
  Briefcase,
  ChevronRight,
  Sparkles,
  ArrowUpRight
} from 'lucide-react';

interface EmployeeListProps {
  employees: Employee[];
  transactions: Transaction[];
  asOfDate: string;
  onSelectEmployee: (emp: Employee) => void;
  onRecordWithdrawal: (emp: Employee) => void;
  onAddRaise: (emp: Employee) => void;
  onEditEmployee: (emp: Employee) => void;
  onOpenAddModal: () => void;
}

export const EmployeeList: React.FC<EmployeeListProps> = ({
  employees,
  transactions,
  asOfDate,
  onSelectEmployee,
  onRecordWithdrawal,
  onAddRaise,
  onEditEmployee,
  onOpenAddModal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'balance' | 'name' | 'salary' | 'startDate'>('balance');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filter and sort
  const filtered = employees.filter((emp) => {
    return emp.name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const sorted = [...filtered].sort((a, b) => {
    const summaryA = calculateEmployeeAccrual(a, transactions, asOfDate);
    const summaryB = calculateEmployeeAccrual(b, transactions, asOfDate);

    let valA: number | string = 0;
    let valB: number | string = 0;

    if (sortBy === 'balance') {
      valA = summaryA.remainingBalance;
      valB = summaryB.remainingBalance;
    } else if (sortBy === 'salary') {
      valA = summaryA.currentMonthlySalary;
      valB = summaryB.currentMonthlySalary;
    } else if (sortBy === 'name') {
      valA = a.name.toLowerCase();
      valB = b.name.toLowerCase();
    } else if (sortBy === 'startDate') {
      valA = a.startDate;
      valB = b.startDate;
    }

    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSortToggle = (field: 'balance' | 'name' | 'salary' | 'startDate') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="space-y-3">
      {/* Search & Filter Toolbar */}
      <div className="bg-white rounded-xl border border-[#e8e6dc] p-2 sm:p-2.5 shadow-2xs flex flex-col md:flex-row gap-2 items-stretch md:items-center justify-between">
        <div className="flex-1 flex flex-col sm:flex-row gap-2">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search employee by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#f2f0e6] border border-zinc-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-800 text-zinc-900 placeholder:italic placeholder:font-serif"
            />
          </div>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center space-x-1.5 border-t md:border-t-0 pt-2 md:pt-0 border-zinc-100">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 whitespace-nowrap">
            Sort:
          </span>
          <button
            onClick={() => handleSortToggle('balance')}
            className={`px-2.5 py-1 text-xs rounded-full font-bold cursor-pointer transition ${
              sortBy === 'balance'
                ? 'bg-zinc-900 text-white shadow-2xs'
                : 'bg-[#f2f0e6] text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            Balance {sortBy === 'balance' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
          </button>
          <button
            onClick={() => handleSortToggle('salary')}
            className={`px-2.5 py-1 text-xs rounded-full font-bold cursor-pointer transition ${
              sortBy === 'salary'
                ? 'bg-zinc-900 text-white shadow-2xs'
                : 'bg-[#f2f0e6] text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            Salary {sortBy === 'salary' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
          </button>
          <button
            onClick={() => handleSortToggle('name')}
            className={`px-2.5 py-1 text-xs rounded-full font-bold cursor-pointer transition ${
              sortBy === 'name'
                ? 'bg-zinc-900 text-white shadow-2xs'
                : 'bg-[#f2f0e6] text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            Name {sortBy === 'name' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
          </button>
        </div>
      </div>

      {/* Employee Cards Grid */}
      {sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-zinc-300 p-4 text-center">
          <Briefcase className="w-6 h-6 text-zinc-300 mx-auto mb-1" />
          <h3 className="font-serif-title text-xs font-bold text-zinc-900">No employees match criteria</h3>
          <p className="text-[11px] text-zinc-500 mt-0.5 max-w-sm mx-auto font-medium">
            Adjust search keywords or add a new employee profile.
          </p>
          <button
            onClick={onOpenAddModal}
            className="mt-2 inline-flex items-center px-2.5 py-1 bg-[#54623e] hover:bg-[#435031] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition shadow-2xs cursor-pointer"
          >
            <Plus className="w-3 h-3 mr-1" /> Add New Employee
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {sorted.map((emp) => {
            const summary = calculateEmployeeAccrual(emp, transactions, asOfDate);
            const empTxCount = transactions.filter((t) => t.employeeId === emp.id).length;

            return (
              <div
                key={emp.id}
                className="bg-white rounded-xl border border-[#e8e6dc] hover:border-zinc-300 shadow-2xs transition-all flex flex-col justify-between overflow-hidden group p-2 sm:p-2.5 space-y-1.5"
              >
                {/* Employee Card Header */}
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <h3
                      onClick={() => onSelectEmployee(emp)}
                      className="font-serif-title text-sm font-bold text-zinc-900 truncate hover:text-emerald-800 cursor-pointer"
                    >
                      {emp.name}
                    </h3>
                    {emp.status === 'active' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="Active Employee" />
                    )}
                  </div>
                  <span className="text-[9px] text-zinc-400 font-mono font-medium">Started {formatDate(emp.startDate)}</span>
                </div>

                {/* Compact Unpaid Balance Box */}
                <div className="p-2 bg-[#fbfaf6] rounded-lg border border-[#e8e6dc] flex items-center justify-between">
                  <div>
                    <span className="text-[8px] font-extrabold text-amber-800 uppercase tracking-wider block leading-none mb-0.5">
                      Unpaid Balance
                    </span>
                    <span className="font-serif-title text-lg font-bold text-zinc-900 font-mono leading-none">
                      {formatCurrency(summary.remainingBalance)}
                    </span>
                  </div>

                  <button
                    onClick={() => onRecordWithdrawal(emp)}
                    className="px-2.5 py-1 bg-[#54623e] hover:bg-[#435031] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition shadow-2xs flex items-center cursor-pointer shrink-0"
                    title="Pay money to employee"
                  >
                    <HandCoins className="w-3 h-3 mr-1" />
                    Pay
                  </button>
                </div>

                {/* Micro Stats Row */}
                <div className="grid grid-cols-3 gap-1 text-[10px] pt-1 border-t border-zinc-100">
                  <div>
                    <span className="text-zinc-400 block text-[8px] font-extrabold uppercase leading-none">Monthly</span>
                    <strong className="text-zinc-800 font-mono text-[11px]">{formatCurrency(summary.currentMonthlySalary)}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[8px] font-extrabold uppercase leading-none">Earned</span>
                    <strong className="text-zinc-800 font-mono text-[11px]">{formatCurrency(summary.totalAccruedWages)}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[8px] font-extrabold uppercase leading-none">Paid Out</span>
                    <strong className="text-emerald-800 font-mono text-[11px]">{formatCurrency(summary.totalWithdrawn)}</strong>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-xs">
                  <button
                    onClick={() => onAddRaise(emp)}
                    className="inline-flex items-center text-purple-700 hover:text-purple-900 font-bold cursor-pointer text-[11px]"
                  >
                    <TrendingUp className="w-3 h-3 mr-1" />
                    + Raise
                  </button>

                  <button
                    onClick={() => onSelectEmployee(emp)}
                    className="inline-flex items-center text-zinc-700 hover:text-zinc-900 font-bold cursor-pointer text-[11px] bg-zinc-100 hover:bg-zinc-200 px-2 py-1 rounded-md transition"
                  >
                    Transactions ({empTxCount})
                    <ChevronRight className="w-3 h-3 ml-0.5 text-zinc-500" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

