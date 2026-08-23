import React, { useState } from 'react';
import { X, DollarSign, CheckCircle2, AlertCircle } from 'lucide-react';
import { OwnerFinancialSummary, Truck } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { TruckSelect } from '../TruckSelect';

interface PayOwnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  ownerSummaries: OwnerFinancialSummary[];
  selectedOwnerId?: string;
  truck: Truck;
  onSubmitPay: (ownerId: string, amount: number, memo: string) => void;
}

export const PayOwnerModal: React.FC<PayOwnerModalProps> = ({
  isOpen,
  onClose,
  ownerSummaries,
  selectedOwnerId,
  truck,
  onSubmitPay,
}) => {
  const [activeOwnerId, setActiveOwnerId] = useState<string>(
    selectedOwnerId || (ownerSummaries[0]?.owner.id ?? '')
  );
  const [payAmount, setPayAmount] = useState<string>('');
  const [memo, setMemo] = useState<string>('Capital Debt Repayment');

  if (!isOpen) return null;

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
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#ffffff] border border-[#e5dfd2] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="bg-[#f8f6f0] border-b border-[#e5dfd2] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#3f4d34] text-white flex items-center justify-center font-bold">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#1c1d1f] uppercase tracking-tight">
                Pay Owner Debt
              </h3>
              <p className="text-[10px] text-[#787672] font-semibold">
                Truck Repayment of Owner Cash Loans
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs font-semibold">
          {/* Select Owner */}
          <div>
            <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
              Select Owner / Partner *
            </label>
            <TruckSelect value={activeOwnerId} onChange={(value) => { setActiveOwnerId(value); setPayAmount(''); }} options={ownerSummaries.map((s) => ({ value: s.owner.id, label: `${s.owner.name} — Unpaid Owed: ${formatCurrency(s.totalUnpaidMoneyOwed)}` }))} />
          </div>

          {/* Current Debt & Cash Summary Box */}
          {currentSummary && (
            <div className="bg-[#fbf9f4] border border-[#e8e3d8] rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[#8c8880] text-[10px] font-bold uppercase">
                  Unpaid Debt Owed
                </span>
                <span className="font-serif-display font-bold text-lg text-[#1c1d1f]">
                  {formatCurrency(currentSummary.totalUnpaidMoneyOwed)}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#787672]">
                <span>Truck Cash on Hand:</span>
                <strong className="text-[#3f4d34] font-bold">
                  {formatCurrency(truck.cashOnHand)}
                </strong>
              </div>
            </div>
          )}

          {/* Repayment Amount Field */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[#787672] uppercase text-[10px] font-bold">
                Repayment Amount ($) *
              </label>
              <button
                type="button"
                onClick={handleFullPay}
                className="text-[10px] text-[#6b46c1] hover:underline font-bold"
              >
                Pay Full Owed Amount
              </button>
            </div>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8c8880] font-bold">
                $
              </span>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl pl-7 pr-3 py-2.5 text-base font-serif-display font-bold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
              />
            </div>
          </div>

          {/* Memo / Reference */}
          <div>
            <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
              Memo / Note
            </label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="e.g., Debt repayment check #4401"
              className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl px-3 py-2 text-xs font-semibold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-[#e5dfd2] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-[#d8d0be] text-[#4a4843] hover:bg-[#f3efe6] font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-[#3f4d34] hover:bg-[#323e29] text-white font-bold shadow-xs transition-transform active:scale-95 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm Payment</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
