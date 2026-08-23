import React, { useState } from 'react';
import { 
  DollarSign, 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Trash2,
  PieChart,
  Edit2
} from 'lucide-react';
import { OwnerFinancialSummary, Transaction } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';

interface OwnerCardProps {
  summary: OwnerFinancialSummary;
  transactions: Transaction[];
  onPayOwner: (ownerId: string) => void;
  onInjectCapital: (ownerId: string) => void;
  onEditOwner: (owner: OwnerFinancialSummary['owner']) => void;
  onDeleteOwner?: (ownerId: string) => void;
  onDeleteTransaction: (txId: string) => void;
  onEditTransaction: (transaction: Transaction) => void;
}

export const OwnerCard: React.FC<OwnerCardProps> = ({
  summary,
  transactions,
  onPayOwner,
  onInjectCapital,
  onEditOwner,
  onDeleteOwner,
  onDeleteTransaction,
  onEditTransaction,
}) => {
  const [showTransactions, setShowTransactions] = useState(false);
  const { owner, totalInjected, totalRepaid, earnedProfitShare, paidOutProfit, totalUnpaidMoneyOwed } = summary;

  // Filter transactions for this specific owner
  const ownerTx = transactions.filter((t) => t.ownerId === owner.id);

  return (
    <div className="bg-white border border-[#e5dfd2] rounded-xl p-2.5 sm:p-3 shadow-2xs hover:border-[#1c1d1f] transition-all space-y-2">
      {/* Top Header Row: Name, Equity, Since Date & Actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-[#2e7d32] shrink-0" />
          <h2 className="text-sm sm:text-base font-bold text-[#1c1d1f] truncate">
            {owner.name}
          </h2>
          <span className="bg-[#f0ebd9] text-[#4a4843] border border-[#ded6c4] text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shrink-0">
            <PieChart className="w-2 h-2 text-[#a3683a]" />
            {owner.equityPercentage}%
          </span>
          <span className="text-[10px] text-[#8c8880] font-medium hidden md:inline truncate">
            • Since {formatDate(owner.startDate)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onInjectCapital(owner.id)}
            className="bg-[#f0ebd9] hover:bg-[#e2dac8] text-[#2c2b29] font-bold px-2 py-1 rounded-md text-[11px] flex items-center gap-1 transition-colors border border-[#d8d0be] cursor-pointer"
            title="Owner gave cash loan to truck"
          >
            <Plus className="w-3 h-3" />
            <span className="hidden sm:inline">Lend</span>
          </button>

          <button
            onClick={() => onPayOwner(owner.id)}
            className="bg-[#3f4d34] hover:bg-[#323e29] text-white font-bold px-2.5 py-1 rounded-md text-[11px] shadow-2xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
          >
            <DollarSign className="w-3 h-3" />
            <span>Pay</span>
          </button>
        </div>
      </div>

      {/* Compact Metrics Row */}
      <div className="bg-[#fbf9f4] border border-[#e8e3d8] rounded-lg p-2 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
        {/* Money Owed */}
        <div className="min-w-[130px]">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#a3683a] leading-tight">
            MONEY OWED
          </div>
          <div className="text-sm sm:text-base font-bold text-[#1c1d1f] tracking-tight leading-tight">
            {formatCurrency(totalUnpaidMoneyOwed)}
          </div>
          <div className="text-[9px] text-[#787672] flex items-center gap-1 mt-0.5">
            <span>Loan: <strong className="text-[#1c1d1f]">{formatCurrency(totalInjected, false)}</strong></span>
            <span>•</span>
            <span>Repaid: <strong className="text-[#2e7d32]">{formatCurrency(totalRepaid, false)}</strong></span>
          </div>
        </div>

        {/* 3 Inline Mini Stats */}
        <div className="flex items-center gap-3 sm:gap-4 text-right sm:text-center shrink-0 ml-auto border-l border-[#e8e3d8] pl-2.5 sm:pl-3">
          <div>
            <div className="text-[8px] font-bold uppercase text-[#8c8880] leading-none">Monthly</div>
            <div className="text-xs font-bold text-[#1c1d1f] mt-0.5">{formatCurrency(owner.monthlyDrawRate, false)}</div>
          </div>
          <div>
            <div className="text-[8px] font-bold uppercase text-[#8c8880] leading-none">Profit</div>
            <div className="text-xs font-bold text-[#1c1d1f] mt-0.5">{formatCurrency(earnedProfitShare, false)}</div>
          </div>
          <div>
            <div className="text-[8px] font-bold uppercase text-[#8c8880] leading-none">Paid</div>
            <div className="text-xs font-bold text-[#2e7d32] mt-0.5">{formatCurrency(paidOutProfit, false)}</div>
          </div>
        </div>
      </div>

      {/* Bottom Action Row */}
      <div className="flex items-center justify-between text-xs pt-0.5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onEditOwner(owner)}
            className="text-[#6b46c1] hover:text-[#52339d] font-bold flex items-center gap-1 text-[11px] transition-colors cursor-pointer"
          >
            <Edit2 className="w-2.5 h-2.5" />
            <span>Edit</span>
          </button>

          {onDeleteOwner && (
            <button
              onClick={() => onDeleteOwner(owner.id)}
              className="text-[#c62828] hover:text-[#b71c1c] font-bold flex items-center gap-1 text-[11px] transition-colors cursor-pointer opacity-80 hover:opacity-100"
              title="Delete this partner"
            >
              <Trash2 className="w-2.5 h-2.5" />
              <span>Delete</span>
            </button>
          )}
        </div>

        <button
          onClick={() => setShowTransactions(!showTransactions)}
          className="bg-[#f2eee3] hover:bg-[#e7e1d2] text-[#4a4945] px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
        >
          <span>History ({ownerTx.length})</span>
          {showTransactions ? (
            <ChevronDown className="w-2.5 h-2.5" />
          ) : (
            <ChevronRight className="w-2.5 h-2.5" />
          )}
        </button>
      </div>

      {/* Expandable Owner Transactions Drawer */}
      {showTransactions && (
        <div className="mt-2.5 pt-2.5 border-t border-[#f0ebd9] bg-[#faf8f5] rounded-xl p-2.5 space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#787672] flex items-center justify-between">
            <span>Payment History</span>
            <span className="text-[#8c8880]">{ownerTx.length} records</span>
          </div>

          {ownerTx.length === 0 ? (
            <div className="text-[11px] text-[#8c8880] italic py-1">
              No payments or loans logged yet.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {ownerTx.map((tx) => {
                const isRepaymentOrProfit =
                  tx.type === 'CAPITAL_REPAYMENT' || tx.type === 'PROFIT_DISTRIBUTION';
                return (
                  <div
                    key={tx.id}
                    className="bg-white border border-[#e8e3d8] rounded-lg p-2 flex items-center justify-between text-xs shadow-2xs"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-[10px] ${
                          isRepaymentOrProfit
                            ? 'bg-[#e8f5e9] text-[#2e7d32]'
                            : 'bg-[#fff3e0] text-[#e65100]'
                        }`}
                      >
                        {isRepaymentOrProfit ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownLeft className="w-3 h-3" />
                        )}
                      </div>

                      <div className="leading-tight">
                        <div className="font-bold text-xs text-[#1c1d1f]">
                          {tx.category || tx.description}
                        </div>
                        <div className="text-[10px] text-[#787672]">
                          {formatDate(tx.date)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`font-bold text-xs ${
                          isRepaymentOrProfit ? 'text-[#2e7d32]' : 'text-[#e65100]'
                        }`}
                      >
                        {isRepaymentOrProfit ? '-' : '+'} {formatCurrency(tx.amount)}
                      </span>

                      <button
                        onClick={() => onEditTransaction(tx)}
                        className="rounded-md p-1 text-[#54623e] hover:bg-[#edf2e7]"
                        title="Edit transaction"
                      >
                        <span className="text-[9px] font-bold">Edit</span>
                      </button>
                      <button
                        onClick={() => onDeleteTransaction(tx.id)}
                        className="text-[#b71c1c] hover:text-[#d32f2f] p-1 rounded-md hover:bg-[#ffebee] transition-colors"
                        title="Delete transaction"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
