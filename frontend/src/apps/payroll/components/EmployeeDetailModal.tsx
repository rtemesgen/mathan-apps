import React, { useState } from 'react';
import { Employee, Transaction } from '../types';
import { calculateEmployeeAccrual, formatCurrency, formatDate, getTodayString } from '../utils/calc';
import {
  X,
  Wallet,
  TrendingUp,
  HandCoins,
  Calendar,
  Sparkles,
  Info,
  Clock,
  Printer,
  Receipt,
  Plus,
  ArrowRight,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { exportPdfFile } from '../../../lib/mobile';

interface EmployeeDetailModalProps {
  employee: Employee | null;
  transactions: Transaction[];
  asOfDate: string;
  onClose: () => void;
  onRecordWithdrawal: (emp: Employee) => void;
  onAddRaise: (emp: Employee) => void;
  onDeleteTransaction?: (txId: string) => void;
}

export const EmployeeDetailModal: React.FC<EmployeeDetailModalProps> = ({
  employee,
  transactions,
  asOfDate,
  onClose,
  onRecordWithdrawal,
  onAddRaise,
  onDeleteTransaction,
}) => {
  if (!employee) return null;

  const [evaluationDate, setEvaluationDate] = useState<string>(asOfDate);
  const [activeTab, setActiveTab] = useState<'intervals' | 'history' | 'withdrawals'>('intervals');

  const summary = calculateEmployeeAccrual(employee, transactions, evaluationDate);
  const empTransactions = transactions
    .filter((t) => t.employeeId === employee.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const handlePrint = () => {
    void exportPdfFile(`employee_${employee.id}_${evaluationDate}.pdf`, `${employee.name} Employee Statement`, [`As of ${evaluationDate}`, `Monthly salary: ${formatCurrency(summary.currentMonthlySalary)}`, `Total accrued: ${formatCurrency(summary.totalAccruedWages)}`, `Total paid out: ${formatCurrency(summary.totalWithdrawn)}`, `Remaining balance: ${formatCurrency(summary.remainingBalance)}`, '', ...empTransactions.map((tx) => `${tx.date} | ${formatCurrency(tx.amount)} | ${tx.notes || 'No notes'}`)]);
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl sm:rounded-[32px] border border-[#e8e6dc] shadow-2xl w-full max-w-4xl max-h-[96vh] sm:max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-zinc-900 text-white p-3.5 sm:p-6 flex items-center justify-between border-b border-zinc-800 gap-2">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-white/10 border border-white/20 text-white flex items-center justify-center text-sm sm:text-lg font-bold font-mono shrink-0">
              {employee.name
                .split(' ')
                .map((n) => n[0])
                .join('')}
            </div>
            <div className="min-w-0">
              <h2 className="font-serif-title text-base sm:text-2xl font-bold tracking-tight truncate">{employee.name}</h2>
              <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5 font-medium truncate">
                Started <strong className="text-zinc-200 font-mono">{formatDate(employee.startDate)}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              onClick={handlePrint}
              className="p-2 sm:p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition cursor-pointer"
              title="Print Employee Statement"
            >
              <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 sm:p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>

        {/* Real-Time Balance Inquiry Banner */}
        <div className="bg-[#f6f5ef] border-b border-[#e8e6dc] p-3.5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[9px] sm:text-[10px] font-extrabold text-amber-800 uppercase tracking-widest">
                  Current Unpaid Balance
                </span>
                <span className="inline-flex items-center text-[9px] sm:text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                  <Clock className="w-3 h-3 mr-1" />
                  Auto-Calculated
                </span>
              </div>
              <div className="font-serif-title text-2xl sm:text-3xl font-bold text-zinc-900 mt-0.5">
                {formatCurrency(summary.remainingBalance)}
              </div>
              <p className="text-[11px] sm:text-xs text-zinc-600 mt-0.5 font-medium">
                Unpaid as of <span className="font-bold text-zinc-900">{formatDate(evaluationDate)}</span>
              </p>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[#e8e6dc] text-xs">
            <div>
              <span className="text-zinc-500 block text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider">Salary</span>
              <strong className="text-zinc-900 font-mono text-xs sm:text-sm">{formatCurrency(summary.currentMonthlySalary)}/mo</strong>
            </div>
            <div>
              <span className="text-zinc-500 block text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider">Earned</span>
              <strong className="text-zinc-900 font-mono text-xs sm:text-sm">{formatCurrency(summary.totalAccruedWages)}</strong>
            </div>
            <div>
              <span className="text-zinc-500 block text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider">Paid Out</span>
              <strong className="text-emerald-800 font-mono text-xs sm:text-sm">{formatCurrency(summary.totalWithdrawn)}</strong>
            </div>
          </div>
        </div>

        {/* Tab Navigation & Evaluation Date Filter */}
        <div className="bg-slate-50 border-b border-slate-200 px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-1 overflow-x-auto max-w-full pb-1 sm:pb-0">
            <button
              onClick={() => setActiveTab('intervals')}
              className={`px-2.5 py-1 text-[11px] sm:text-xs font-semibold rounded-lg transition cursor-pointer whitespace-nowrap ${
                activeTab === 'intervals'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              Interval Accrual Math ({summary.intervals.length})
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`px-2.5 py-1 text-[11px] sm:text-xs font-semibold rounded-lg transition cursor-pointer whitespace-nowrap ${
                activeTab === 'history'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              Salary Change Timeline ({employee.salaryHistory.length})
            </button>

            <button
              onClick={() => setActiveTab('withdrawals')}
              className={`px-2.5 py-1 text-[11px] sm:text-xs font-semibold rounded-lg transition cursor-pointer whitespace-nowrap ${
                activeTab === 'withdrawals'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              Withdrawal Ledger ({empTransactions.length})
            </button>
          </div>

          <div className="flex items-center space-x-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500 text-[11px]">As of:</span>
            <input
              type="date"
              value={evaluationDate}
              onChange={(e) => setEvaluationDate(e.target.value)}
              className="px-2 py-0.5 bg-white border border-slate-300 rounded text-xs text-slate-800 font-mono"
            />
          </div>
        </div>

        {/* Modal Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: Interval Accrual Math Breakdown */}
          {activeTab === 'intervals' && (
            <div className="space-y-3">
              <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-2xs">
                <table className="w-full min-w-[550px] text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <th className="p-2.5">Period Dates</th>
                      <th className="p-2.5 text-right">Days</th>
                      <th className="p-2.5 text-right">Monthly Salary</th>
                      <th className="p-2.5 text-right">Daily Rate</th>
                      <th className="p-2.5 text-right">Period Accrued</th>
                      <th className="p-2.5">Reason / Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                    {[...summary.intervals].reverse().map((int, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition">
                        <td className="p-2.5 font-sans font-medium text-slate-900 whitespace-nowrap">
                          {formatDate(int.startDate)} <span className="text-slate-400 font-normal">to</span> {formatDate(int.endDate)}
                        </td>
                        <td className="p-2.5 text-right font-semibold whitespace-nowrap">{int.days} days</td>
                        <td className="p-2.5 text-right whitespace-nowrap">{formatCurrency(int.monthlySalary)}/mo</td>
                        <td className="p-2.5 text-right text-slate-500 whitespace-nowrap">${int.dailyRate.toFixed(2)}/day</td>
                        <td className="p-2.5 text-right font-bold text-indigo-600 whitespace-nowrap">
                          {formatCurrency(int.accruedAmount)}
                        </td>
                        <td className="p-2.5 font-sans text-slate-500 text-[11px] whitespace-nowrap">
                          {int.reasonNote || 'Base Period'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-900 text-white font-bold font-mono">
                      <td colSpan={4} className="p-3 text-right font-sans uppercase text-[11px] tracking-wider text-slate-300">
                        Total Accrued Earnings:
                      </td>
                      <td className="p-3 text-right text-indigo-300 text-sm whitespace-nowrap">
                        {formatCurrency(summary.totalAccruedWages)}
                      </td>
                      <td className="p-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: Salary Change Timeline */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Historical Base Salary & Raise Ledger
                </h3>
                <button
                  onClick={() => onAddRaise(employee)}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition flex items-center cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add / Backdate Raise
                </button>
              </div>

              {/* Salary History List */}
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
                {/* Initial Hiring Base Rate */}
                <div className="p-3.5 bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-slate-200 text-slate-700 rounded-lg">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Initial Base Salary at Hiring</p>
                      <p className="text-[11px] text-slate-500">
                        Effective from employment start date: <strong>{formatDate(employee.startDate)}</strong>
                      </p>
                    </div>
                  </div>
                  <div className="text-right font-mono font-bold text-slate-900 text-sm">
                    {formatCurrency(employee.initialSalary)}/mo
                  </div>
                </div>

                {/* Raise Entries */}
                {[...employee.salaryHistory]
                  .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
                  .map((change) => (
                  <div key={change.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition">
                    <div className="flex items-start space-x-3">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0 mt-0.5">
                        <TrendingUp className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <p className="text-xs font-bold text-slate-900">
                            Effective Date: {formatDate(change.effectiveDate)}
                          </p>
                          {change.effectiveDate < getTodayString() && (
                            <span className="px-1.5 py-0.2 text-[10px] bg-amber-100 text-amber-800 rounded font-medium">
                              Backdated
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">{change.reason}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-400 block text-[10px]">New Monthly Rate</span>
                      <strong className="text-indigo-600 font-mono text-sm">
                        {formatCurrency(change.newMonthlySalary)}/mo
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Withdrawal / Payout Ledger */}
          {activeTab === 'withdrawals' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Withdrawal & Payout History Log
                </h3>
                <button
                  onClick={() => onRecordWithdrawal(employee)}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition flex items-center cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Record New Withdrawal
                </button>
              </div>

              {empTransactions.length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                  No withdrawals or payouts logged for this employee yet.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Type</th>
                        <th className="p-2.5 text-right">Amount</th>
                        {onDeleteTransaction && <th className="p-2.5 text-center">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {empTransactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50/80 transition">
                          <td className="p-2.5 font-medium text-slate-900">{formatDate(tx.date)}</td>
                          <td className="p-2.5">
                            <span className="capitalize px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                              {tx.type.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="p-2.5 text-right font-bold font-mono text-emerald-700 text-sm">
                            -{formatCurrency(tx.amount)}
                          </td>
                          {onDeleteTransaction && (
                            <td className="p-2.5 text-center">
                              <button
                                onClick={() => onDeleteTransaction(tx.id)}
                                className="p-1 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                                title="Delete Transaction"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 border-t border-slate-200 p-3.5 flex items-center justify-between text-xs">
          <div className="text-slate-500">
            Employee ID: <span className="font-mono text-slate-800 font-semibold">{employee.id}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition cursor-pointer"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
};
