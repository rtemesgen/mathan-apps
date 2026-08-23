import React, { useState } from 'react';
import { ArrowLeft, DollarSign, Save } from 'lucide-react';
import { OwnerFinancialSummary, Truck } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { TruckSelect } from '../TruckSelect';

interface PayOwnerPageProps {
  ownerSummaries: OwnerFinancialSummary[];
  selectedOwnerId?: string;
  truck: Truck;
  onSubmitPay: (ownerId: string, amount: number, memo: string) => void;
  onBack: () => void;
}

export const PayOwnerPage: React.FC<PayOwnerPageProps> = ({
  ownerSummaries,
  selectedOwnerId,
  truck,
  onSubmitPay,
  onBack,
}) => {
  const [activeOwnerId, setActiveOwnerId] = useState<string>(
    selectedOwnerId || (ownerSummaries[0]?.owner.id ?? '')
  );
  const [payAmount, setPayAmount] = useState<string>('');
  const [memo, setMemo] = useState<string>('Capital Debt Repayment');

  const currentSummary = ownerSummaries.find((s) => s.owner.id === activeOwnerId) || ownerSummaries[0];

  const handleFullPay = () => {
    if (currentSummary) {
      setPayAmount(currentSummary.totalUnpaidMoneyOwed.toString());
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0 || !currentSummary) return;

    onSubmitPay(currentSummary.owner.id, amount, memo);
    onBack();
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-[#e5dfd2] pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-white border border-[#d8d0be] hover:bg-[#eae4d5] text-[#1c1d1f] transition-colors flex items-center gap-1 text-xs font-bold shadow-2xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Dashboard</span>
          </button>
          <div>
            <h2 className="text-xl font-bold text-[#1c1d1f] uppercase tracking-tight">
              Pay / Repay Owner Debt
            </h2>
            <p className="text-xs text-[#787672] font-semibold">
              Clear outstanding debt obligations owed to truck partners
            </p>
          </div>
        </div>
      </div>

      {/* Main Form Card */}
      <div className="bg-white border border-[#e5dfd2] rounded-3xl p-6 md:p-8 shadow-xs">
        <form onSubmit={handleSubmit} className="space-y-6 text-xs font-semibold">
          {/* Select Owner */}
          <div>
            <label className="block text-[#787672] uppercase text-[10px] mb-1.5 font-bold">
              Select Owner / Partner *
            </label>
            <TruckSelect value={activeOwnerId} onChange={(value) => { setActiveOwnerId(value); setPayAmount(''); }} options={ownerSummaries.map((s) => ({ value: s.owner.id, label: `${s.owner.name} — Unpaid Owed: ${formatCurrency(s.totalUnpaidMoneyOwed)}` }))} />
          </div>

          {/* Current Debt & Cash Summary Box */}
          {currentSummary && (
            <div className="bg-[#fbf9f4] border border-[#e8e3d8] rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[#8c8880] text-[10px] font-bold uppercase tracking-wider">
                  Unpaid Debt Owed To {currentSummary.owner.name}
                </span>
                <span className="font-serif-display font-bold text-2xl text-[#1c1d1f]">
                  {formatCurrency(currentSummary.totalUnpaidMoneyOwed)}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-[#787672] border-t border-[#f0ebd9] pt-2">
                <span>Truck Treasury Cash on Hand:</span>
                <strong className="text-[#3f4d34] font-bold text-sm">
                  {formatCurrency(truck.cashOnHand)}
                </strong>
              </div>
            </div>
          )}

          {/* Repayment Amount Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[#787672] uppercase text-[10px] font-bold">
                Repayment Amount ($) *
              </label>
              <button
                type="button"
                onClick={handleFullPay}
                className="text-xs text-[#6b46c1] hover:underline font-bold"
              >
                Pay Full Owed Amount
              </button>
            </div>

            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8c8880] font-bold text-base">
                $
              </span>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl pl-9 pr-4 py-3 text-xl font-serif-display font-bold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
              />
            </div>
          </div>

          {/* Memo / Reference */}
          <div>
            <label className="block text-[#787672] uppercase text-[10px] mb-1.5 font-bold">
              Memo / Note
            </label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="e.g., Debt repayment check #4401"
              className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl px-4 py-3 text-xs font-semibold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#f0ebd9]">
            <button
              type="button"
              onClick={onBack}
              className="px-5 py-2.5 rounded-xl border border-[#d8d0be] text-[#4a4843] hover:bg-[#f3efe6] hover:text-[#1c1d1f] transition-colors font-bold text-xs"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-[#3f4d34] hover:bg-[#323e29] text-white transition-colors font-bold text-xs flex items-center gap-2 shadow-xs"
            >
              <DollarSign className="w-4 h-4" />
              <span>💸 Process Owner Repayment</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
