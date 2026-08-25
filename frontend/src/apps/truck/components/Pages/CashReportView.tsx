import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  Calendar, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Filter, 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Wallet,
  Clock,
  Printer
} from 'lucide-react';
import { ExportButton } from '../../../../components/ExportButton';
import { Truck, Transaction, Owner } from '../../types';
import { calculateTruckFinancials, formatCurrency, formatDate, transactionDetails } from '../../utils/formatters';
import { AppDatePicker } from '../../../../components/AppDatePicker';
import { DeleteConfirmModal } from '../../../../components/DeleteConfirmModal';

interface CashReportViewProps {
  truck: Truck;
  transactions: Transaction[];
  owners: Owner[];
  onOpenIncome: () => void;
  onOpenExpense: () => void;
  onExport: (filters?: { startDate?: string; endDate?: string; transactionType?: string; query?: string }) => void;
  onEditTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (transactionId: string) => void | Promise<void>;
}

type PeriodFilterType = 'daily' | 'weekly' | 'monthly' | 'custom' | 'all';

const isCashInflow = (type: Transaction['type']) => type === 'INCOME' || type === 'CAPITAL_INJECTION' || type === 'RECEIVABLE_SETTLEMENT';
const isCashOutflow = (type: Transaction['type']) => type === 'EXPENSE' || type === 'CAPITAL_REPAYMENT' || type === 'PROFIT_DISTRIBUTION' || type === 'PAYABLE_SETTLEMENT';

