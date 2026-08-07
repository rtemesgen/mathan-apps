import React, { useState, useEffect } from 'react';
import { Employee, Transaction } from '../types';
import { calculateEmployeeAccrual, formatCurrency, getTodayString } from '../utils/calc';
import { X, HandCoins, DollarSign, Calendar, CreditCard, FileText, AlertTriangle } from 'lucide-react';

interface RecordWithdrawalModalProps {
  isOpen: boolean;
  employees: Employee[];
  transactions: Transaction[];
  selectedEmployee: Employee | null;
  asOfDate: string;
  onClose: () => void;
  onRecord: (transaction: Transaction) => void;
}

export const RecordWithdrawalModal: React.FC<RecordWithdrawalModalProps> = ({
  isOpen,
  employees,
  transactions,
  selectedEmployee,
  asOfDate,
  onClose,
  onRecord,
}) => {
  if (!isOpen) return null;

  const [employeeId, setEmployeeId] = useState<string>(
    selectedEmployee ? selectedEmployee.id : employees[0]?.id || ''
  );
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(getTodayString());
  const [type, setType] = useState<Transaction['type']>('withdrawal');
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const currentEmp = employees.find((e) => e.id === employeeId) || selectedEmployee;

  useEffect(() => {
    if (selectedEmployee) {
      setEmployeeId(selectedEmployee.id);
    } else if (employees.length > 0) {
      setEmployeeId(employees[0].id);
    }
  }, [selectedEmployee, employees]);

  // Calculate current available balance for this employee
  const currentSummary = currentEmp
    ? calculateEmployeeAccrual(currentEmp, transactions, asOfDate)
    : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !amount || !date) return;

    const parsedAmount = parseFloat(amount) || 0;
    if (parsedAmount <= 0) return;

    const newTx: Transaction = {
      id: `tx-${Date.now().toString().slice(-6)}`,
      employeeId,
      employeeName: currentEmp?.name || '',
      amount: parsedAmount,
      date,
      type,
      referenceNo: referenceNo.trim() || undefined,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    onRecord(newTx);
    onClose();
  };

  const parsedAmount = parseFloat(amount) || 0;
  const remainingAfter = currentSummary ? currentSummary.remainingBalance - parsedAmount : 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-600/30 text-amber-300 rounded-lg border border-amber-500/30">
              <HandCoins className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Record Salary Withdrawal / Payout</h2>
              <p className="text-xs text-slate-400">Deduct payout from employee's accrued balance</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Select Employee */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1">Select Employee</label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 text-xs font-medium"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.department})
                </option>
              ))}
            </select>
          </div>

          {/* Current Balance & Remaining Preview */}
          {currentSummary && (
            <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[10px] text-amber-800 font-bold block uppercase">
                  Available Accrued Balance
                </span>
                <strong className="text-amber-950 font-mono text-sm">
                  {formatCurrency(currentSummary.remainingBalance)}
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-amber-800 font-bold block uppercase">
                  Balance After Withdrawal
                </span>
                <strong
                  className={`font-mono text-sm ${
                    remainingAfter < 0 ? 'text-red-700' : 'text-slate-900'
                  }`}
                >
                  {formatCurrency(remainingAfter)}
                </strong>
              </div>
            </div>
          )}

          {/* Withdrawal Amount & Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-800 font-bold mb-1">
                Withdrawal Amount ($) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 font-mono text-xs">$</span>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  placeholder="Enter amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono text-xs text-slate-900 font-bold text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-800 font-bold mb-1">
                Transaction Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono text-xs text-slate-900"
              />
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1">Transaction Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as Transaction['type'])}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800 text-xs"
            >
              <option value="withdrawal">Partial Withdrawal</option>
              <option value="monthly_payout">Full Monthly Payout</option>
              <option value="advance">Salary Advance</option>
              <option value="adjustment">Balance Adjustment</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1">Notes / Reason</label>
            <input
              type="text"
              placeholder="e.g. Personal request payout for holiday"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800 text-xs"
            />
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-xs transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs transition shadow-xs cursor-pointer"
            >
              Confirm & Record Withdrawal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
