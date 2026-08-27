import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Trash2, 
  Calendar,
  X,
} from 'lucide-react';
import { Transaction, Owner, TransactionType } from '../types';
import { formatCurrency, formatDate, transactionDetails } from '../utils/formatters';
import { AppDatePicker } from '../../../components/AppDatePicker';
import { ExportButton } from '../../../components/ExportButton';

interface LedgerHistoryViewProps {
  transactions: Transaction[];
  owners: Owner[];
  onDeleteTransaction: (txId: string) => void;
  onEditTransaction: (transaction: Transaction) => void;
  onOpenIncome?: () => void;
  onOpenExpense?: () => void;
  onExport?: (filters: { startDate?: string; endDate?: string; transactionType?: string; query?: string }) => void;
}

export const LedgerHistoryView: React.FC<LedgerHistoryViewProps> = ({
  transactions,
  owners,
  onDeleteTransaction,
  onEditTransaction,
  onExport,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  const filteredTx = useMemo(() => {
    return transactions.filter((tx) => {
      const matchesSearch =
        tx.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tx.counterpartyName && tx.counterpartyName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (tx.referenceNo && tx.referenceNo.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesType = selectedType === 'ALL' || tx.type === selectedType;
      const matchesFromDate = !fromDate || tx.date >= fromDate;
      const matchesToDate = !toDate || tx.date <= toDate;

      return matchesSearch && matchesType && matchesFromDate && matchesToDate;
    }).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [transactions, searchTerm, selectedType, fromDate, toDate]);

  // Filtered Totals
  const totalInflow = useMemo(() => {
    return filteredTx
      .filter((t) => ['INCOME', 'CAPITAL_INJECTION', 'RECEIVABLE', 'RECEIVABLE_SETTLEMENT'].includes(t.type))
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTx]);

  const totalOutflow = useMemo(() => {
    return filteredTx
      .filter((t) => ['EXPENSE', 'CAPITAL_REPAYMENT', 'PROFIT_DISTRIBUTION', 'PAYABLE', 'PAYABLE_SETTLEMENT'].includes(t.type))
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTx]);

  const netFiltered = totalInflow - totalOutflow;

  const getOwnerName = (ownerId?: string) => {
    if (!ownerId) return 'Truck';
    const owner = owners.find((o) => o.id === ownerId);
    return owner ? owner.name : 'Unknown';
  };

  const getTypeBadge = (type: TransactionType) => {
    switch (type) {
      case 'INCOME':
        return <span className="bg-[#e8f5e9] text-[#2e7d32] border border-[#c8e6c9] text-[9px] font-bold px-1.5 py-0.5 rounded">Trip Pay</span>;
      case 'EXPENSE':
        return <span className="bg-[#ffebee] text-[#c62828] border border-[#ffcdd2] text-[9px] font-bold px-1.5 py-0.5 rounded">Truck Bill</span>;
      case 'CAPITAL_INJECTION':
        return <span className="bg-[#fff3e0] text-[#e65100] border border-[#ffe0b2] text-[9px] font-bold px-1.5 py-0.5 rounded">Owner Loan</span>;
      case 'CAPITAL_REPAYMENT':
        return <span className="bg-[#e0f2f1] text-[#00695c] border border-[#b2dfdb] text-[9px] font-bold px-1.5 py-0.5 rounded">Repay Loan</span>;
      case 'PROFIT_DISTRIBUTION':
        return <span className="bg-[#f3e5f5] text-[#6a1b9a] border border-[#e1bee7] text-[9px] font-bold px-1.5 py-0.5 rounded">Split Profit</span>;
      case 'RECEIVABLE':
        return <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-bold px-1.5 py-0.5 rounded">Receivable</span>;
      case 'PAYABLE':
        return <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[9px] font-bold px-1.5 py-0.5 rounded">Payable</span>;
      case 'RECEIVABLE_SETTLEMENT':
        return <span className="bg-sky-50 text-sky-700 border border-sky-200 text-[9px] font-bold px-1.5 py-0.5 rounded">Receivable paid</span>;
      case 'PAYABLE_SETTLEMENT':
        return <span className="bg-pink-50 text-pink-700 border border-pink-200 text-[9px] font-bold px-1.5 py-0.5 rounded">Payable paid</span>;
    }
  };

  const hasDateFilter = Boolean(fromDate || toDate);

  return (
    <div className="p-3 sm:p-5 space-y-3 max-w-5xl mx-auto">
      {/* Top Header with Date Range Filter */}
      <div className="flex items-center justify-between pb-2 border-b border-[#e5dfd2] flex-wrap gap-2">
        <div>
          <h2 className="text-sm sm:text-base font-bold tracking-tight text-[#1c1d1f] uppercase">
            Activity History ({filteredTx.length}{filteredTx.length !== transactions.length ? ` / ${transactions.length}` : ''})
          </h2>
        </div>
        {onExport && <ExportButton onClick={() => onExport({ startDate: fromDate || undefined, endDate: toDate || undefined, transactionType: selectedType === 'ALL' ? undefined : selectedType, query: searchTerm || undefined })} />}

        {/* From and To Date Filter - Single Row */}
        <div className="flex flex-row items-center gap-1.5 bg-white border border-[#d8d0be] rounded-lg px-2 py-1 shadow-2xs text-xs font-bold whitespace-nowrap flex-nowrap">
          <div className="flex items-center gap-1 shrink-0">
            <Calendar className="w-3.5 h-3.5 text-[#787672]" />
            <span className="text-[#787672] text-[10px] uppercase font-bold">From:</span>
            <AppDatePicker value={fromDate} onChange={setFromDate} className="w-[130px]" />
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[#787672] text-[10px] uppercase font-bold">To:</span>
            <AppDatePicker value={toDate} onChange={setToDate} className="w-[130px]" />
          </div>

          {hasDateFilter && (
            <button
              onClick={() => {
                setFromDate('');
                setToDate('');
              }}
              className="p-1 rounded text-[#787672] hover:text-[#c62828] hover:bg-[#ffebee] transition-colors cursor-pointer shrink-0"
              title="Clear date filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Pills & Search */}
      <div className="bg-white border border-[#e5dfd2] rounded-xl p-2.5 space-y-2 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-bold scrollbar-none">
          {[
            { id: 'ALL', label: 'All' },
            { id: 'INCOME', label: 'Trip Pay' },
            { id: 'EXPENSE', label: 'Truck Bills' },
            { id: 'CAPITAL_INJECTION', label: 'Owner Loans' },
            { id: 'CAPITAL_REPAYMENT', label: 'Repayments' },
            { id: 'PROFIT_DISTRIBUTION', label: 'Split Profits' },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setSelectedType(pill.id)}
              className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                selectedType === pill.id
                  ? 'bg-[#1c1d1f] text-white'
                  : 'bg-[#f8f6f0] text-[#787672] hover:text-[#1c1d1f]'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#8c8880] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search activity..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#f8f6f0] border border-[#e5dfd2] rounded-lg pl-8 pr-3 py-1 text-xs font-semibold text-[#1c1d1f] focus:outline-none"
          />
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white border border-[#e5dfd2] rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] table-auto text-left text-xs">
            <thead className="bg-[#f8f6f0] border-b border-[#e5dfd2] text-[#787672] uppercase text-[9px] font-bold tracking-wider">
              <tr>
                <th className="w-32 px-4 py-3">Date</th>
                <th className="w-32 px-4 py-3">Type</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Details</th>
                <th className="w-36 px-4 py-3">Partner / Truck</th>
                <th className="w-32 px-4 py-3 text-right">Amount</th>
                <th className="w-28 px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0ebd9] font-medium text-[#1c1d1f]">
              {filteredTx.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#8c8880] italic">
                    No transactions found matching filter.
                  </td>
                </tr>
              ) : (
                filteredTx.map((tx) => {
                  const isPositive = ['INCOME', 'CAPITAL_INJECTION', 'RECEIVABLE', 'RECEIVABLE_SETTLEMENT'].includes(tx.type);
                  const isReceivable = tx.type === 'RECEIVABLE' || tx.type === 'RECEIVABLE_SETTLEMENT';
                  const isPayable = tx.type === 'PAYABLE' || tx.type === 'PAYABLE_SETTLEMENT';
                  return (
                    <tr key={tx.id} className="hover:bg-[#faf8f5]">
                      <td className="whitespace-nowrap px-4 py-3 text-[#787672]">
                        {formatDate(tx.date)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {getTypeBadge(tx.type)}
                      </td>
                      <td className="px-4 py-3 align-top"><div className="font-bold text-xs">{tx.category}</div></td>
                      <td className="px-4 py-3 align-top"><div className="break-words text-[11px] leading-5 text-[#787672]">{transactionDetails(tx) || '—'}</div></td>
                      <td className="whitespace-nowrap px-4 py-3 text-[#4a4843]">
                        {getOwnerName(tx.ownerId)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right font-bold ${
                          isReceivable ? 'text-blue-700' : isPayable ? 'text-rose-700' : isPositive ? 'text-[#2e7d32]' : 'text-[#c62828]'
                        }`}
                      >
                        {isReceivable ? '+' : '-'} {formatCurrency(tx.amount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => onEditTransaction(tx)}
                          className="rounded p-1 text-[#54623e] hover:bg-[#edf2e7]"
                          title="Edit entry"
                        >
                          <span className="text-[10px] font-bold">Edit</span>
                        </button>
                        <button
                          onClick={() => onDeleteTransaction(tx.id)}
                          className="text-[#c62828] hover:text-[#b71c1c] p-1 rounded hover:bg-[#ffebee] transition-colors cursor-pointer"
                          title="Delete entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredTx.length > 0 && (
              <tfoot className="bg-[#f8f5ee] border-t-2 border-[#d8d0be] text-xs font-bold">
                <tr>
                  <td colSpan={5} className="py-2.5 px-3 text-[#1c1d1f] font-black uppercase text-[10px] tracking-wider">
                    Total
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    {selectedType === 'INCOME' || selectedType === 'CAPITAL_INJECTION' ? (
                      <span className="font-black text-xs text-[#2e7d32]">
                        +{formatCurrency(totalInflow)}
                      </span>
                    ) : selectedType === 'EXPENSE' || selectedType === 'CAPITAL_REPAYMENT' || selectedType === 'PROFIT_DISTRIBUTION' ? (
                      <span className="font-black text-xs text-[#c62828]">
                        -{formatCurrency(totalOutflow)}
                      </span>
                    ) : (
                      <span className={`font-black text-xs ${netFiltered >= 0 ? 'text-[#2e7d32]' : 'text-[#c62828]'}`}>
                        {netFiltered >= 0 ? '+' : ''}{formatCurrency(netFiltered)}
                      </span>
                    )}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
