import React, { useState, useEffect } from 'react';
import { 
  Receipt, 
  CreditCard, 
  TrendingUp, 
  Save, 
  DollarSign
} from 'lucide-react';
import { Owner, TransactionType, Truck, TruckFinancialSummary } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { CategoryAutocomplete } from '../CategoryAutocomplete';
import { TruckSelect } from '../TruckSelect';
import { AppDatePicker } from '../../../../components/AppDatePicker';

interface ExpensesPageProps {
  summary: TruckFinancialSummary;
  owners: Owner[];
  trucks: Truck[];
  currentTruckId: string;
  defaultTab?: 'expense' | 'pay-owner' | 'distribute-profit';
  selectedOwnerId?: string;
  onSubmitExpense: (txData: {
    truckId: string;
    date: string;
    type: TransactionType;
    category: string;
    amount: number;
    ownerId?: string;
    description: string;
    referenceNo?: string;
  }) => Promise<void>;
  onSubmitPayOwner: (ownerId: string, amount: number, memo: string) => Promise<void>;
  onExecuteProfitDistribution: (allocations: { ownerId: string; amount: number }[]) => Promise<void>;
  onBack: () => void;
}

export const ExpensesPage: React.FC<ExpensesPageProps> = ({
  summary,
  owners,
  trucks,
  currentTruckId,
  defaultTab = 'expense',
  selectedOwnerId,
  onSubmitExpense,
  onSubmitPayOwner,
  onExecuteProfitDistribution,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<'expense' | 'pay-owner' | 'distribute-profit'>(defaultTab);

  // Tab 1: Expense State
  const truckId = currentTruckId || (trucks[0]?.id ?? '');
  const [expenseCategory, setExpenseCategory] = useState('');
  const [categoryError, setCategoryError] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseVendor, setExpenseVendor] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseRef, setExpenseRef] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);

  // Tab 2: Pay Owner State
  const [payOwnerId, setPayOwnerId] = useState<string>(
    selectedOwnerId || (summary.ownerSummaries[0]?.owner.id ?? '')
  );
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMemo, setPayMemo] = useState<string>('Loan Repayment');

  // Tab 3: Profit Split State
  const availableCash = summary.cashOnHand;
  const [dividendPool, setDividendPool] = useState<string>(
    availableCash > 0 ? (availableCash * 0.5).toFixed(0) : '0'
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab]);

  useEffect(() => {
    if (selectedOwnerId) {
      setPayOwnerId(selectedOwnerId);
    }
  }, [selectedOwnerId]);

  const currentPaySummary = summary.ownerSummaries.find((s) => s.owner.id === payOwnerId) || summary.ownerSummaries[0];

  const handleFullPay = () => {
    if (currentPaySummary) {
      setPayAmount(currentPaySummary.totalUnpaidMoneyOwed.toString());
    }
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(expenseAmount);
    if (isNaN(num) || num <= 0 || submitting) return;

    if (!expenseCategory.trim()) {
      setCategoryError(true);
      return;
    }

    setSubmitting(true);
    try { await onSubmitExpense({
      truckId,
      date: expenseDate,
      type: 'EXPENSE',
      category: expenseCategory.trim(),
      amount: num,
      description: expenseDesc || (expenseVendor ? `${expenseVendor} - ${expenseCategory.trim()}` : expenseCategory.trim()),
      referenceNo: expenseRef || `REC-${Math.floor(1000 + Math.random() * 9000)}`,
    }); setExpenseAmount(''); setExpenseVendor(''); setExpenseDesc(''); setExpenseRef(''); }
    finally { setSubmitting(false); }
  };

  const handlePayOwnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(payAmount);
    if (isNaN(num) || num <= 0 || !currentPaySummary || submitting) return;

    setSubmitting(true);
    try { await onSubmitPayOwner(currentPaySummary.owner.id, num, payMemo); setPayAmount(''); }
    finally { setSubmitting(false); }
  };

  const handleProfitDividendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pool = parseFloat(dividendPool) || 0;
    if (pool <= 0 || submitting) return;

    const allocations = owners.map((o) => ({
      ownerId: o.id,
      amount: Number(((pool * o.equityPercentage) / 100).toFixed(2)),
    }));

    setSubmitting(true);
    try { await onExecuteProfitDistribution(allocations); setDividendPool('0'); }
    finally { setSubmitting(false); }
  };

  const poolAmount = parseFloat(dividendPool) || 0;

  return (
    <div className="p-3 sm:p-5 max-w-3xl mx-auto space-y-3">
      {/* Compact Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#e5dfd2]">
        <h2 className="text-sm sm:text-base font-bold text-[#1c1d1f] uppercase tracking-tight flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#c62828]"></span>
          Expenses & Payouts
        </h2>

        <div className="flex items-center gap-1.5 text-xs bg-[#f0ebd9] px-2.5 py-1 rounded-lg border border-[#ded6c4]">
          <span className="text-[#787672] text-[11px]">Truck Cash:</span>
          <strong className="text-[#3f4d34] font-bold text-xs">{formatCurrency(summary.cashOnHand)}</strong>
        </div>
      </div>

      {/* 3 Compact Tabs */}
      <div className="grid grid-cols-3 gap-1.5 bg-[#f3efe6] p-1 rounded-xl border border-[#e5dfd2]">
        <button
          type="button"
          onClick={() => setActiveTab('expense')}
          className={`py-1.5 px-2 rounded-lg text-center transition-all font-bold text-[11px] sm:text-xs flex items-center justify-center gap-1.5 ${
            activeTab === 'expense'
              ? 'bg-[#1c1d1f] text-white shadow-2xs'
              : 'text-[#4a4843] hover:text-[#1c1d1f]'
          }`}
        >
          <Receipt className="w-3 h-3 shrink-0" />
          <span className="truncate">Truck Bills</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pay-owner')}
          className={`py-1.5 px-2 rounded-lg text-center transition-all font-bold text-[11px] sm:text-xs flex items-center justify-center gap-1.5 ${
            activeTab === 'pay-owner'
              ? 'bg-[#3f4d34] text-white shadow-2xs'
              : 'text-[#4a4843] hover:text-[#1c1d1f]'
          }`}
        >
          <CreditCard className="w-3 h-3 shrink-0" />
          <span className="truncate">Repay Owner</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('distribute-profit')}
          className={`py-1.5 px-2 rounded-lg text-center transition-all font-bold text-[11px] sm:text-xs flex items-center justify-center gap-1.5 ${
            activeTab === 'distribute-profit'
              ? 'bg-[#5b21b6] text-white shadow-2xs'
              : 'text-[#4a4843] hover:text-[#1c1d1f]'
          }`}
        >
          <TrendingUp className="w-3 h-3 shrink-0" />
          <span className="truncate">Split Profit</span>
        </button>
      </div>

      {/* Tab 1: Truck Bills / Operational Expenses */}
      {activeTab === 'expense' && (
        <div className="bg-white border border-[#e5dfd2] rounded-2xl p-3.5 sm:p-5 shadow-xs">
          <form onSubmit={handleExpenseSubmit} className="space-y-3 text-xs font-semibold">
            {/* Header: Expense Form Title & Date in Right Corner */}
            <div className="flex items-center justify-between pb-1 border-b border-[#f0ebd9]">
              <span className="text-[#787672] uppercase text-[10px] font-bold">
                Bill / Purchase Info
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[#787672] uppercase text-[10px] font-bold">Date:</span>
                <AppDatePicker value={expenseDate} onChange={setExpenseDate} required className="w-36" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                  Amount ($) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#c62828] font-bold text-sm">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg pl-7 pr-3 py-1.5 text-base font-bold text-[#1c1d1f] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[#787672] uppercase text-[10px] font-bold">
                    Category *
                  </label>
                  {categoryError && !expenseCategory.trim() && (
                    <span className="text-[#c62828] text-[10px] font-bold">
                      Category is required
                    </span>
                  )}
                </div>
                <CategoryAutocomplete
                  value={expenseCategory}
                  onChange={(cat) => {
                    setExpenseCategory(cat);
                    if (cat.trim()) setCategoryError(false);
                  }}
                  hasError={categoryError && !expenseCategory.trim()}
                  placeholder="Select or type category..."
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                  Paid To / Store / Mechanic
                </label>
                <input
                  type="text"
                  value={expenseVendor}
                  onChange={(e) => setExpenseVendor(e.target.value)}
                  placeholder="e.g. Love's, Pilot, Repair Shop"
                  className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#1c1d1f] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                  Receipt / Invoice #
                </label>
                <input
                  type="text"
                  value={expenseRef}
                  onChange={(e) => setExpenseRef(e.target.value)}
                  placeholder="e.g. REC-1204"
                  className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#1c1d1f] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Notes
              </label>
              <input
                type="text"
                value={expenseDesc}
                onChange={(e) => setExpenseDesc(e.target.value)}
                placeholder="e.g. Oil change and new air filter"
                className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg px-2.5 py-1.5 text-xs text-[#1c1d1f] focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#f0ebd9]">
              <button
                type="button"
                onClick={onBack}
                className="px-3.5 py-1.5 rounded-lg border border-[#d8d0be] text-[#4a4843] hover:bg-[#f3efe6] transition-colors font-bold text-xs"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 rounded-lg bg-[#c62828] hover:bg-[#b71c1c] text-white transition-colors font-bold text-xs flex items-center gap-1.5 shadow-2xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{submitting ? 'Saving…' : 'Save Expense'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: Repay Owner Loan */}
      {activeTab === 'pay-owner' && (
        <div className="bg-white border border-[#e5dfd2] rounded-2xl p-3.5 sm:p-5 shadow-xs">
          <form onSubmit={handlePayOwnerSubmit} className="space-y-3 text-xs font-semibold">
            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Select Owner to Repay *
              </label>
              <TruckSelect value={payOwnerId} onChange={(value) => { setPayOwnerId(value); setPayAmount(''); }} options={summary.ownerSummaries.map((s) => ({ value: s.owner.id, label: `${s.owner.name} — Owed: ${formatCurrency(s.totalUnpaidMoneyOwed)} (${s.owner.equityPercentage}% Share)` }))} />
            </div>

            {currentPaySummary && (
              <div className="bg-[#fbf9f4] border border-[#e8e3d8] rounded-xl p-3 flex items-center justify-between">
                <div>
                  <span className="text-[#8c8880] text-[10px] font-bold uppercase">
                    Money Owed to {currentPaySummary.owner.name}
                  </span>
                  <div className="text-xl font-bold text-[#1c1d1f]">
                    {formatCurrency(currentPaySummary.totalUnpaidMoneyOwed)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleFullPay}
                  className="text-xs text-[#3f4d34] bg-[#eef5eb] hover:bg-[#dcedd9] px-2.5 py-1 rounded-md font-bold transition-colors border border-[#c8e6c9]"
                >
                  Pay All
                </button>
              </div>
            )}

            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Repayment Amount ($) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8c8880] font-bold text-sm">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg pl-7 pr-3 py-1.5 text-base font-bold text-[#1c1d1f] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Note / Memo
              </label>
              <input
                type="text"
                value={payMemo}
                onChange={(e) => setPayMemo(e.target.value)}
                placeholder="e.g. Loan repayment check or Zelle transfer"
                className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg px-2.5 py-1.5 text-xs text-[#1c1d1f] focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#f0ebd9]">
              <button
                type="button"
                onClick={onBack}
                className="px-3.5 py-1.5 rounded-lg border border-[#d8d0be] text-[#4a4843] hover:bg-[#f3efe6] transition-colors font-bold text-xs"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 rounded-lg bg-[#3f4d34] hover:bg-[#323e29] text-white transition-colors font-bold text-xs flex items-center gap-1.5 shadow-2xs"
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>{submitting ? 'Saving…' : 'Pay Owner'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 3: Split Profit */}
      {activeTab === 'distribute-profit' && (
        <div className="bg-white border border-[#e5dfd2] rounded-2xl p-3.5 sm:p-5 shadow-xs">
          <form onSubmit={handleProfitDividendSubmit} className="space-y-3 text-xs font-semibold">
            {/* Cash Info */}
            <div className="bg-[#fbf9f4] border border-[#e8e3d8] rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase text-[#787672]">
                  Available Truck Cash
                </span>
                <div className="text-lg font-bold text-[#1c1d1f]">
                  {formatCurrency(availableCash)}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase text-[#787672]">
                  Total Owed to Owners
                </span>
                <div className="text-sm font-bold text-[#c62828]">
                  {formatCurrency(summary.totalUnpaidDebtToOwners)}
                </div>
              </div>
            </div>

            {/* Split Amount */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[#787672] uppercase text-[10px] font-bold">
                  Total Profit to Split ($) *
                </label>
                <button
                  type="button"
                  onClick={() => setDividendPool((availableCash * 0.5).toFixed(0))}
                  className="text-xs text-[#5b21b6] hover:underline font-bold"
                >
                  Use 50% ({formatCurrency(availableCash * 0.5)})
                </button>
              </div>

              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8c8880] font-bold text-sm">
                  $
                </span>
                <input
                  type="number"
                  step="100"
                  min="0"
                  max={availableCash}
                  required
                  value={dividendPool}
                  onChange={(e) => setDividendPool(e.target.value)}
                  className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg pl-7 pr-3 py-1.5 text-base font-bold text-[#1c1d1f] focus:outline-none"
                />
              </div>
            </div>

            {/* Breakdown List */}
            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Each Owner's Share (Based on %):
              </label>

              <div className="bg-[#f8f6f0] border border-[#e5dfd2] rounded-xl overflow-hidden divide-y divide-[#e5dfd2]">
                {owners.map((owner) => {
                  const calculatedShare = (poolAmount * owner.equityPercentage) / 100;
                  return (
                    <div key={owner.id} className="p-2.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-[#1c1d1f]">{owner.name}</div>
                        <div className="text-[10px] text-[#787672]">{owner.equityPercentage}% Share</div>
                      </div>
                      <div className="font-bold text-[#2e7d32]">
                        + {formatCurrency(calculatedShare)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#f0ebd9]">
              <button
                type="button"
                onClick={onBack}
                className="px-3.5 py-1.5 rounded-lg border border-[#d8d0be] text-[#4a4843] hover:bg-[#f3efe6] transition-colors font-bold text-xs"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={poolAmount <= 0 || submitting}
                className="px-4 py-1.5 rounded-lg bg-[#5b21b6] hover:bg-[#4c1d95] disabled:opacity-50 text-white transition-colors font-bold text-xs flex items-center gap-1.5 shadow-2xs"
              >
                <TrendingUp className="w-3.5 h-3.5 text-[#d8b4fe]" />
                <span>{submitting ? 'Saving…' : 'Split Profit'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
