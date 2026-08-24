import React, { useState } from 'react';
import { Employee, SalaryChange, Transaction } from '../types';
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
  Pencil,
  Save,
} from 'lucide-react';
import { exportPdfFile } from '../../../lib/mobile';
import { DeleteConfirmModal } from '../../../components/DeleteConfirmModal';
import { AppDatePicker } from '../../../components/AppDatePicker';
import { useSubmitGuard } from '../../../hooks/useSubmitGuard';

interface EmployeeDetailModalProps {
  employee: Employee | null;
  transactions: Transaction[];
  asOfDate: string;
  onClose: () => void;
  onRecordWithdrawal: (emp: Employee) => void;
  onAddRaise: (emp: Employee) => void;
  onDeleteTransaction?: (txId: string) => void | Promise<void>;
  onUpdateTransaction?: (transaction: Transaction) => void | Promise<void>;
  onRemoveTransaction?: (txId: string) => void | Promise<void>;
  onUpdateRaise?: (employeeId: string, raise: SalaryChange) => void | Promise<void>;
  onDeleteRaise?: (employeeId: string, raiseId: string) => void | Promise<void>;
}

export const EmployeeDetailModal: React.FC<EmployeeDetailModalProps> = ({
  employee,
  transactions,
  asOfDate,
  onClose,
  onRecordWithdrawal,
  onAddRaise,
  onDeleteTransaction,
  onUpdateTransaction,
  onRemoveTransaction,
  onUpdateRaise,
  onDeleteRaise,
}) => {
  const [evaluationDate, setEvaluationDate] = useState<string>(asOfDate);
  const [activeTab, setActiveTab] = useState<'history' | 'withdrawals'>('withdrawals');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingRaise, setEditingRaise] = useState<SalaryChange | null>(null);
  const [confirmDeleteTransaction, setConfirmDeleteTransaction] = useState<string | null>(null);
  const [confirmDeleteRaise, setConfirmDeleteRaise] = useState<string | null>(null);
  const { submitting, run } = useSubmitGuard();

  if (!employee) return null;

  const summary = calculateEmployeeAccrual(employee, transactions, evaluationDate);
  const empTransactions = transactions
    .filter((t) => t.employeeId === employee.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const handlePrint = () => {
    void exportPdfFile(`employee_${employee.id}_${evaluationDate}.pdf`, `${employee.name} Employee Statement`, [`As of ${evaluationDate}`, `Monthly salary: ${formatCurrency(summary.currentMonthlySalary)}`, `Total earned: ${formatCurrency(summary.totalAccruedWages)}`, `Total paid: ${formatCurrency(summary.totalWithdrawn)}`, `Remaining balance: ${formatCurrency(summary.remainingBalance)}`, '', ...empTransactions.map((tx) => `${tx.date} | ${formatCurrency(tx.amount)} | ${tx.notes || 'No notes'}`)]);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#f6f5ef]">
      <div className="min-h-screen w-full bg-white flex flex-col overflow-hidden animate-in fade-in duration-200">
        {/* Modal Header */}
        <div className="bg-zinc-900 text-white px-4 py-3 sm:px-6 flex items-center justify-between border-b border-zinc-800 gap-2 shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-white/10 border border-white/20 text-white flex items-center justify-center text-sm font-bold font-mono shrink-0">
              {employee.name
                .split(' ')
                .map((n) => n[0])
                .join('')}
            </div>
            <div className="min-w-0">
              <h2 className="font-serif-title text-base sm:text-xl font-bold tracking-tight truncate">{employee.name}</h2>
              <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5 font-medium truncate">
                Started <strong className="text-zinc-200 font-mono">{formatDate(employee.startDate)}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              onClick={onClose}
              className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-full transition cursor-pointer"
              aria-label="Close employee records"
            >
              <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation & Evaluation Date Filter */}
        <div className="bg-[#f6f5ef] border-b border-[#e8e6dc] px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center space-x-1 overflow-x-auto max-w-full pb-1 sm:pb-0">
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
            <AppDatePicker value={evaluationDate} onChange={setEvaluationDate} className="w-32" />
            <span className="ml-auto rounded-lg border border-[#e8e6dc] bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 whitespace-nowrap">
              Start date: <strong className="font-mono text-slate-900">{formatDate(employee.startDate)}</strong>
            </span>
          </div>
        </div>

        {/* Modal Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* Salary Change Timeline */}
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
                  <React.Fragment key={change.id}>
                  <div className="relative p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition">
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
                    <div className="text-right shrink-0">
                      <span className="text-xs text-slate-400 block text-[10px]">New Monthly Rate</span>
                      <strong className="text-indigo-600 font-mono text-sm">
                        {formatCurrency(change.newMonthlySalary)}/mo
                      </strong>
                      {(onUpdateRaise || onDeleteRaise) && <div className="mt-1 flex justify-end gap-1">
                        {onUpdateRaise && <button type="button" onClick={() => setEditingRaise(editingRaise?.id === change.id ? null : { ...change })} className="rounded-md p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600" title="Edit raise"><Pencil className="h-3.5 w-3.5" /></button>}
                        {onDeleteRaise && <button type="button" onClick={() => setConfirmDeleteRaise(change.id)} className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete raise"><Trash2 className="h-3.5 w-3.5" /></button>}
                      </div>}
                    </div>
                    {editingRaise?.id === change.id && onUpdateRaise && <div className="absolute left-3 right-3 top-full z-10 mt-1 grid gap-2 rounded-lg border border-indigo-200 bg-white p-3 shadow-lg sm:grid-cols-[150px_150px_1fr_auto]">
                      <AppDatePicker value={editingRaise.effectiveDate} onChange={(value) => setEditingRaise({ ...editingRaise, effectiveDate: value })} className="w-36" />
                      <input type="number" min="0" step="1" value={editingRaise.newMonthlySalary} onChange={(event) => setEditingRaise({ ...editingRaise, newMonthlySalary: Number(event.target.value) || 0 })} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs" placeholder="Monthly salary" />
                      <input value={editingRaise.reason} onChange={(event) => setEditingRaise({ ...editingRaise, reason: event.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs" placeholder="Reason" />
                      <button type="button" disabled={submitting} onClick={() => { if (editingRaise.effectiveDate && editingRaise.reason.trim() && !submitting) void run(() => onUpdateRaise?.(employee.id, { ...editingRaise, reason: editingRaise.reason.trim() })).then(() => setEditingRaise(null)); }} className="inline-flex items-center justify-center gap-1 rounded-md bg-indigo-600 px-2 py-1.5 text-xs font-bold text-white"><Save className="h-3.5 w-3.5" /> {submitting ? 'Saving…' : 'Save'}</button>
                    </div>}
                  </div>
                  <DeleteConfirmModal isOpen={confirmDeleteRaise === change.id} title="Delete salary raise?" message="Are you sure you want to delete this salary raise?" onClose={() => setConfirmDeleteRaise(null)} onConfirm={async () => { await onDeleteRaise?.(employee.id, change.id); setConfirmDeleteRaise(null); }} />
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Withdrawal / Payout Ledger */}
          {activeTab === 'withdrawals' && (
            <div className="space-y-3">
              {empTransactions.length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                  No withdrawals or payouts logged for this employee yet.
                </div>
              ) : (
                <>
                <DeleteConfirmModal isOpen={!!confirmDeleteTransaction} title="Delete payment record?" message="Are you sure you want to delete this payment record?" onClose={() => setConfirmDeleteTransaction(null)} onConfirm={async () => { if (confirmDeleteTransaction) await (onRemoveTransaction ?? onDeleteTransaction)?.(confirmDeleteTransaction); setConfirmDeleteTransaction(null); }} />
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Type</th>
                        <th className="p-2.5 text-right">Amount</th>
                        {(onDeleteTransaction || onUpdateTransaction || onRemoveTransaction) && <th className="p-2.5 text-center">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {empTransactions.map((tx) => (
                        <React.Fragment key={tx.id}>
                        <tr className="hover:bg-slate-50/80 transition">
                          <td className="p-2.5 font-medium text-slate-900">{formatDate(tx.date)}</td>
                          <td className="p-2.5">
                            <span className="capitalize px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                              {tx.type.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="p-2.5 text-right font-bold font-mono text-emerald-700 text-sm">
                            -{formatCurrency(tx.amount)}
                          </td>
                          {(onDeleteTransaction || onUpdateTransaction || onRemoveTransaction) && (
                            <td className="p-2.5 text-center">
                              <div className="flex justify-center gap-1">
                                {onUpdateTransaction && <button onClick={() => setEditingTransaction(editingTransaction?.id === tx.id ? null : { ...tx })} className="rounded-md p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600" title="Edit transaction"><Pencil className="h-3.5 w-3.5" /></button>}
                                {(onRemoveTransaction || onDeleteTransaction) && <button onClick={() => setConfirmDeleteTransaction(tx.id)} className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete transaction"><Trash2 className="h-3.5 w-3.5" /></button>}
                              </div>
                            </td>
                          )}
                        </tr>
                        {editingTransaction?.id === tx.id && onUpdateTransaction && <tr className="bg-indigo-50/50"><td colSpan={4} className="p-3"><div className="grid gap-2 sm:grid-cols-[140px_120px_1fr_auto]"><AppDatePicker value={editingTransaction.date} onChange={(value) => setEditingTransaction({ ...editingTransaction, date: value })} className="w-36" /><input type="number" min="0" step="0.01" value={editingTransaction.amount} onChange={(event) => setEditingTransaction({ ...editingTransaction, amount: Number(event.target.value) || 0 })} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" placeholder="Amount" /><input value={editingTransaction.notes ?? ''} onChange={(event) => setEditingTransaction({ ...editingTransaction, notes: event.target.value })} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" placeholder="Notes" /><button type="button" disabled={submitting} onClick={() => { if (editingTransaction.date && editingTransaction.amount >= 0 && !submitting) void run(() => onUpdateTransaction(editingTransaction)).then(() => setEditingTransaction(null)); }} className="inline-flex items-center justify-center gap-1 rounded-md bg-indigo-600 px-2 py-1.5 text-xs font-bold text-white"><Save className="h-3.5 w-3.5" /> {submitting ? 'Saving…' : 'Save'}</button></div></td></tr>}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </div>
          )}

        </div>

        {/* Fixed balance summary: records scroll above, this stays visible */}
        <div className="shrink-0 border-t border-[#e8e6dc] bg-white px-4 py-2.5 sm:px-6">
          <div className="ml-auto max-w-xl rounded-xl border border-[#e8e6dc] bg-[#f6f5ef] px-4 py-2.5 shadow-sm">
            <div className="flex items-center justify-between gap-4 text-xs sm:text-sm">
              <span className="text-slate-500">Total Earned:</span>
              <span className="font-mono font-bold text-zinc-900">{formatCurrency(summary.totalAccruedWages)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-4 text-xs sm:text-sm">
              <span className="text-slate-500">Previously Paid:</span>
              <span className="font-mono font-bold text-emerald-800">-{formatCurrency(summary.totalWithdrawn)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-[#dedbd0] pt-1.5 text-sm sm:text-base">
              <span className="font-extrabold text-zinc-900">Available Balance:</span>
              <span className="font-mono font-extrabold text-zinc-900">{formatCurrency(summary.remainingBalance)}</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-[#f6f5ef] border-t border-[#e8e6dc] p-3 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 bg-zinc-900 hover:bg-zinc-700 text-white text-sm font-semibold rounded-xl transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
