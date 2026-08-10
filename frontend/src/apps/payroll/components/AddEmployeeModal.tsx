import React, { useState } from 'react';
import { Employee } from '../types';
import { getTodayString } from '../utils/calc';
import { X, UserPlus, DollarSign, Calendar, Building, Briefcase, Mail } from 'lucide-react';

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (employee: Employee) => void;
}

export const AddEmployeeModal: React.FC<AddEmployeeModalProps> = ({ isOpen, onClose, onAdd }) => {
  if (!isOpen) return null;

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('2025-01-01'); // Convenient default past date as requested in prompt example
  const [initialSalary, setInitialSalary] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !startDate || !initialSalary) return;

    const newEmp: Employee = {
      id: `emp-${Date.now().toString().slice(-5)}`,
      name: name.trim(),
      startDate,
      initialSalary: parseFloat(initialSalary) || 0,
      salaryHistory: [],
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    onAdd(newEmp);
    onClose();
    // Reset
    setName('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-600/30 text-indigo-300 rounded-lg border border-indigo-500/30">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Add New Employee</h2>
              <p className="text-xs text-slate-400">Set start date and base salary for automatic accruals</p>
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
          {/* Employee Full Name */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Alexander Pierce"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 text-xs"
            />
          </div>

          {/* Start Date & Initial Base Salary */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl">
            <div>
              <label className="block text-slate-800 font-bold mb-1">
                Start Date <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs text-slate-900"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Calculates accruals from this date</p>
            </div>

            <div>
              <label className="block text-slate-800 font-bold mb-1">
                Base Monthly Salary ($) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 font-mono text-xs">$</span>
                <input
                  type="number"
                  min="0"
                step="any"
                  required
                  placeholder="Enter amount"
                  value={initialSalary}
                  onChange={(e) => setInitialSalary(e.target.value)}
                  onBlur={(e) => setInitialSalary(e.target.value === '' ? '' : String(Number(e.target.value)))}
                  className="w-full pl-7 pr-3 py-2 bg-white border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs text-slate-900 font-bold"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Starting monthly rate</p>
            </div>
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
              Create Employee Profile
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
