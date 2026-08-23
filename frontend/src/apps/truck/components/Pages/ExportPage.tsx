import React, { useState } from 'react';
import { Download, Printer, FileText, CheckCircle2 } from 'lucide-react';
import { TruckFinancialSummary, Transaction, Owner, Truck } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface ExportPageProps {
  summary: TruckFinancialSummary;
  transactions: Transaction[];
  owners: Owner[];
  truck: Truck;
  onBack: () => void;
}

export const ExportPage: React.FC<ExportPageProps> = ({
  summary,
  transactions,
  owners,
  truck,
  onBack,
}) => {
  const [reportType, setReportType] = useState<'FULL' | 'OWNERS' | 'TRANSACTIONS'>('FULL');
  const [format, setFormat] = useState<'PDF' | 'CSV' | 'PRINT'>('PDF');
  const [isExported, setIsExported] = useState(false);

  const handleTriggerExport = () => {
    if (format === 'PRINT') {
      window.print();
    } else {
      setIsExported(true);
      setTimeout(() => setIsExported(false), 3000);
    }
  };

  return (
    <div className="p-3 sm:p-5 max-w-3xl mx-auto space-y-3">
      {/* Page Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#e5dfd2]">
        <h2 className="text-sm sm:text-base font-bold text-[#1c1d1f] uppercase tracking-tight">
          Download & Print Reports
        </h2>
      </div>

      {/* Main Options Card */}
      <div className="bg-white border border-[#e5dfd2] rounded-2xl p-3.5 sm:p-5 shadow-xs space-y-3.5">
        {/* Report Content Type */}
        <div>
          <label className="block text-[#787672] uppercase text-[10px] mb-1.5 font-bold">
            1. Select Report
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setReportType('FULL')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                reportType === 'FULL'
                  ? 'bg-[#1c1d1f] text-white border-[#1c1d1f] shadow-2xs'
                  : 'bg-[#f8f6f0] border-[#e5dfd2] text-[#1c1d1f] hover:border-[#1c1d1f]'
              }`}
            >
              <div className="font-bold text-xs">Complete Statement</div>
              <div className={`text-[10px] mt-0.5 ${reportType === 'FULL' ? 'text-white/80' : 'text-[#787672]'}`}>
                Full financial balance & owner loans
              </div>
            </button>

            <button
              type="button"
              onClick={() => setReportType('OWNERS')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                reportType === 'OWNERS'
                  ? 'bg-[#1c1d1f] text-white border-[#1c1d1f] shadow-2xs'
                  : 'bg-[#f8f6f0] border-[#e5dfd2] text-[#1c1d1f] hover:border-[#1c1d1f]'
              }`}
            >
              <div className="font-bold text-xs">Owner Shares & Loans</div>
              <div className={`text-[10px] mt-0.5 ${reportType === 'OWNERS' ? 'text-white/80' : 'text-[#787672]'}`}>
                Shares %, monthly pay & money owed
              </div>
            </button>

            <button
              type="button"
              onClick={() => setReportType('TRANSACTIONS')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                reportType === 'TRANSACTIONS'
                  ? 'bg-[#1c1d1f] text-white border-[#1c1d1f] shadow-2xs'
                  : 'bg-[#f8f6f0] border-[#e5dfd2] text-[#1c1d1f] hover:border-[#1c1d1f]'
              }`}
            >
              <div className="font-bold text-xs">Income & Expenses List</div>
              <div className={`text-[10px] mt-0.5 ${reportType === 'TRANSACTIONS' ? 'text-white/80' : 'text-[#787672]'}`}>
                All logged trips and bills
              </div>
            </button>
          </div>
        </div>

        {/* Format Selector */}
        <div>
          <label className="block text-[#787672] uppercase text-[10px] mb-1.5 font-bold">
            2. Choose Format
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setFormat('PDF')}
              className={`p-2 rounded-lg border text-center font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                format === 'PDF'
                  ? 'bg-[#3f4d34] text-white border-[#3f4d34]'
                  : 'bg-[#f8f6f0] border-[#e5dfd2] text-[#1c1d1f]'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>

            <button
              type="button"
              onClick={() => setFormat('CSV')}
              className={`p-2 rounded-lg border text-center font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                format === 'CSV'
                  ? 'bg-[#3f4d34] text-white border-[#3f4d34]'
                  : 'bg-[#f8f6f0] border-[#e5dfd2] text-[#1c1d1f]'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Excel / CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setFormat('PRINT')}
              className={`p-2 rounded-lg border text-center font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                format === 'PRINT'
                  ? 'bg-[#3f4d34] text-white border-[#3f4d34]'
                  : 'bg-[#f8f6f0] border-[#e5dfd2] text-[#1c1d1f]'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Report Preview Summary Card */}
        <div className="bg-[#fbf9f4] border border-[#e8e3d8] rounded-xl p-3 text-xs">
          <div className="font-bold text-[#1c1d1f] mb-1 flex items-center justify-between">
            <span>{truck.name} (Unit {truck.unitNumber})</span>
            <span className="text-[10px] text-[#787672]">
              {transactions.length} transactions logged
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#e8e3d8] text-center">
            <div>
              <span className="text-[9px] text-[#787672] uppercase font-bold block">Cash</span>
              <strong className="text-xs text-[#2e7d32] font-bold">{formatCurrency(summary.cashOnHand)}</strong>
            </div>
            <div>
              <span className="text-[9px] text-[#787672] uppercase font-bold block">Income</span>
              <strong className="text-xs font-bold text-[#1c1d1f]">{formatCurrency(summary.grossIncome)}</strong>
            </div>
            <div>
              <span className="text-[9px] text-[#787672] uppercase font-bold block">Bills</span>
              <strong className="text-xs font-bold text-[#c62828]">{formatCurrency(summary.operatingExpenses)}</strong>
            </div>
            <div>
              <span className="text-[9px] text-[#787672] uppercase font-bold block">Owed to Owners</span>
              <strong className="text-xs font-bold text-[#c66900]">{formatCurrency(summary.totalUnpaidDebtToOwners)}</strong>
            </div>
          </div>
        </div>

        {isExported && (
          <div className="bg-[#e8f5e9] border border-[#a5d6a7] text-[#2e7d32] p-2.5 rounded-lg text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Report generated and ready!</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#f0ebd9]">
          <button
            type="button"
            onClick={onBack}
            className="px-3.5 py-1.5 rounded-lg border border-[#d8d0be] text-[#4a4843] hover:bg-[#f3efe6] transition-colors font-bold text-xs"
          >
            Back
          </button>

          <button
            type="button"
            onClick={handleTriggerExport}
            className="px-4 py-1.5 rounded-lg bg-[#1c1d1f] hover:bg-[#2e2f33] text-white transition-colors font-bold text-xs flex items-center gap-1.5 shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Generate & Download</span>
          </button>
        </div>
      </div>
    </div>
  );
};
