import React, { useState, useEffect } from 'react';
import { Employee, SalaryChange } from '../types';
import { formatCurrency, formatDate, getTodayString } from '../utils/calc';
import { X, TrendingUp, Calendar, AlertCircle, Info } from 'lucide-react';
import { showAppToast } from '../../../lib/mobile';

interface AddRaiseModalProps {
  isOpen: boolean;
  employees: Employee[];
  selectedEmployee: Employee | null;
  onClose: () => void;
  onSaveRaise: (employeeId: string, raise: SalaryChange) => void;
}

export const AddRaiseModal: React.FC<AddRaiseModalProps> = ({
  isOpen,
  employees,
  selectedEmployee,
  onClose,
  onSaveRaise,
}) => {
  if (!isOpen) return null;

  const [employeeId, setEmployeeId] = useState<string>(
    selectedEmployee ? selectedEmployee.id : employees[0]?.id || ''
  );
  const [newSalary, setNewSalary] = useState<string>('');
  const [effectiveDate, setEffectiveDate] = useState<string>(getTodayString());
  const [reason, setReason] = useState<string>('Performance Raise');
  const [validationMessage, setValidationMessage] = useState('');

  const currentEmp = employees.find((e) => e.id === employeeId) || selectedEmployee;

  useEffect(() => {
    if (selectedEmployee) {
      setEmployeeId(selectedEmployee.id);
      setNewSalary('');
    } else if (employees.length > 0) {
      setEmployeeId(employees[0].id);
      setNewSalary('');
    }
  }, [selectedEmployee, employees]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !newSalary || !effectiveDate || parsedNewSalary <= 0) return;
    if (parsedNewSalary <= currentBaseRate) {
      setValidationMessage(`Enter an amount greater than ${formatCurrency(currentBaseRate)}.`);
      return;
    }

    const raise: SalaryChange = {
      id: `sal-${Date.now().toString().slice(-6)}`,
      effectiveDate,
      newMonthlySalary: parseFloat(newSalary) || 0,
      reason: reason.trim() || 'Salary Adjustment',
      createdAt: new Date().toISOString(),
    };

    onSaveRaise(employeeId, raise);
    setNewSalary('');
    setValidationMessage('');
    showAppToast('Raise saved successfully');
    onClose();
  };

  const currentBaseRate = currentEmp
    ? currentEmp.salaryHistory.length > 0
      ? currentEmp.salaryHistory[currentEmp.salaryHistory.length - 1].newMonthlySalary
      : currentEmp.initialSalary
    : 0;

  const parsedNewSalary = parseFloat(newSalary) || 0;
  const salaryDiff = parsedNewSalary - currentBaseRate;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-600/30 text-indigo-300 rounded-lg border border-indigo-500/30">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Record Salary Raise / Rate Change</h2>
              <p className="text-xs text-slate-400">Backdate or future-date salary rate adjustments</p>
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
              onChange={(e) => {
                const id = e.target.value;
                setEmployeeId(id);
                const emp = employees.find((item) => item.id === id);
                if (emp) {
                  setNewSalary('');
                }
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 text-xs font-medium"
            >
              {[...employees].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.department} - Current Rate: ${emp.initialSalary}/mo)
                </option>
              ))}
            </select>
          </div>

          {/* Current Rate vs New Rate */}
          {currentEmp && (
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[10px] text-slate-500 block uppercase">Current Salary Rate</span>
                <strong className="text-slate-800 font-mono text-sm">{formatCurrency(currentBaseRate)}/mo</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block uppercase">Rate Difference</span>
                <strong
                  className={`font-mono text-sm ${
                    salaryDiff >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {salaryDiff >= 0 ? '+' : ''}
                  {formatCurrency(salaryDiff)}/mo
                </strong>
              </div>
            </div>
          )}

          {/* New Monthly Base Salary */}
          <div>
            <label className="block text-slate-800 font-bold mb-1">
              New Base Monthly Salary ($) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 font-mono text-xs">$</span>
              <input
                type="number"
                step="any"
                required
                min="0"
                value={newSalary}
                onChange={(e) => { setNewSalary(e.target.value); setValidationMessage(''); }}
                onBlur={(e) => setNewSalary(e.target.value === '' ? '' : String(Number(e.target.value)))}
                className="w-full pl-7 pr-3 py-2 bg-white border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs text-slate-900 font-bold text-sm"
              />
            </div>
            {validationMessage && <p className="mt-1 text-[10px] font-semibold text-red-600">{validationMessage}</p>}
          </div>

          {/* Effective Start Date of Raise (Past or Future) */}
          <div>
            <label className="block text-slate-800 font-bold mb-1">
              When Did / Will This Raise Start? <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                required
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs text-slate-900 font-bold"
              />
            </div>
            <div className="bg-amber-50 border border-amber-200/80 rounded-lg p-2.5 mt-1.5 flex items-start space-x-2 text-[11px] text-amber-900">
              <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>Backdating support:</strong> You can select a date months in the past (e.g. 2 months ago). The system will automatically recalculate historical earnings for those months at this new rate.
              </span>
            </div>
          </div>

          {/* Reason / Notes */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1">Reason for Salary Change</label>
            <input
              type="text"
              placeholder="e.g. Backdated promotion to Senior, Annual review merit increase, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 text-xs"
            />
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition shadow-xs cursor-pointer"
            >
              Apply Salary Raise
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
