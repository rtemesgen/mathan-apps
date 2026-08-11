import React, { useState } from 'react';
import { Transaction, Employee } from '../types';
import {
  Receipt,
  Search,
  Filter,
  Printer,
  Trash2,
  Calendar,
  CreditCard,
  Building,
  User,
  Plus,
  ChevronDown,
  ChevronUp,
  FileText
} from 'lucide-react';
import { exportPdfFile } from '../../../lib/mobile';
import { DeleteConfirmModal } from '../../../components/DeleteConfirmModal';

interface TransactionsViewProps {
  transactions: Transaction[];
  employees: Employee[];
  onDeleteTransaction: (txId: string) => void;
  onNavigateTab: (tab: 'pay-salary') => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  transactions,
  employees,
  onDeleteTransaction,
  onNavigateTab,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [employeeFilter, setEmployeeFilter] = useState<string>('All');
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);

  const filteredTransactions = transactions
    .filter((tx) => {
      const matchesEmployee = employeeFilter === 'All' || tx.employeeId === employeeFilter;
      const matchesSearch =
        tx.employeeName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tx.referenceNo && tx.referenceNo.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (tx.notes && tx.notes.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesEmployee && matchesSearch;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalPayoutSum = filteredTransactions.reduce((acc, t) => acc + t.amount, 0);

  const formatMoney = (val: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(val);

  const handleExportPDF = () => {
    void exportPdfFile(`Payroll_Transactions_${new Date().toISOString().slice(0, 10)}.pdf`, 'Mathan ERP Payroll Transactions', [`Filtered total: ${formatMoney(totalPayoutSum)}`, `Records found: ${filteredTransactions.length}`, '', ...filteredTransactions.map((tx) => `${tx.date} | ${tx.employeeName || 'Employee'} | ${formatMoney(tx.amount)} | ${tx.notes || 'No notes'}`)]);
  };

  return (
    <div className="space-y-3">
      {/* Summary Bar */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-[#e8e6dc] shadow-2xs">
          <span className="text-[9px] sm:text-xs font-semibold text-zinc-500 block truncate">Filtered Payout Total</span>
          <div className="font-serif-title text-xs sm:text-lg lg:text-xl font-bold text-emerald-800 mt-0.5 truncate">{formatMoney(totalPayoutSum)}</div>
        </div>

        <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-[#e8e6dc] shadow-2xs">
          <span className="text-[9px] sm:text-xs font-semibold text-zinc-500 block truncate">Records Found</span>
          <div className="font-serif-title text-xs sm:text-lg lg:text-xl font-bold text-zinc-900 mt-0.5 truncate">{filteredTransactions.length} payments</div>
        </div>
      </div>

      {/* Search & Employee Filter Bar */}
      <div className="bg-white p-2.5 rounded-xl border border-[#e8e6dc] shadow-2xs flex flex-col md:flex-row items-center justify-between gap-2">
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search payment records..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-[#f2f0e6] border border-zinc-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-zinc-800"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Employee Dropdown Filter */}
          <div className="flex items-center space-x-1.5 text-xs">
            <User className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <span className="font-bold text-zinc-700">Staff:</span>
            <select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-[#f2f0e6] border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-800 cursor-pointer max-w-[180px] truncate"
            >
              <option value="All">All Staff ({employees.length})</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 shrink-0 border-l border-zinc-200 pl-2 ml-1">
            <button
              onClick={() => onNavigateTab('pay-salary')}
              className="px-3 py-1.5 bg-[#54623e] hover:bg-[#435031] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition shadow-2xs cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> New Payment
            </button>
            <button
              onClick={handleExportPDF}
              className="px-3 py-1.5 bg-[#f2f0e6] hover:bg-zinc-200 border border-zinc-200 text-zinc-800 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" /> Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* Transactions List Table */}
      <div className="bg-white rounded-xl border border-[#e8e6dc] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f2f0e6] text-zinc-500 font-extrabold uppercase text-[10px] tracking-widest border-b border-[#e8e6dc]">
              <tr>
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-3">Employee</th>
                <th className="py-2.5 px-3 text-right">Amount</th>
                <th className="py-2.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e6dc]">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-zinc-400 italic">
                    No transaction records match the current filters.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const isExpanded = expandedTxId === tx.id;
                  return (
                    <React.Fragment key={tx.id}>
                      <tr
                        onClick={() => setExpandedTxId(isExpanded ? null : tx.id)}
                        className="hover:bg-[#f6f5ef] transition cursor-pointer group"
                      >
                        <td className="py-2.5 px-4 font-mono font-bold text-zinc-700 whitespace-nowrap">{tx.date}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5 font-bold text-zinc-900 truncate">
                            {tx.employeeName || 'Employee'}
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-zinc-400 opacity-60 group-hover:opacity-100" />
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800 text-xs sm:text-sm whitespace-nowrap">
                          -{formatMoney(tx.amount)}
                        </td>
                        <td className="py-2.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setTransactionToDelete(tx)}
                            className="p-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-full transition cursor-pointer"
                            title="Delete record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Notes & Details Row */}
                      {isExpanded && (
                        <tr className="bg-[#f2f0e6]/60 border-b border-[#e8e6dc]">
                          <td colSpan={4} className="py-2.5 px-4">
                            <div className="bg-white p-3 rounded-xl border border-[#e8e6dc] shadow-2xs flex items-start gap-2.5">
                              <FileText className="w-4 h-4 text-[#54623e] shrink-0 mt-0.5" />
                              <div className="flex-1 space-y-1">
                                <div className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400">
                                  Transaction Notes & Details
                                </div>
                                <p className="text-zinc-800 text-xs font-medium leading-relaxed">
                                  {tx.notes && tx.notes.trim() !== '' ? tx.notes : 'No extra notes recorded for this payout.'}
                                </p>
                                <div className="text-[10px] font-mono text-zinc-600 pt-1">
                                  ID: {tx.id}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <DeleteConfirmModal isOpen={!!transactionToDelete} title="Delete transaction?" message="Are you sure you want to delete this payroll transaction?" onClose={() => setTransactionToDelete(null)} onConfirm={() => { if (transactionToDelete) onDeleteTransaction(transactionToDelete.id); setTransactionToDelete(null); }} />
    </div>
  );
};
