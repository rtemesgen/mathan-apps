import React from 'react';
import { X, Download, Printer, FileText, CheckCircle2 } from 'lucide-react';
import { TruckFinancialSummary, Transaction } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { downloadCsvFile } from '../../../../lib/fileExport';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: TruckFinancialSummary;
  transactions: Transaction[];
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  summary,
  transactions,
}) => {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadCSV = () => {
    const headers = ['Date', 'Type', 'Category', 'Party/Owner', 'Description', 'Reference', 'Amount'];
    const rows = transactions.map((t) => [
      t.date,
      t.type,
      t.category,
      t.ownerId || 'Truck Treasury',
      t.description,
      t.referenceNo || '',
      t.amount,
    ]);

    void downloadCsvFile(`${summary.truckName}_Financial_Ledger_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 print:p-0 print:bg-white print:static">
      <div className="bg-[#ffffff] border border-[#e5dfd2] rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl print:border-none print:shadow-none print:max-w-none print:w-full">
        {/* Header */}
        <div className="bg-[#f8f6f0] border-b border-[#e5dfd2] px-6 py-4 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#1c1d1f] text-white flex items-center justify-center font-bold">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#1c1d1f] uppercase tracking-tight">
                Export Financial Ledger Statement
              </h3>
              <p className="text-[10px] text-[#787672] font-semibold">
                Official Multi-Owner Equity & Loan Summary
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[#8c8880] hover:text-[#1c1d1f] p-1.5 rounded-full hover:bg-[#e8e2d4] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Document Body */}
        <div className="p-8 space-y-6 overflow-y-auto flex-1 font-sans text-xs">
          {/* Printable Header */}
          <div className="border-b border-[#e5dfd2] pb-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-serif-display font-bold italic text-[#1c1d1f]">
                {summary.truckName}
              </h1>
              <p className="text-xs text-[#787672] font-semibold">
                Multi-Owner Equity Statement & Debt Clearance Report
              </p>
            </div>
            <div className="text-right text-xs text-[#787672]">
              <div>Date Generated: <strong>{new Date().toLocaleDateString()}</strong></div>
              <div>Status: <strong className="text-[#2e7d32]">AUDITED</strong></div>
            </div>
          </div>

          {/* Key Summary Stats */}
          <div className="grid grid-cols-3 gap-4 bg-[#f8f6f0] p-4 rounded-2xl border border-[#e5dfd2]">
            <div>
              <div className="text-[10px] uppercase font-bold text-[#8c8880]">Truck Cash Balance</div>
              <div className="text-lg font-serif-display font-bold text-[#1c1d1f]">
                {formatCurrency(summary.cashOnHand)}
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase font-bold text-[#8c8880]">Total Owner Debt Owed</div>
              <div className="text-lg font-serif-display font-bold text-[#1c1d1f]">
                {formatCurrency(summary.totalUnpaidDebtToOwners)}
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase font-bold text-[#8c8880]">Total Paid Back</div>
              <div className="text-lg font-serif-display font-bold text-[#2e7d32]">
                {formatCurrency(summary.totalOwnerRepayments + summary.totalProfitDistributed)}
              </div>
            </div>
          </div>

          {/* Owner Breakdown Table */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#1c1d1f] mb-2">
              Owner Equity & Loan Clearance Ledger
            </h4>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#f0ebd9] text-[#1c1d1f] font-bold">
                  <th className="p-2 border border-[#e5dfd2]">OWNER</th>
                  <th className="p-2 border border-[#e5dfd2]">EQUITY %</th>
                  <th className="p-2 border border-[#e5dfd2]">LENT TO TRUCK</th>
                  <th className="p-2 border border-[#e5dfd2]">REPAID BY TRUCK</th>
                  <th className="p-2 border border-[#e5dfd2]">REMAINING OWED</th>
                </tr>
              </thead>
              <tbody>
                {summary.ownerSummaries.map((s) => (
                  <tr key={s.owner.id} className="border-b border-[#e5dfd2]">
                    <td className="p-2 font-bold text-[#1c1d1f]">{s.owner.name}</td>
                    <td className="p-2 text-[#a3683a] font-bold">{s.owner.equityPercentage}%</td>
                    <td className="p-2 font-semibold">{formatCurrency(s.totalInjected)}</td>
                    <td className="p-2 text-[#2e7d32] font-semibold">{formatCurrency(s.totalRepaid)}</td>
                    <td className="p-2 font-serif-display font-bold italic text-sm">{formatCurrency(s.totalUnpaidMoneyOwed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-[#f8f6f0] border-t border-[#e5dfd2] p-4 flex items-center justify-end gap-3 print:hidden">
          <button
            onClick={handleDownloadCSV}
            className="px-4 py-2 bg-white border border-[#d8d0be] hover:bg-[#f3efe6] text-[#1c1d1f] text-xs font-bold rounded-xl flex items-center gap-2 transition-colors shadow-2xs"
          >
            <Download className="w-4 h-4" />
            <span>Download CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-5 py-2 bg-[#1c1d1f] hover:bg-[#2e2f33] text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-colors shadow-xs"
          >
            <Printer className="w-4 h-4" />
            <span>Print PDF Report</span>
          </button>
        </div>
      </div>
    </div>
  );
};
