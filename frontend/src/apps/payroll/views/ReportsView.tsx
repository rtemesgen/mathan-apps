import React, { useState } from 'react';
import { Employee, Transaction } from '../types';
import { calculateCompanyStats, calculateEmployeeAccrual, downloadFile } from '../utils/calc';
import { exportPdfFile } from '../../../lib/mobile';
import {
  FileSpreadsheet,
  Download,
  Printer,
  Search,
  Filter,
  Building,
  DollarSign,
  TrendingUp,
  Banknote,
  Users,
  CheckCircle2
} from 'lucide-react';

interface ReportsViewProps {
  employees: Employee[];
  transactions: Transaction[];
  asOfDate: string;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  employees,
  transactions,
  asOfDate,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');

  const stats = calculateCompanyStats(employees, transactions, asOfDate);

  // Filter employees sorted by start date descending
  const filteredEmployees = employees
    .filter((emp) => {
      return emp.name.toLowerCase().includes(searchTerm.toLowerCase());
    })
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  const formatMoney = (val: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(val);

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'Employee ID',
      'Name',
      'Start Date',
      'Monthly Base Rate ($)',
      'Gross Earned ($)',
      'Total Withdrawn ($)',
      'Net Owed Balance ($)',
    ];

    const rows = filteredEmployees.map((emp) => {
      const info = calculateEmployeeAccrual(emp, transactions, asOfDate);
      return [
        emp.id,
        `"${emp.name}"`,
        emp.startDate,
        info.currentMonthlySalary.toFixed(2),
        info.totalAccruedWages.toFixed(2),
        info.totalWithdrawn.toFixed(2),
        info.remainingBalance.toFixed(2),
      ];
    });

    downloadFile(`Payroll_Report_AsOf_${asOfDate}.csv`, [headers.join(','), ...rows.map((r) => r.join(','))].join('\n'));
  };

  const handlePrint = () => {
    const lines = filteredEmployees.map((emp) => {
      const info = calculateEmployeeAccrual(emp, transactions, asOfDate);
      return `${emp.name} | ${emp.department} | Accrued ${formatMoney(info.totalAccruedWages)} | Paid ${formatMoney(info.totalWithdrawn)} | Balance ${formatMoney(info.remainingBalance)}`;
    });
    void exportPdfFile(`Payroll_Report_AsOf_${asOfDate}.pdf`, 'Mathan ERP Payroll Report', [`As of ${asOfDate}`, `Total liability: ${formatMoney(stats.totalCompanyLiability)}`, `Total accrued: ${formatMoney(stats.totalCompanyAccrued)}`, `Total paid: ${formatMoney(stats.totalCompanyPaidOut)}`, '', ...lines]);
  };

  return (
    <div className="space-y-2 sm:space-y-2.5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-2">
        <div className="bg-white p-2 sm:p-3 rounded-xl border border-[#e8e6dc] shadow-2xs flex flex-col justify-between">
          <span className="text-[9px] sm:text-xs font-semibold text-zinc-500 block truncate">Total Money Owed</span>
          <div className="font-serif-title text-xs sm:text-lg lg:text-xl font-bold text-zinc-900 mt-0.5 truncate">{formatMoney(stats.totalCompanyLiability)}</div>
          <p className="text-[8px] sm:text-[10px] text-zinc-400 mt-0.5 font-medium truncate">Unpaid money owed to staff</p>
        </div>

        <div className="bg-white p-2 sm:p-3 rounded-xl border border-[#e8e6dc] shadow-2xs flex flex-col justify-between">
          <span className="text-[9px] sm:text-xs font-semibold text-zinc-500 block truncate">Total Earned to Date</span>
          <div className="font-serif-title text-xs sm:text-lg lg:text-xl font-bold text-zinc-900 mt-0.5 truncate">{formatMoney(stats.totalCompanyAccrued)}</div>
          <p className="text-[8px] sm:text-[10px] text-zinc-400 mt-0.5 font-medium truncate">Total wages earned</p>
        </div>

        <div className="bg-white p-2 sm:p-3 rounded-xl border border-[#e8e6dc] shadow-2xs flex flex-col justify-between">
          <span className="text-[9px] sm:text-xs font-semibold text-zinc-500 block truncate">Total Paid Out</span>
          <div className="font-serif-title text-xs sm:text-lg lg:text-xl font-bold text-emerald-800 mt-0.5 truncate">{formatMoney(stats.totalCompanyPaidOut)}</div>
          <p className="text-[8px] sm:text-[10px] text-zinc-400 mt-0.5 font-medium truncate">{transactions.length} total payments</p>
        </div>

        <div className="bg-white p-2 sm:p-3 rounded-xl border border-[#e8e6dc] shadow-2xs flex flex-col justify-between">
          <span className="text-[9px] sm:text-xs font-semibold text-zinc-500 block truncate">Total Monthly Payroll</span>
          <div className="font-serif-title text-xs sm:text-lg lg:text-xl font-bold text-zinc-900 mt-0.5 truncate">{formatMoney(stats.totalMonthlyPayrollRate)}</div>
          <p className="text-[8px] sm:text-[10px] text-zinc-400 mt-0.5 font-medium truncate">Active monthly staff pay</p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-[24px] border border-[#e8e6dc] shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search employee by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#f2f0e6] border border-zinc-200 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-zinc-800 placeholder:italic"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={handlePrint}
            className="px-3.5 py-1.5 bg-[#54623e] hover:bg-[#435031] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition shadow-2xs cursor-pointer flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> Export PDF
          </button>
        </div>
      </div>

      {/* Main Breakdown Table */}
      <div className="bg-white rounded-[32px] border border-[#e8e6dc] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f2f0e6] text-zinc-500 font-extrabold uppercase text-[10px] tracking-widest border-b border-[#e8e6dc]">
              <tr>
                <th className="py-3.5 px-6">Employee</th>
                <th className="py-3.5 px-4">Start Date</th>
                <th className="py-3.5 px-4 text-right">Monthly Rate</th>
                <th className="py-3.5 px-4 text-right">Daily Rate</th>
                <th className="py-3.5 px-4 text-right">Gross Earned</th>
                <th className="py-3.5 px-4 text-right">Total Paid</th>
                <th className="py-3.5 px-6 text-right">Net Balance Owed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e6dc]">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-400 italic">
                    No employee records matching search.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => {
                  const info = calculateEmployeeAccrual(emp, transactions, asOfDate);
                  const dailyRate = (info.currentMonthlySalary * 12) / 365.25;
                  return (
                    <tr key={emp.id} className="hover:bg-[#f6f5ef]/80 transition">
                      <td className="py-3.5 px-6">
                        <div className="font-bold text-zinc-900">{emp.name}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-zinc-600 font-semibold">{emp.startDate}</td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-zinc-900">
                        {formatMoney(info.currentMonthlySalary)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-zinc-600 font-medium">
                        ${dailyRate.toFixed(2)}/d
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-zinc-900">
                        {formatMoney(info.totalAccruedWages)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-800">
                        -{formatMoney(info.totalWithdrawn)}
                      </td>
                      <td className="py-3.5 px-6 text-right font-mono font-bold text-zinc-900 bg-[#f6f5ef]">
                        {formatMoney(info.remainingBalance)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
