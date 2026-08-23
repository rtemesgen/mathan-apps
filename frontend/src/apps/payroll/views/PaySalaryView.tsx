import React, { useState, useEffect } from 'react';
import { Employee, Transaction } from '../types';
import { calculateEmployeeAccrual, getTodayString } from '../utils/calc';
import { AppDatePicker } from '../../../components/AppDatePicker';
import {
  Banknote,
  DollarSign,
  Calendar,
  User,
  CreditCard,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Receipt,
  Search,
  History,
  ChevronDown
} from 'lucide-react';

interface PaySalaryViewProps {
  employees: Employee[];
  transactions: Transaction[];
  asOfDate: string;
  initialEmployeeId?: string;
  onRecordWithdrawal: (tx: Transaction) => void;
  onNavigateTab: (tab: 'dashboard' | 'transactions') => void;
}

export const PaySalaryView: React.FC<PaySalaryViewProps> = ({
  employees,
  transactions,
  asOfDate,
  initialEmployeeId,
  onRecordWithdrawal,
  onNavigateTab,
}) => {
  const [selectedEmpId, setSelectedEmpId] = useState<string>(initialEmployeeId || employees[0]?.id || '');
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(asOfDate || getTodayString());
  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [lastTx, setLastTx] = useState<Transaction | null>(null);
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
  const sortedEmployees = [...employees].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  useEffect(() => {
    if (!selectedEmpId && employees.length > 0) {
      setSelectedEmpId(employees[0].id);
    }
  }, [employees, selectedEmpId]);

  useEffect(() => {
    if (initialEmployeeId && employees.some((employee) => employee.id === initialEmployeeId)) {
      setSelectedEmpId(initialEmployeeId);
      setIsSuccess(false);
    }
  }, [initialEmployeeId, employees]);

  const selectedEmp = employees.find((e) => e.id === selectedEmpId);
  const accrualInfo = selectedEmp
    ? calculateEmployeeAccrual(selectedEmp, transactions, asOfDate)
    : null;

  const currentOwed = accrualInfo?.remainingBalance || 0;
  const numAmount = parseFloat(amount) || 0;
  const newRemaining = currentOwed - numAmount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp || numAmount <= 0) return;

    const newTx: Transaction = {
      id: `tx-${Date.now().toString().slice(-6)}`,
      employeeId: selectedEmp.id,
      employeeName: selectedEmp.name,
      amount: numAmount,
      date,
      type: 'withdrawal',
      referenceNo: reference.trim() || undefined,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    onRecordWithdrawal(newTx);
    setLastTx(newTx);
    setIsSuccess(true);
    setAmount('');
    setReference('');
    setNotes('');
  };

  const formatMoney = (val: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(val);

  return (
    <div className="max-w-4xl mx-auto space-y-3">
      {isSuccess && lastTx && (
        <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-2.5 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-800 text-white rounded-full shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif-title text-sm font-bold text-emerald-950">Payout Recorded Successfully!</h3>
              <p className="text-[11px] text-emerald-800 font-medium">
                Paid <span className="font-mono font-bold">{formatMoney(lastTx.amount)}</span> to{' '}
                <span className="font-bold text-zinc-900">{lastTx.employeeName}</span> on {lastTx.date}.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsSuccess(false)}
            className="px-3.5 py-1.5 bg-[#54623e] hover:bg-[#435031] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition shadow-xs cursor-pointer shrink-0"
          >
            Record Another Payout
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* Form Column */}
        <div className="md:col-span-7 bg-white p-3.5 sm:p-4 rounded-xl border border-[#e8e6dc] shadow-2xs">
          <form onSubmit={handleSubmit} className="space-y-2.5 text-xs">
            {/* Select Employee */}
            <div>
              <label className="block text-zinc-800 font-bold mb-1 flex items-center gap-1.5 text-[11px]">
                <User className="w-3.5 h-3.5 text-zinc-700" /> Select Employee Profile <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <button type="button" onClick={() => setEmployeePickerOpen((open) => !open)} className="flex w-full items-center justify-between rounded-lg border border-[#d8d3c5] bg-[#f2f0e6] px-3 py-2 text-left text-xs font-bold text-zinc-900 shadow-2xs"><span className="truncate">{selectedEmp ? selectedEmp.name : 'Choose employee'}</span><ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${employeePickerOpen ? 'rotate-180' : ''}`} /></button>
                {employeePickerOpen && <div className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-[#d8d3c5] bg-[#fbfaf6] p-1.5 shadow-xl">{sortedEmployees.map((emp) => { const info = calculateEmployeeAccrual(emp, transactions, asOfDate); const selected = emp.id === selectedEmpId; return <button type="button" key={emp.id} onClick={() => { setSelectedEmpId(emp.id); setIsSuccess(false); setEmployeePickerOpen(false); }} className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition ${selected ? 'bg-zinc-900 text-white' : 'text-zinc-800 hover:bg-[#f2f0e6]'}`}><span className="min-w-0 truncate text-xs font-bold">{emp.name}</span><span className={`shrink-0 text-[10px] font-mono ${selected ? 'text-emerald-200' : 'text-zinc-500'}`}>Available: ${info.remainingBalance.toFixed(2)}</span></button>; })}</div>}
              </div>
            </div>

            {/* Payout Amount */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-zinc-800 font-bold flex items-center gap-1 text-[11px]">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-800" /> Payout Amount ($) <span className="text-red-500">*</span>
                </label>
                {accrualInfo && (
                  <span className="text-[10px] font-mono text-zinc-500 font-medium">
                    Max Available: <span className="font-bold text-zinc-900">${currentOwed.toFixed(2)}</span>
                  </span>
                )}
              </div>

              <div className="relative">
                <span className="absolute left-3 top-1.5 text-zinc-400 font-mono text-xs">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-7 pr-3 py-1.5 bg-[#f2f0e6] border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-800 font-mono text-sm font-bold text-zinc-900"
                />
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="block text-zinc-700 font-bold mb-1 text-[11px]">Payment Date</label>
              <AppDatePicker value={date} onChange={setDate} required />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-zinc-700 font-bold mb-1 text-[11px]">Notes / Description</label>
              <input
                type="text"
                placeholder="e.g. Mid-month salary withdrawal"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#f2f0e6] border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-800 text-zinc-900 text-xs font-medium placeholder:italic"
              />
            </div>

            <div className="pt-1 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => onNavigateTab('dashboard')}
                className="px-3 py-1.5 bg-[#f2f0e6] hover:bg-zinc-200 text-zinc-700 font-bold rounded-lg text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={numAmount <= 0}
                className="px-3.5 py-1.5 bg-[#54623e] hover:bg-[#435031] disabled:bg-zinc-300 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition shadow-2xs cursor-pointer flex items-center gap-1"
              >
                <Banknote className="w-3.5 h-3.5" /> Save Payout
              </button>
            </div>
          </form>
        </div>

        {/* Live Balance Impact Preview */}
        <div className="md:col-span-5 space-y-2">
          {accrualInfo && selectedEmp && (
            <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-[#e8e6dc] shadow-2xs">
              <div className="font-serif-title text-base font-bold text-zinc-900">{selectedEmp.name}</div>
              <div className="text-[11px] text-zinc-500 font-medium">{selectedEmp.position} — {selectedEmp.department}</div>

              <div className="mt-2.5 space-y-2 text-xs">
                <div className="p-2.5 bg-[#f6f5ef] rounded-lg border border-zinc-200/60 space-y-1 text-[11px]">
                  <div className="flex justify-between text-zinc-500 font-medium">
                    <span>Total Earned:</span>
                    <span className="font-mono text-zinc-900 font-bold">{formatMoney(accrualInfo.totalAccruedWages)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-500 font-medium">
                    <span>Previously Paid:</span>
                    <span className="font-mono text-emerald-800 font-bold">-{formatMoney(accrualInfo.totalWithdrawn)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-900 border-t border-zinc-200 pt-1 font-bold">
                    <span>Available Balance:</span>
                    <span className="font-mono text-zinc-900 font-bold">{formatMoney(accrualInfo.remainingBalance)}</span>
                  </div>
                </div>

                {numAmount > 0 && (
                  <div className="p-2.5 bg-zinc-900 text-white rounded-lg space-y-1 animate-in fade-in duration-150">
                    <div className="text-[9px] text-zinc-400 font-extrabold uppercase tracking-widest">
                      After Payment
                    </div>
                    <div className="flex justify-between text-zinc-300 text-[11px]">
                      <span>Payment:</span>
                      <span className="font-mono font-bold text-emerald-400">-{formatMoney(numAmount)}</span>
                    </div>
                    <div className="flex justify-between text-white font-extrabold border-t border-zinc-700 pt-1 text-xs">
                      <span>New Balance:</span>
                      <span className="font-serif-title text-sm text-emerald-300">{formatMoney(newRemaining)}</span>
                    </div>
                  </div>
                )}

                {numAmount > currentOwed && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-[10px] flex items-start gap-1.5 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 mt-0.5" />
                    <span>
                      Payout exceeds available balance. Negative balance: (-{formatMoney(Math.abs(newRemaining))}).
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
