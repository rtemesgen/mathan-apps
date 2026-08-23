import React, { useState } from 'react';
import { Employee, Transaction } from '../types';
import { exportTransactionsCSV, downloadFile, formatCurrency, formatDate } from '../utils/calc';
import {
  X,
  Receipt,
  Download,
  Search,
  Filter,
  Trash2,
  HandCoins,
  Calendar,
  CreditCard,
  Plus,
} from 'lucide-react';
import { DeleteConfirmModal } from '../../../components/DeleteConfirmModal';
import { AppSelect } from '../../../components/AppSelect';

interface TransactionsListProps {
  isOpen: boolean;
  transactions: Transaction[];
  employees: Employee[];
  onClose: () => void;
  onRecordWithdrawalTrigger: () => void;
  onDeleteTransaction: (txId: string) => void;
}

export const TransactionsList: React.FC<TransactionsListProps> = ({
  isOpen,
  transactions,
  employees,
  onClose,
  onRecordWithdrawalTrigger,
  onDeleteTransaction,
}) => {
  if (!isOpen) return null;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedMethod, setSelectedMethod] = useState<string>('all');
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);

  const employeesMap = employees.reduce((acc, emp) => {
    acc[emp.id] = emp;
    return acc;
  }, {} as Record<string, Employee>);

  const filtered = transactions.filter((tx) => {
    const empName = employeesMap[tx.employeeId]?.name || tx.employeeName || '';
    const matchesSearch =
      empName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.referenceNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.notes || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = selectedType === 'all' || tx.type === selectedType;
    const matchesMethod = selectedMethod === 'all' || tx.paymentMethod === selectedMethod;

    return matchesSearch && matchesType && matchesMethod;
  });

  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date));

  const totalAmount = sorted.reduce((sum, t) => sum + t.amount, 0);

  const handleExportCSV = () => {
    const csvContent = exportTransactionsCSV(sorted, employeesMap);
    const filename = `company_transactions_ledger_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadFile(filename, csvContent, 'text/csv;charset=utf-8;');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-600/30 text-indigo-300 rounded-xl border border-indigo-500/30">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Company Withdrawal & Payout Transactions Register</h2>
              <p className="text-xs text-slate-400">
                Audit log of all payouts, advances, and partial withdrawals across employees
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onRecordWithdrawalTrigger}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg transition shadow-xs flex items-center cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              New Withdrawal
            </button>
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium rounded-lg transition flex items-center cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
              Export Register CSV
            </button>
            <button
              onClick={onClose}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search transactions by employee, check/ref #, or notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
            </div>

            <div className="flex items-center space-x-2 text-xs">
              <AppSelect value={selectedType} onChange={setSelectedType} options={[{value:'all',label:'All Types'},{value:'withdrawal',label:'Withdrawals'},{value:'advance',label:'Advances'},{value:'monthly_payout',label:'Monthly Payouts'},{value:'adjustment',label:'Adjustments'}]} className="min-w-32" />

              <AppSelect value={selectedMethod} onChange={setSelectedMethod} options={[{value:'all',label:'All Payment Methods'},{value:'Bank Transfer',label:'Bank Transfer'},{value:'Cash',label:'Cash'},{value:'Check',label:'Check'},{value:'Digital Wallet',label:'Digital Wallet'}]} className="min-w-40" />
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {sorted.length === 0 ? (
            <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center text-xs text-slate-500">
              No transactions match your search criteria.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                    <th className="p-3">Date</th>
                    <th className="p-3">Employee Name</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Payment Method</th>
                    <th className="p-3">Ref / Check #</th>
                    <th className="p-3">Notes</th>
                    <th className="p-3 text-right">Amount ($)</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {sorted.map((tx) => {
                    const empName = employeesMap[tx.employeeId]?.name || tx.employeeName || 'Unknown';
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50 transition">
                        <td className="p-3 font-mono font-medium text-slate-900">{formatDate(tx.date)}</td>
                        <td className="p-3 font-semibold text-slate-900">{empName}</td>
                        <td className="p-3">
                          <span className="capitalize px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                            {tx.type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600">{tx.paymentMethod}</td>
                        <td className="p-3 font-mono text-slate-500 text-[11px]">{tx.referenceNo || '-'}</td>
                        <td className="p-3 text-slate-500 text-[11px] max-w-xs truncate">{tx.notes || '-'}</td>
                        <td className="p-3 text-right font-bold font-mono text-emerald-700 text-sm">
                          -{formatCurrency(tx.amount)}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => setTransactionToDelete(tx)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                            title="Delete Transaction Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white font-mono font-bold">
                    <td colSpan={6} className="p-3.5 uppercase font-sans text-[11px] tracking-wider text-slate-300">
                      Total Filtered Paid Payouts ({sorted.length} transactions)
                    </td>
                    <td className="p-3.5 text-right text-emerald-300 text-sm">{formatCurrency(totalAmount)}</td>
                    <td className="p-3.5"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-100 border-t border-slate-200 p-3.5 flex items-center justify-between text-xs text-slate-500">
          <span>Company Financial Register</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition cursor-pointer"
          >
            Close Register
          </button>
        </div>
      </div>
      <DeleteConfirmModal isOpen={!!transactionToDelete} title="Delete transaction?" message="Are you sure you want to delete this payroll transaction?" onClose={() => setTransactionToDelete(null)} onConfirm={() => { if (transactionToDelete) onDeleteTransaction(transactionToDelete.id); setTransactionToDelete(null); }} />
    </div>
  );
};
