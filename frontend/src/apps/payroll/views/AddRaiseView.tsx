import React, { useState, useEffect } from 'react';
import { Employee, SalaryChange } from '../types';
import { calculateEmployeeAccrual, getTodayString } from '../utils/calc';
import { showAppToast } from '../../../lib/mobile';
import {
  TrendingUp,
  DollarSign,
  Calendar,
  User,
  CheckCircle2,
  AlertCircle,
  FileText,
  History,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface AddRaiseViewProps {
  employees: Employee[];
  asOfDate: string;
  onSaveRaise: (employeeId: string, raise: SalaryChange) => void;
  onNavigateTab: (tab: 'dashboard') => void;
}

export const AddRaiseView: React.FC<AddRaiseViewProps> = ({
  employees,
  asOfDate,
  onSaveRaise,
  onNavigateTab,
}) => {
  const [selectedEmpId, setSelectedEmpId] = useState<string>(employees[0]?.id || '');
  const [newSalary, setNewSalary] = useState<string>('');
  const [effectiveDate, setEffectiveDate] = useState<string>(asOfDate || getTodayString());
  const [reason, setReason] = useState<string>('Performance raise');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [savedRaise, setSavedRaise] = useState<{ employeeName: string; amount: number; effectiveDate: string } | null>(null);

  useEffect(() => {
    if (!selectedEmpId && employees.length > 0) {
      setSelectedEmpId(employees[0].id);
    }
  }, [employees, selectedEmpId]);

  const selectedEmp = employees.find((e) => e.id === selectedEmpId);

  // Determine current effective monthly rate
  const getCurrentSalaryRate = (emp: Employee) => {
    if (!emp.salaryHistory || emp.salaryHistory.length === 0) {
      return emp.initialSalary;
    }
    // Latest salary rate as of today
    const sorted = [...emp.salaryHistory].sort((a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate)
    );
    return sorted[sorted.length - 1].newMonthlySalary;
  };

  const currentRate = selectedEmp ? getCurrentSalaryRate(selectedEmp) : 0;
  const numNewSalary = parseFloat(newSalary) || 0;
  const salaryDiff = numNewSalary - currentRate;
  const percentDiff = currentRate > 0 ? (salaryDiff / currentRate) * 100 : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp || !Number.isFinite(numNewSalary) || numNewSalary <= 0 || !effectiveDate) return;
    if (numNewSalary <= currentRate) {
      setValidationMessage(`Enter an amount greater than ${formatMoney(currentRate)}.`);
      return;
    }

    const raise: SalaryChange = {
      id: `sc-${Date.now().toString().slice(-6)}`,
      effectiveDate,
      newMonthlySalary: numNewSalary,
      reason: reason.trim() || 'Salary adjustment',
      createdAt: new Date().toISOString(),
    };

    onSaveRaise(selectedEmp.id, raise);
    setSavedRaise({ employeeName: selectedEmp.name, amount: numNewSalary, effectiveDate });
    setNewSalary('');
    setIsSuccess(true);
    showAppToast('Raise saved successfully');
  };

  const formatMoney = (val: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(val);

  return (
    <div className="max-w-4xl mx-auto space-y-3">
      {isSuccess && savedRaise && (
        <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-2.5 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-800 text-white rounded-full shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif-title text-sm font-bold text-emerald-950">Salary Raise Applied & Recalculated!</h3>
              <p className="text-[11px] text-emerald-800 font-medium">
                Updated <span className="font-bold text-zinc-900">{savedRaise.employeeName}</span> base salary to{' '}
                <span className="font-mono font-bold">{formatMoney(savedRaise.amount)}/mo</span> effective {savedRaise.effectiveDate}.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('dashboard')}
            className="px-3.5 py-1.5 bg-[#54623e] hover:bg-[#435031] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition shadow-xs cursor-pointer shrink-0"
          >
            View Dashboard Balances
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* Form Column */}
        <div className="md:col-span-7 bg-white p-3.5 sm:p-4 rounded-xl border border-[#e8e6dc] shadow-2xs">
          <form onSubmit={handleSubmit} className="space-y-2.5 text-xs">
            {/* Employee Selector */}
            <div>
              <label className="block text-zinc-800 font-bold mb-1 flex items-center gap-1.5 text-[11px]">
                <User className="w-3.5 h-3.5 text-zinc-700" /> Select Employee Profile <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedEmpId}
                onChange={(e) => {
                  setSelectedEmpId(e.target.value);
                  setIsSuccess(false);
                }}
                className="w-full px-3 py-1.5 bg-[#f2f0e6] border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-800 text-zinc-900 text-xs font-bold cursor-pointer"
              >
                {employees.map((emp) => {
                  const rate = getCurrentSalaryRate(emp);
                  return (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.department}) — Current Rate: {formatMoney(rate)}/mo
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Current Rate vs New Rate Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-2.5 bg-[#f6f5ef] border border-[#e8e6dc] rounded-xl">
              <div>
                <label className="block text-zinc-500 font-medium mb-0.5 text-[10px]">Current Monthly Rate</label>
                <div className="font-serif-title text-base font-bold text-zinc-900">
                  {formatMoney(currentRate)}/mo
                </div>
                <span className="text-[9px] text-zinc-500 font-mono">Daily: ${(currentRate * 12 / 365.25).toFixed(2)}/day</span>
              </div>

              <div>
                <label className="block text-zinc-800 font-bold mb-0.5 text-[10px]">
                  New Monthly Rate ($) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1.5 text-zinc-400 font-mono text-xs">$</span>
                  <input
                    type="number"
                    step="any"
                    required
                    min={currentRate}
                    placeholder="Enter new salary"
                    value={newSalary}
                    onChange={(e) => { setNewSalary(e.target.value); setValidationMessage(''); }}
                    className="w-full pl-6 pr-2.5 py-1 bg-white border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-800 font-mono text-xs font-bold text-zinc-900"
                  />
                </div>
                {validationMessage && <span className="mt-1 block text-[10px] font-semibold text-red-600">{validationMessage}</span>}
                <span className="text-[9px] text-zinc-500 font-mono">Daily: ${(numNewSalary * 12 / 365.25).toFixed(2)}/day</span>
              </div>
            </div>

            {/* Effective Date & Reason */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-zinc-700 font-bold mb-1 text-[11px]">
                  Effective Start Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#f2f0e6] border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-800 font-mono text-xs text-zinc-900 font-bold"
                />
                <p className="text-[9px] text-zinc-500 mt-0.5">Supports past dates for retroactive raise</p>
              </div>

              <div>
                <label className="block text-zinc-700 font-bold mb-1 text-[11px]">Reason / Promotion Title</label>
                <input
                  type="text"
                  placeholder="e.g. Annual Merit Increase"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#f2f0e6] border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-800 text-zinc-900 text-xs font-medium placeholder:italic"
                />
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
                disabled={!selectedEmp || !Number.isFinite(numNewSalary) || numNewSalary <= 0}
                className="px-3.5 py-1.5 bg-[#54623e] hover:bg-[#435031] disabled:bg-zinc-300 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition shadow-2xs cursor-pointer flex items-center gap-1"
              >
                <TrendingUp className="w-3.5 h-3.5" /> Save Raise
              </button>
            </div>
          </form>
        </div>

        {/* Rate Impact & History */}
        <div className="md:col-span-5 space-y-2">
          {/* Rate Difference Card */}
          <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-[#e8e6dc] shadow-2xs">
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-400 block mb-1.5">
              RAISE COMPARISON BREAKDOWN
            </span>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 bg-[#f6f5ef] rounded-lg border border-zinc-200/60 space-y-1 text-[11px]">
                <div className="flex justify-between text-zinc-500 font-medium">
                  <span>Old Monthly Rate:</span>
                  <span className="font-mono text-zinc-900 font-bold">{formatMoney(currentRate)}/mo</span>
                </div>
                <div className="flex justify-between text-zinc-500 font-medium">
                  <span>New Monthly Rate:</span>
                  <span className="font-mono text-zinc-900 font-bold">{formatMoney(numNewSalary)}/mo</span>
                </div>
                <div className="flex justify-between text-zinc-900 border-t border-zinc-200 pt-1 font-bold">
                  <span>Monthly Increase:</span>
                  <span className={`font-mono ${salaryDiff >= 0 ? 'text-emerald-800' : 'text-red-700'}`}>
                    {salaryDiff >= 0 ? '+' : ''}{formatMoney(salaryDiff)} ({percentDiff >= 0 ? '+' : ''}{percentDiff.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
