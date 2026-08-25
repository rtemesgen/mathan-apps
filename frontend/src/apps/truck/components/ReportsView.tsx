import React, { useState } from 'react';
import { Search, FileText } from 'lucide-react';
import { TruckFinancialSummary } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';
import { ExportButton } from '../../../components/ExportButton';

interface ReportsViewProps {
  summary: TruckFinancialSummary;
  onPayOwner: (ownerId: string) => void;
  onExport: (filters?: { query?: string }) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ summary, onPayOwner, onExport }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredOwners = summary.ownerSummaries.filter((s) =>
    s.owner.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalEarned = summary.ownerSummaries.reduce((acc, curr) => acc + curr.earnedProfitShare + curr.totalInjected, 0);
  const totalPaidOut = summary.totalOwnerRepayments + summary.totalProfitDistributed;

  return (
    <div className="p-3 sm:p-5 space-y-3 max-w-5xl mx-auto">
      {/* Top Header Banner */}
      <div className="flex items-center justify-between pb-2 border-b border-[#e5dfd2]">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#1c1d1f]" />
          <h2 className="text-sm sm:text-base font-bold text-[#1c1d1f] uppercase tracking-tight">
            Financial Reports
          </h2>
        </div>

        <ExportButton onClick={() => onExport({ query: searchTerm || undefined })} />
      </div>

      {/* 3 Metric Cards in One Single Row */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
        <div className="bg-white border border-[#e5dfd2] rounded-xl p-2 sm:p-3 shadow-2xs">
          <div className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider text-[#8c8880] truncate">
            Total Money Owed
          </div>
          <div className="text-xs sm:text-lg font-bold text-[#1c1d1f] mt-0.5 truncate">
            {formatCurrency(summary.totalUnpaidDebtToOwners, false)}
          </div>
          <div className="text-[8px] sm:text-[10px] text-[#787672] truncate hidden sm:block">
            Owed to all owners
          </div>
        </div>

        <div className="bg-white border border-[#e5dfd2] rounded-xl p-2 sm:p-3 shadow-2xs">
          <div className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider text-[#8c8880] truncate">
            Total Loans Given
          </div>
          <div className="text-xs sm:text-lg font-bold text-[#1c1d1f] mt-0.5 truncate">
            {formatCurrency(totalEarned, false)}
          </div>
          <div className="text-[8px] sm:text-[10px] text-[#787672] truncate hidden sm:block">
            Loans & earned shares
          </div>
        </div>

        <div className="bg-white border border-[#e5dfd2] rounded-xl p-2 sm:p-3 shadow-2xs">
          <div className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider text-[#8c8880] truncate">
            Total Paid Back
          </div>
          <div className="text-xs sm:text-lg font-bold text-[#2e7d32] mt-0.5 truncate">
            {formatCurrency(totalPaidOut, false)}
          </div>
          <div className="text-[8px] sm:text-[10px] text-[#787672] truncate hidden sm:block">
            Repaid loans & profits
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5"><p className="text-[9px] font-bold uppercase text-blue-700">Customers owe</p><p className="mt-1 text-sm font-bold text-blue-950">{formatCurrency(summary.totalReceivable)}</p></div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5"><p className="text-[9px] font-bold uppercase text-rose-700">Truck owes</p><p className="mt-1 text-sm font-bold text-rose-950">{formatCurrency(summary.totalPayable)}</p></div>
        <div className="col-span-2 rounded-xl border border-[#e5dfd2] bg-white p-2.5"><p className="text-[9px] font-bold uppercase text-[#8c8880]">Where money is held / owed</p><p className="mt-1 text-[11px] font-semibold text-[#4a4843]">{summary.counterpartyBalances.length ? summary.counterpartyBalances.map((item) => `${item.name}: ${formatCurrency(item.amount)} ${item.type === 'receivable' ? 'owed to truck' : 'payable'}`).join(' · ') : 'No open receivables or payables.'}</p></div>
      </div>

      {/* Search Bar */}
      <div className="bg-white border border-[#e5dfd2] rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-xs">
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-[#8c8880] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search owner..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#f8f6f0] border border-[#e5dfd2] rounded-lg pl-8 pr-3 py-1 text-xs font-semibold text-[#1c1d1f] focus:outline-none"
          />
        </div>

        <div className="text-[11px] text-[#787672] font-semibold">
          {filteredOwners.length} owners
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#e5dfd2] rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f8f6f0] border-b border-[#e5dfd2] text-[#787672] uppercase text-[9px] font-bold tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Owner</th>
                <th className="py-2.5 px-3">Share %</th>
                <th className="py-2.5 px-3">Monthly Pay</th>
                <th className="py-2.5 px-3">Loan Given</th>
                <th className="py-2.5 px-3">Repaid</th>
                <th className="py-2.5 px-3 font-bold text-[#1c1d1f]">Owed</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0ebd9] font-medium text-[#1c1d1f]">
              {filteredOwners.map((s) => (
                <tr key={s.owner.id} className="hover:bg-[#faf8f5]">
                  <td className="py-2 px-3">
                    <div className="font-bold">{s.owner.name}</div>
                    <div className="text-[10px] text-[#787672]">Since {formatDate(s.owner.startDate)}</div>
                  </td>
                  <td className="py-2 px-3 font-bold">{s.owner.equityPercentage}%</td>
                  <td className="py-2 px-3">{formatCurrency(s.owner.monthlyDrawRate)}</td>
                  <td className="py-2 px-3">{formatCurrency(s.totalInjected, false)}</td>
                  <td className="py-2 px-3 text-[#2e7d32]">{formatCurrency(s.totalRepaid, false)}</td>
                  <td className="py-2 px-3 font-bold text-sm text-[#1c1d1f]">
                    {formatCurrency(s.totalUnpaidMoneyOwed)}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      onClick={() => onPayOwner(s.owner.id)}
                      className="bg-[#3f4d34] hover:bg-[#323e29] text-white text-[11px] font-bold px-2.5 py-1 rounded-md transition-colors"
                    >
                      Pay
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