export const CashReportView: React.FC<CashReportViewProps> = ({
  truck,
  transactions,
  owners,
  onOpenIncome,
  onOpenExpense,
  onExport,
  onEditTransaction,
  onDeleteTransaction,
}) => {
  // Current local date helper
  const todayStr = useMemo(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }, []);

  const [periodType, setPeriodType] = useState<PeriodFilterType>('monthly');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  });
  const [txTypeFilter, setTxTypeFilter] = useState<'ALL' | 'INFLOW' | 'OUTFLOW' | 'CREDIT'>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);

  // Determine active date range based on period filter
  const { effectiveStart, effectiveEnd, periodLabel } = useMemo(() => {
    if (periodType === 'all') {
      return { effectiveStart: '2000-01-01', effectiveEnd: '2099-12-31', periodLabel: 'All Recorded Time' };
    }

    if (periodType === 'daily') {
      return { 
        effectiveStart: selectedDate, 
        effectiveEnd: selectedDate, 
        periodLabel: `Day of ${formatDate(selectedDate)}` 
      };
    }

    if (periodType === 'weekly') {
      // 7-day window ending on selectedDate
      const d = new Date(selectedDate);
      const start = new Date(d);
      start.setDate(d.getDate() - 6);
      const startStr = start.toISOString().split('T')[0];
      return {
        effectiveStart: startStr,
        effectiveEnd: selectedDate,
        periodLabel: `Week of ${formatDate(startStr)} - ${formatDate(selectedDate)}`
      };
    }

    if (periodType === 'monthly') {
      // Calendar month of selectedDate
      const [year, month] = selectedDate.split('-');
      const startStr = `${year}-${month}-01`;
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      const endStr = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
      const monthName = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      return {
        effectiveStart: startStr,
        effectiveEnd: endStr,
        periodLabel: `Month of ${monthName}`
      };
    }

    // Custom
    return {
      effectiveStart: startDate,
      effectiveEnd: endDate,
      periodLabel: `${formatDate(startDate)} to ${formatDate(endDate)}`
    };
  }, [periodType, selectedDate, startDate, endDate]);

  // Sort all truck transactions chronologically (oldest to newest) to calculate accurate running balances
  const chronologicalTx = useMemo(() => {
    return [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  }, [transactions]);

  const financialSnapshot = useMemo(
    () => calculateTruckFinancials(truck, owners, transactions, effectiveEnd),
    [truck, owners, transactions, effectiveEnd]
  );

  // 1. Calculate Opening Cash Balance:
  // Baseline truck initial cash + all transactions strictly BEFORE effectiveStart
  const openingBalance = useMemo(() => {
    let balance = truck.cashOnHand;
    // Calculate total delta from all transactions ever
    // Then opening = current baseline + prior transactions
    // Actually, baseline truck.cashOnHand is initial starting deposit.
    // In our model: Initial Cash + Sum(all tx before effectiveStart)
    const priorTransactions = chronologicalTx.filter(t => t.date < effectiveStart);
    let delta = 0;
    priorTransactions.forEach(t => {
      if (isCashInflow(t.type)) delta += t.amount;
      if (isCashOutflow(t.type)) delta -= t.amount;
    });
    return truck.cashOnHand + delta;
  }, [truck.cashOnHand, chronologicalTx, effectiveStart]);

  // 2. Filter transactions falling within the active period
  const periodTransactions = useMemo(() => {
    return chronologicalTx.filter(t => t.date >= effectiveStart && t.date <= effectiveEnd);
  }, [chronologicalTx, effectiveStart, effectiveEnd]);

  // 3. Compute totals for this period
  const { totalInflow, totalOutflow, incomeAmount, loanInjectionAmount, expenseAmount, debtRepaidAmount, profitDistributedAmount } = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    let inc = 0;
    let loan = 0;
    let exp = 0;
    let rep = 0;
    let div = 0;

    periodTransactions.forEach(t => {
      if (t.type === 'INCOME') {
        inflow += t.amount;
        inc += t.amount;
      } else if (t.type === 'CAPITAL_INJECTION') {
        inflow += t.amount;
        loan += t.amount;
      } else if (t.type === 'EXPENSE') {
        outflow += t.amount;
        exp += t.amount;
      } else if (t.type === 'CAPITAL_REPAYMENT') {
        outflow += t.amount;
        rep += t.amount;
      } else if (t.type === 'PROFIT_DISTRIBUTION') {
        outflow += t.amount;
        div += t.amount;
      } else if (t.type === 'RECEIVABLE_SETTLEMENT') {
        inflow += t.amount;
      } else if (t.type === 'PAYABLE_SETTLEMENT') {
        outflow += t.amount;
      }
    });

    return {
      totalInflow: inflow,
      totalOutflow: outflow,
      incomeAmount: inc,
      loanInjectionAmount: loan,
      expenseAmount: exp,
      debtRepaidAmount: rep,
      profitDistributedAmount: div,
    };
  }, [periodTransactions]);

  const netCashFlow = totalInflow - totalOutflow;
  const remainingClosingBalance = openingBalance + netCashFlow;

  // 4. Compute running balance for each transaction in the period
  const ledgerWithRunningBalance = useMemo(() => {
    let running = openingBalance;
    return periodTransactions.map(tx => {
      const flow = isCashInflow(tx.type) ? 'INFLOW' : isCashOutflow(tx.type) ? 'OUTFLOW' : 'CREDIT';
      if (flow === 'INFLOW') {
        running += tx.amount;
      } else if (flow === 'OUTFLOW') {
        running -= tx.amount;
      }
      return {
        ...tx,
        flow,
        balanceAfter: running,
      };
    });
  }, [periodTransactions, openingBalance]);

  // 5. Apply UI search and Inflow/Outflow filters to the ledger list
  const filteredLedger = useMemo(() => {
    return ledgerWithRunningBalance.filter(tx => {
      if (txTypeFilter !== 'ALL' && tx.flow !== txTypeFilter) return false;

      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const catMatch = tx.category.toLowerCase().includes(query);
        const descMatch = tx.description.toLowerCase().includes(query);
        const refMatch = (tx.referenceNo || '').toLowerCase().includes(query);
        return catMatch || descMatch || refMatch;
      }

      return true;
    }).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)); // Display most recent first in table
  }, [ledgerWithRunningBalance, txTypeFilter, searchTerm]);

  // Filtered Totals
  const totalFilteredInflow = useMemo(() => {
    return filteredLedger
      .filter(tx => tx.flow === 'INFLOW')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredLedger]);

  const totalFilteredOutflow = useMemo(() => {
    return filteredLedger
      .filter(tx => tx.flow === 'OUTFLOW')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredLedger]);

  const totalFilteredReceivable = useMemo(() => filteredLedger.filter((tx) => tx.type === 'RECEIVABLE').reduce((sum, tx) => sum + tx.amount, 0), [filteredLedger]);
  const totalFilteredPayable = useMemo(() => filteredLedger.filter((tx) => tx.type === 'PAYABLE').reduce((sum, tx) => sum + tx.amount, 0), [filteredLedger]);

  const netFilteredCash = totalFilteredInflow - totalFilteredOutflow;

  return (
    <div className="max-w-5xl mx-auto space-y-3 p-3 sm:p-5">
      {/* Header Banner */}
      <div className="flex items-center justify-between pb-2 border-b border-[#e5dfd2] flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#3f4d34] text-white flex items-center justify-center shadow-2xs">
            <DollarSign className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-[#1c1d1f] uppercase tracking-tight">
              Cash Report • {truck.name}
            </h1>
            <p className="text-[10px] text-[#787672]">
              Unit {truck.unitNumber} • Opening, Inflows, Outflows & Remaining Cash
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => window.print()}
            className="bg-white hover:bg-[#f3efe6] border border-[#d8d0be] text-[#383734] text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
          >
            <Printer className="w-3 h-3" />
            <span>Print</span>
          </button>
          <ExportButton
            onClick={() => onExport({ startDate: effectiveStart, endDate: effectiveEnd, transactionType: txTypeFilter === 'ALL' ? undefined : txTypeFilter, query: searchTerm || undefined })}
          />
        </div>
      </div>

      {/* Timeframe Filter Bar */}
      <div className="bg-white border border-[#e5dfd2] rounded-xl p-2.5 shadow-2xs space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Preset Buttons */}
          <div className="flex items-center gap-1 bg-[#f8f6f0] p-0.5 rounded-lg border border-[#e5dfd2] text-[11px] font-bold">
            <button
              onClick={() => setPeriodType('daily')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                periodType === 'daily'
                  ? 'bg-white text-[#1c1d1f] shadow-2xs'
                  : 'text-[#787672] hover:text-[#1c1d1f]'
              }`}
            >
              Daily
            </button>
            <button
              onClick={() => setPeriodType('weekly')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                periodType === 'weekly'
                  ? 'bg-white text-[#1c1d1f] shadow-2xs'
                  : 'text-[#787672] hover:text-[#1c1d1f]'
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => setPeriodType('monthly')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                periodType === 'monthly'
                  ? 'bg-white text-[#1c1d1f] shadow-2xs'
                  : 'text-[#787672] hover:text-[#1c1d1f]'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setPeriodType('custom')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                periodType === 'custom'
                  ? 'bg-white text-[#1c1d1f] shadow-2xs'
                  : 'text-[#787672] hover:text-[#1c1d1f]'
              }`}
            >
              Custom Range
            </button>
            <button
              onClick={() => setPeriodType('all')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                periodType === 'all'
                  ? 'bg-white text-[#1c1d1f] shadow-2xs'
                  : 'text-[#787672] hover:text-[#1c1d1f]'
              }`}
            >
              All Time
            </button>
          </div>

          {/* Current Period Label */}
          <div className="text-[11px] text-[#787672] font-semibold flex items-center gap-1">
            <Calendar className="w-3 h-3 text-[#a3683a]" />
            <span className="font-bold text-[#1c1d1f]">{periodLabel}</span>
          </div>
        </div>

        {/* Dynamic Date Inputs based on Period Type */}
        <div className="flex items-center gap-2 pt-1 border-t border-[#f0ebd9] flex-wrap text-xs">
          {periodType === 'daily' && (
            <div className="flex items-center gap-1.5">
              <span className="text-[#787672] text-[10px] uppercase font-bold">Select Date:</span>
              <AppDatePicker value={selectedDate} onChange={setSelectedDate} className="w-32" />
            </div>
          )}

          {periodType === 'weekly' && (
            <div className="flex items-center gap-1.5">
              <span className="text-[#787672] text-[10px] uppercase font-bold">Week Ending On:</span>
              <AppDatePicker value={selectedDate} onChange={setSelectedDate} className="w-32" />
            </div>
          )}

          {periodType === 'monthly' && (
            <div className="flex items-center gap-1.5">
              <span className="text-[#787672] text-[10px] uppercase font-bold">Select Month Date:</span>
              <AppDatePicker value={selectedDate} onChange={setSelectedDate} className="w-32" />
            </div>
          )}

          {periodType === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <span className="text-[#787672] text-[10px] uppercase font-bold">From:</span>
                <AppDatePicker value={startDate} onChange={setStartDate} className="w-32" />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[#787672] text-[10px] uppercase font-bold">To:</span>
                <AppDatePicker value={endDate} onChange={setEndDate} className="w-32" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Compact cash summary */}
      <div className="grid grid-cols-3 gap-2">
        {/* 1. Opening Balance */}
        <div className="bg-white border border-[#e5dfd2] rounded-lg px-2 py-1.5 shadow-2xs">
          <div className="flex items-center justify-between text-[#787672]">
            <span className="text-[7.5px] sm:text-[8px] font-bold uppercase tracking-wider truncate">
              Opening
            </span>
            <Clock className="w-2.5 h-2.5 text-[#787672] shrink-0" />
          </div>
          <div className="text-xs sm:text-sm font-bold text-[#1c1d1f] tracking-tight mt-0.5 truncate">
            {formatCurrency(openingBalance, false)}
          </div>
          <div className="text-[7.5px] text-[#787672] truncate">
            Before {formatDate(effectiveStart)}
          </div>
        </div>

        {/* 2. Income */}
        <div className="bg-white border border-[#c8e6c9] bg-gradient-to-b from-white to-[#f1f8e9]/40 rounded-lg px-2 py-1.5 shadow-2xs">
          <div className="flex items-center justify-between text-[#2e7d32]">
            <span className="text-[7.5px] sm:text-[8px] font-bold uppercase tracking-wider truncate">
              Income
            </span>
            <ArrowDownLeft className="w-2.5 h-2.5 text-[#2e7d32] shrink-0" />
          </div>
          <div className="text-xs sm:text-sm font-bold text-[#2e7d32] tracking-tight mt-0.5 truncate">
            +{formatCurrency(totalInflow, false)}
          </div>
          <div className="text-[7.5px] text-[#558b2f] truncate">
            Trips: {formatCurrency(incomeAmount, false)}
          </div>
        </div>

        {/* 3. Payment */}
        <div className="bg-white border border-[#ffccbc] bg-gradient-to-b from-white to-[#fbe9e7]/40 rounded-lg px-2 py-1.5 shadow-2xs">
          <div className="flex items-center justify-between text-[#c62828]">
            <span className="text-[7.5px] sm:text-[8px] font-bold uppercase tracking-wider truncate">
              Payment
            </span>
            <ArrowUpRight className="w-2.5 h-2.5 text-[#c62828] shrink-0" />
          </div>
          <div className="text-xs sm:text-sm font-bold text-[#c62828] tracking-tight mt-0.5 truncate">
            -{formatCurrency(totalOutflow, false)}
          </div>
          <div className="text-[7.5px] text-[#d84315] truncate">
            Exp: {formatCurrency(expenseAmount, false)}
          </div>
        </div>

        {/* 4. Remaining */}
        <div className="bg-white border border-[#b2dfdb] bg-gradient-to-b from-white to-[#e0f2f1]/40 rounded-lg px-2 py-1.5 shadow-2xs">
          <div className="flex items-center justify-between text-[#00695c]">
            <span className="text-[7.5px] sm:text-[8px] font-bold uppercase tracking-wider truncate">
              Remaining
            </span>
            <Wallet className="w-2.5 h-2.5 text-[#00695c] shrink-0" />
          </div>
          <div className="text-xs sm:text-sm font-bold text-[#004d40] tracking-tight mt-0.5 truncate">
            {formatCurrency(remainingClosingBalance, false)}
          </div>
          <div className="text-[7.5px] text-[#00695c] truncate">
            Net: <span className={`font-bold ${netCashFlow >= 0 ? 'text-[#2e7d32]' : 'text-[#c62828]'}`}>
              {netCashFlow >= 0 ? '+' : ''}{formatCurrency(netCashFlow, false)}
            </span>
          </div>
        </div>

        {/* 5. Receivables */}
        <div className="rounded-lg border border-blue-200 bg-gradient-to-b from-white to-blue-50/50 px-2.5 py-2 shadow-2xs">
          <div className="flex items-center justify-between text-blue-700"><span className="text-[8px] font-bold uppercase tracking-wider">Receivable</span><ArrowDownLeft className="h-2.5 w-2.5" /></div>
          <div className="mt-0.5 text-sm font-bold tracking-tight text-blue-950">{formatCurrency(financialSnapshot.totalReceivable, false)}</div>
          <div className="text-[8px] text-blue-700">Customers owe truck</div>
        </div>

        {/* 6. Payables */}
        <div className="rounded-lg border border-rose-200 bg-gradient-to-b from-white to-rose-50/50 px-2.5 py-2 shadow-2xs">
          <div className="flex items-center justify-between text-rose-700"><span className="text-[8px] font-bold uppercase tracking-wider">Payable</span><ArrowUpRight className="h-2.5 w-2.5" /></div>
          <div className="mt-0.5 text-sm font-bold tracking-tight text-rose-950">{formatCurrency(financialSnapshot.totalPayable, false)}</div>
          <div className="text-[8px] text-rose-700">Truck owes others</div>
        </div>
      </div>

      {/* Cash Flow Ledger Table Header & Search */}
      <div className="bg-white border border-[#e5dfd2] rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-2xs flex-wrap">
        {/* Type Filter Chips */}
        <div className="flex items-center gap-1 bg-[#f8f6f0] p-0.5 rounded-lg border border-[#e5dfd2] text-[10px] font-bold">
          <button
            onClick={() => setTxTypeFilter('ALL')}
            className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
              txTypeFilter === 'ALL'
                ? 'bg-[#1c1d1f] text-white'
                : 'text-[#787672] hover:text-[#1c1d1f]'
            }`}
          >
            All Items ({periodTransactions.length})
          </button>
          <button
            onClick={() => setTxTypeFilter('INFLOW')}
            className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
              txTypeFilter === 'INFLOW'
                ? 'bg-[#2e7d32] text-white'
                : 'text-[#787672] hover:text-[#2e7d32]'
            }`}
          >
            Inflow Only
          </button>
          <button
            onClick={() => setTxTypeFilter('OUTFLOW')}
            className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
              txTypeFilter === 'OUTFLOW'
                ? 'bg-[#c62828] text-white'
                : 'text-[#787672] hover:text-[#c62828]'
            }`}
          >
            Outflow Only
          </button>
          <button
            onClick={() => setTxTypeFilter('CREDIT')}
            className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
              txTypeFilter === 'CREDIT'
                ? 'bg-[#1565c0] text-white'
                : 'text-[#787672] hover:text-[#1565c0]'
            }`}
          >
            Credit / Owed
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-56">
          <Search className="w-3.5 h-3.5 text-[#8c8880] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search description, category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#f8f6f0] border border-[#e5dfd2] rounded-lg pl-8 pr-3 py-1 text-xs font-semibold text-[#1c1d1f] focus:outline-none"
          />
        </div>
      </div>

      {/* Cash Statement Table */}
      <div className="bg-white border border-[#e5dfd2] rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] table-auto text-left text-xs">
            <thead className="bg-[#f8f6f0] border-b border-[#e5dfd2] text-[#787672] uppercase text-[9px] font-bold tracking-wider">
              <tr>
                <th className="py-2 px-3">Date</th>
                <th className="py-2 px-3">Category</th>
                <th className="py-2 px-3">Details</th>
                <th className="py-2 px-3">Reference #</th>
                <th className="py-2 px-3 text-right">Inflow (+)</th>
                <th className="py-2 px-3 text-right">Outflow (-)</th>
                <th className="py-2 px-3 text-right text-blue-700">Receivable</th>
                <th className="py-2 px-3 text-right text-rose-700">Payable</th>
                <th className="py-2 px-3 text-right font-bold text-[#1c1d1f]">Balance</th>
                <th className="py-2 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0ebd9] font-medium text-[#1c1d1f]">
              {filteredLedger.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-[#8c8880] text-xs">
                    No entries recorded during this period.
                  </td>
                </tr>
              ) : (
                filteredLedger.map((tx) => {
                  const isIncome = tx.type === 'INCOME';
                  const isLoan = tx.type === 'CAPITAL_INJECTION';
                  const isRepay = tx.type === 'CAPITAL_REPAYMENT';
                  const isDiv = tx.type === 'PROFIT_DISTRIBUTION';
                  const isReceivable = tx.type === 'RECEIVABLE' || tx.type === 'RECEIVABLE_SETTLEMENT';
                  const isPayable = tx.type === 'PAYABLE' || tx.type === 'PAYABLE_SETTLEMENT';

                  return (
                    <tr key={tx.id} className="hover:bg-[#faf8f5]">
                      <td className="py-2 px-3 text-[#787672] whitespace-nowrap text-[11px]">
                        {formatDate(tx.date)}
                      </td>
                      <td className="py-2 px-3 max-w-[220px]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md ${
                            isIncome ? 'bg-[#e8f5e9] text-[#2e7d32]' :
                            isLoan ? 'bg-[#fff8e1] text-[#f57f17]' :
                            isRepay ? 'bg-[#e0f2f1] text-[#00796b]' :
                            isDiv ? 'bg-[#ede7f6] text-[#512da8]' :
                            isReceivable ? 'bg-blue-50 text-blue-700' :
                            isPayable ? 'bg-rose-50 text-rose-700' :
                            'bg-[#fbe9e7] text-[#c62828]'
                          }`}>
                            {tx.category}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3 max-w-[260px] text-[11px] text-[#4a4843]"><div className="break-words">{transactionDetails(tx) || '—'}</div>
                      </td>
                      <td className="py-2 px-3 text-[#787672] text-[10px] font-mono">
                        {tx.referenceNo || '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-[#2e7d32] whitespace-nowrap">
                        {tx.flow === 'INFLOW' ? `+${formatCurrency(tx.amount)}` : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-[#c62828] whitespace-nowrap">
                        {tx.flow === 'OUTFLOW' ? `-${formatCurrency(tx.amount)}` : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-blue-700 whitespace-nowrap">{tx.type === 'RECEIVABLE' ? formatCurrency(tx.amount) : '—'}</td>
                      <td className="py-2 px-3 text-right font-bold text-rose-700 whitespace-nowrap">{tx.type === 'PAYABLE' ? formatCurrency(tx.amount) : '—'}</td>
                      <td className="py-2 px-3 text-right font-bold text-[#1c1d1f] whitespace-nowrap">
                        {formatCurrency(tx.balanceAfter)}
                      </td>
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        <button type="button" onClick={() => onEditTransaction(tx)} className="mr-1 rounded px-1 py-0.5 text-[10px] font-bold text-[#54623e] hover:bg-[#edf2e7]">Edit</button>
                        <button type="button" onClick={() => setTransactionToDelete(tx)} className="rounded px-1 py-0.5 text-[10px] font-bold text-[#b42318] hover:bg-[#fef2f2]">Delete</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredLedger.length > 0 && (
              <tfoot className="bg-[#f8f5ee] border-t-2 border-[#d8d0be] text-xs font-bold">
                <tr>
                  <td colSpan={4} className="py-2.5 px-3 text-[#1c1d1f] font-black uppercase text-[10px] tracking-wider">
                    Total
                  </td>
                  <td className="py-2.5 px-3 text-right font-black text-[#2e7d32] whitespace-nowrap text-xs">
                    {txTypeFilter !== 'OUTFLOW' && txTypeFilter !== 'CREDIT' && totalFilteredInflow > 0 ? `+${formatCurrency(totalFilteredInflow)}` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-black text-[#c62828] whitespace-nowrap text-xs">
                    {txTypeFilter !== 'INFLOW' && txTypeFilter !== 'CREDIT' && totalFilteredOutflow > 0 ? `-${formatCurrency(totalFilteredOutflow)}` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-black text-blue-700 whitespace-nowrap text-xs">
                    {txTypeFilter !== 'OUTFLOW' && txTypeFilter !== 'INFLOW' && totalFilteredReceivable > 0 ? formatCurrency(totalFilteredReceivable) : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-black text-rose-700 whitespace-nowrap text-xs">
                    {txTypeFilter !== 'OUTFLOW' && txTypeFilter !== 'INFLOW' && totalFilteredPayable > 0 ? formatCurrency(totalFilteredPayable) : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap text-[#8c8880]">—</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      <DeleteConfirmModal isOpen={!!transactionToDelete} title="Delete transaction?" message={transactionToDelete ? <>Are you sure you want to delete <strong>{transactionToDelete.description || transactionToDelete.category}</strong>?</> : ''} onClose={() => setTransactionToDelete(null)} onConfirm={async () => { if (transactionToDelete) await onDeleteTransaction(transactionToDelete.id); setTransactionToDelete(null); }} successMessage="Truck transaction deleted successfully." />
    </div>
  );
};
