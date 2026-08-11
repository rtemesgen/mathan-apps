import React, { useState } from 'react';
import { Employee, Transaction } from '../types';
import {
  calculateEmployeeAccrual,
  calculateCompanyStats,
  exportPayrollCSV,
  downloadFile,
  formatCurrency,
  formatDate,
} from '../utils/calc';
import { exportPdfFile } from '../../../lib/mobile';
import {
  X,
  FileSpreadsheet,
  Printer,
  Download,
  Building2,
  Calendar,
  Search,
  Filter,
  CheckCircle2,
} from 'lucide-react';

interface PayrollReportModalProps {
  isOpen: boolean;
  employees: Employee[];
  transactions: Transaction[];
  asOfDate: string;
  onClose: () => void;
}

export const PayrollReportModal: React.FC<PayrollReportModalProps> = ({
  isOpen,
  employees,
  transactions,
  asOfDate,
  onClose,
}) => {
  if (!isOpen) return null;

  const [selectedDept, setSelectedDept] = useState<string>('all');
  const departments = Array.from(new Set(employees.map((e) => e.department))).sort();

  const filteredEmployees = employees.filter(
    (emp) => selectedDept === 'all' || emp.department === selectedDept
  ).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const stats = calculateCompanyStats(filteredEmployees, transactions, asOfDate);

  const handleExportCSV = () => {
    const csvContent = exportPayrollCSV(filteredEmployees, transactions, asOfDate);
    const filename = `payroll_summary_${selectedDept}_${asOfDate}.csv`;
    downloadFile(filename, csvContent, 'text/csv;charset=utf-8;');
  };

  const handlePrint = () => {
    const lines = filteredEmployees.map((emp) => {
      const employeeStats = calculateEmployeeAccrual(emp, transactions, asOfDate);
      const dailyRate = (employeeStats.currentMonthlySalary * 12) / 365.25;
      return `${emp.name} | ${emp.startDate} | ${formatCurrency(employeeStats.currentMonthlySalary)} | ${formatCurrency(dailyRate)} | ${formatCurrency(employeeStats.totalAccruedWages)} | ${formatCurrency(employeeStats.totalWithdrawn)} | ${formatCurrency(employeeStats.remainingBalance)}`;
    });
    void exportPdfFile(`payroll_summary_${selectedDept}_${asOfDate}.pdf`, 'Mathan ERP Payroll Summary', [`As of ${asOfDate}`, `Total liability: ${formatCurrency(stats.totalCompanyLiability)}`, `Total earned: ${formatCurrency(stats.totalCompanyAccrued)}`, `Total paid: ${formatCurrency(stats.totalCompanyPaidOut)}`, '', ...lines]);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-600/30 text-emerald-300 rounded-xl border border-emerald-500/30">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Accounting Payroll Summary & Liability Export</h2>
              <p className="text-xs text-slate-400">
                Official financial records of employee wages earned, paid, and balances held
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition shadow-xs flex items-center cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Download CSV Report
            </button>
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition flex items-center cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Print PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Paper Header */}
        <div className="p-6 bg-slate-50 border-b border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div>
              <div className="flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-extrabold text-slate-900">
                  Global Enterprise Payroll Statement
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Calculated up to <strong className="text-slate-800">{formatDate(asOfDate)}</strong>
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <span className="text-xs text-slate-500">Department Filter:</span>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="py-1 px-3 text-xs bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-800"
              >
                <option value="all">All Departments ({employees.length})</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Key Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
              <span className="text-[10px] font-bold text-amber-800 block uppercase">
                Total Unpaid Company Liability
              </span>
              <strong className="text-lg font-bold font-mono text-amber-950 mt-0.5 block">
                {formatCurrency(stats.totalCompanyLiability)}
              </strong>
            </div>

            <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100">
              <span className="text-[10px] font-bold text-indigo-800 block uppercase">
                Total Wages Earned
              </span>
              <strong className="text-lg font-bold font-mono text-indigo-900 mt-0.5 block">
                {formatCurrency(stats.totalCompanyAccrued)}
              </strong>
            </div>

            <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
              <span className="text-[10px] font-bold text-emerald-800 block uppercase">
                Total Paid
              </span>
              <strong className="text-lg font-bold font-mono text-emerald-900 mt-0.5 block">
                {formatCurrency(stats.totalCompanyPaidOut)}
              </strong>
            </div>

            <div className="bg-slate-100 p-3 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-600 block uppercase">
                Monthly Run Rate
              </span>
              <strong className="text-lg font-bold font-mono text-slate-800 mt-0.5 block">
                {formatCurrency(stats.totalMonthlyPayrollRate)}/mo
              </strong>
            </div>
          </div>
        </div>

        {/* Report Table */}
        <div className="p-6 overflow-y-auto flex-1">
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                  <th className="p-3">Employee Name</th>
                  <th className="p-3">Start Date</th>
                  <th className="p-3 text-right">Monthly Rate</th>
                  <th className="p-3 text-right">Daily Rate</th>
                  <th className="p-3 text-right">Earned ($)</th>
                  <th className="p-3 text-right">Paid ($)</th>
                  <th className="p-3 text-right">Balance ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredEmployees.map((emp) => {
                  const summary = calculateEmployeeAccrual(emp, transactions, asOfDate);
                  const dailyRate = (summary.currentMonthlySalary * 12) / 365.25;
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 font-semibold text-slate-900">
                        {emp.name}
                        <span className="block text-[10px] font-normal text-slate-400">
                          {emp.position}
                        </span>
                      </td>
                      <td className="p-3 font-mono">{formatDate(emp.startDate)}</td>
                      <td className="p-3 text-right font-mono font-medium">
                        {formatCurrency(summary.currentMonthlySalary)}
                      </td>
                      <td className="p-3 text-right font-mono font-medium">
                        {formatCurrency(dailyRate)}
                      </td>
                      <td className="p-3 text-right font-mono text-indigo-700">
                        {formatCurrency(summary.totalAccruedWages)}
                      </td>
                      <td className="p-3 text-right font-mono text-emerald-700">
                        {formatCurrency(summary.totalWithdrawn)}
                      </td>
                      <td className="p-3 text-right font-mono font-extrabold text-amber-900 bg-amber-500/5">
                        {formatCurrency(summary.remainingBalance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-white font-mono font-bold">
                  <td colSpan={2} className="p-3.5 uppercase font-sans text-[11px] tracking-wider text-slate-300">
                    Grand Totals ({filteredEmployees.length} employees)
                  </td>
                  <td className="p-3.5 text-right">{formatCurrency(stats.totalMonthlyPayrollRate)}</td>
                  <td className="p-3.5 text-right">{formatCurrency((stats.totalMonthlyPayrollRate * 12) / 365.25)}</td>
                  <td className="p-3.5 text-right text-indigo-300">
                    {formatCurrency(stats.totalCompanyAccrued)}
                  </td>
                  <td className="p-3.5 text-right text-emerald-300">
                    {formatCurrency(stats.totalCompanyPaidOut)}
                  </td>
                  <td className="p-3.5 text-right text-amber-300 text-sm">
                    {formatCurrency(stats.totalCompanyLiability)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 border-t border-slate-200 p-3.5 flex items-center justify-between text-xs text-slate-500">
          <span>Automated Accounting Export Engine</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition cursor-pointer"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
};
