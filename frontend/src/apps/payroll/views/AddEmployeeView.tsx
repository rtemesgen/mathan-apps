import React, { useState } from 'react';
import { Employee } from '../types';
import { calculateDaysBetween } from '../utils/calc';
import { AppDatePicker } from '../../../components/AppDatePicker';
import {
  UserPlus,
  DollarSign,
  Calendar,
  CheckCircle2,
  ArrowRight,
  Calculator
} from 'lucide-react';
import { useAsyncAction } from '../../../hooks/useAsyncAction';

interface AddEmployeeViewProps {
  onAddEmployee: (employee: Employee) => void;
  asOfDate: string;
  onNavigateTab: (tab: 'dashboard' | 'pay-salary') => void;
}

export const AddEmployeeView: React.FC<AddEmployeeViewProps> = ({
  onAddEmployee,
  asOfDate,
  onNavigateTab,
}) => {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('2025-01-01');
  const [initialSalary, setInitialSalary] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [createdEmpName, setCreatedEmpName] = useState('');
  const { submitting, run } = useAsyncAction();

  const monthlySalaryNum = parseFloat(initialSalary) || 0;
  const daysWorked = startDate ? Math.max(0, calculateDaysBetween(startDate, asOfDate)) : 0;
  const estimatedDailyRate = (monthlySalaryNum * 12) / 365.25;
  const estimatedInitialEarned = daysWorked * estimatedDailyRate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !startDate || !initialSalary) return;

    const newEmp: Employee = {
      id: `emp-${Date.now().toString().slice(-5)}`,
      name: name.trim(),
      startDate,
      initialSalary: monthlySalaryNum,
      salaryHistory: [],
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    await run(() => onAddEmployee(newEmp));
    setCreatedEmpName(name.trim());
    setIsSuccess(true);
  };

  const handleCreateAnother = () => {
    setName('');
    setIsSuccess(false);
  };

  if (isSuccess) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-[32px] border border-[#e8e6dc] p-10 shadow-sm text-center animate-in fade-in zoom-in-95 duration-200">
        <div className="w-16 h-16 bg-emerald-100/80 text-emerald-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-200">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="font-serif-title text-3xl font-bold text-zinc-900">Employee Successfully Registered!</h2>
        <p className="text-zinc-600 text-sm mt-2 max-w-md mx-auto font-medium">
          <span className="font-bold text-zinc-900">{createdEmpName}</span> has been added to Mathan ERP. Earnings have been automatically calculated based on their start date ({startDate}).
        </p>

        <div className="mt-6 p-5 bg-[#f6f5ef] border border-zinc-200 rounded-2xl max-w-sm mx-auto text-left text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-zinc-500 font-medium">Days Earned:</span>
            <span className="font-bold font-mono text-zinc-800">{daysWorked} days</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500 font-medium">Initial Earned Balance:</span>
            <span className="font-bold font-mono text-emerald-800">
              ${estimatedInitialEarned.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={handleCreateAnother}
            className="px-4 py-2 bg-[#f2f0e6] hover:bg-zinc-200 text-zinc-800 font-bold rounded-full text-xs transition cursor-pointer"
          >
            + Add Another Employee
          </button>
          <button
            onClick={() => onNavigateTab('pay-salary')}
            className="px-5 py-2 bg-[#54623e] hover:bg-[#435031] text-white font-bold uppercase tracking-wider rounded-full text-xs transition shadow-xs cursor-pointer flex items-center gap-1.5"
          >
            Pay Salary <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onNavigateTab('dashboard')}
            className="px-5 py-2 bg-zinc-900 hover:bg-black text-white font-bold uppercase tracking-wider rounded-full text-xs transition shadow-xs cursor-pointer"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* Registration Form */}
        <div className="md:col-span-7 bg-white p-3.5 sm:p-4 rounded-xl border border-[#e8e6dc] shadow-2xs">
          <form onSubmit={handleSubmit} className="space-y-2.5 text-xs">
            {/* Full Name */}
            <div>
              <label className="block text-zinc-700 font-bold mb-1 text-[11px]">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Sarah Jenkins"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#f2f0e6] border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-800 text-zinc-900 text-xs font-medium placeholder:italic"
              />
            </div>

            {/* Start Date & Initial Base Salary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-2.5 bg-[#f6f5ef] border border-[#e8e6dc] rounded-xl">
              <div>
                <label className="block text-zinc-800 font-bold mb-0.5 text-[11px]">
                  Start Date <span className="text-red-500">*</span>
                </label>
                <AppDatePicker value={startDate} onChange={setStartDate} required />
                <p className="text-[9px] text-zinc-500 mt-0.5">Supports past dates for backdated hire</p>
              </div>

              <div>
                <label className="block text-zinc-800 font-bold mb-0.5 text-[11px]">
                  Base Monthly Salary ($) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1.5 text-zinc-400 font-mono text-xs">$</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    placeholder="Enter amount"
                  value={initialSalary}
                  onChange={(e) => setInitialSalary(e.target.value)}
                  onBlur={(e) => setInitialSalary(e.target.value === '' ? '' : String(Number(e.target.value)))}
                    className="w-full pl-6 pr-2.5 py-1.5 bg-white border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-800 font-mono text-xs text-zinc-900 font-bold"
                  />
                </div>
                <p className="text-[9px] text-zinc-500 mt-0.5">Converted to daily rate (Monthly × 12 / 365.25)</p>
              </div>
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
                disabled={submitting}
                className="px-3.5 py-1.5 bg-[#54623e] hover:bg-[#435031] text-white font-bold uppercase tracking-wider rounded-lg text-xs transition shadow-2xs cursor-pointer flex items-center gap-1"
              >
                <UserPlus className="w-3.5 h-3.5" /> {submitting ? 'Saving…' : 'Save Employee'}
              </button>
            </div>
          </form>
        </div>

        {/* Live Calculation Preview Card */}
        <div className="md:col-span-5 space-y-2">
          <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-[#e8e6dc] shadow-2xs">
            <div className="space-y-2 text-xs">
              <div className="p-2 bg-[#f6f5ef] rounded-lg border border-zinc-200/60 space-y-1">
                <div className="flex justify-between text-zinc-500 font-medium text-[11px]">
                  <span>Start Date:</span>
                  <span className="font-mono text-zinc-900 font-bold">{startDate || 'Not set'}</span>
                </div>
                <div className="flex justify-between text-zinc-500 font-medium text-[11px]">
                  <span>As Of Date:</span>
                  <span className="font-mono text-zinc-900 font-bold">{asOfDate}</span>
                </div>
                <div className="flex justify-between text-zinc-500 border-t border-zinc-200 pt-1 font-medium text-[11px]">
                  <span>Days Elapsed:</span>
                  <span className="font-mono font-bold text-zinc-900">{daysWorked} days</span>
                </div>
              </div>

              <div className="p-2 bg-[#f6f5ef] rounded-lg border border-zinc-200/60 space-y-1">
                <div className="flex justify-between text-zinc-500 font-medium text-[11px]">
                  <span>Monthly Rate:</span>
                  <span className="font-mono text-zinc-900 font-bold">${monthlySalaryNum.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-zinc-500 font-medium text-[11px]">
                  <span>Daily Rate:</span>
                  <span className="font-mono text-zinc-900 font-bold">
                    ${estimatedDailyRate.toFixed(2)}/day
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-zinc-900 text-white rounded-lg">
                <div className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-400">Estimated Initial Balance</div>
                <div className="font-serif-title text-lg font-bold font-mono text-emerald-400 mt-0.5">
                  ${estimatedInitialEarned.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
