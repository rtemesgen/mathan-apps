import React, { useState } from 'react';
import { X, TrendingUp, DollarSign, PieChart, CheckCircle2 } from 'lucide-react';
import { Owner, TruckFinancialSummary } from '../../types';
import { formatCurrency } from '../../utils/formatters';

interface DistributeProfitModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: TruckFinancialSummary;
  owners: Owner[];
  onExecuteDistribution: (allocations: { ownerId: string; amount: number }[]) => void;
}

export const DistributeProfitModal: React.FC<DistributeProfitModalProps> = ({
  isOpen,
  onClose,
  summary,
  owners,
  onExecuteDistribution,
}) => {
  const [distributionTotal, setDistributionTotal] = useState<string>(
    Math.max(0, summary.netProfit - summary.totalProfitDistributed).toString()
  );

  if (!isOpen) return null;

  const totalNum = parseFloat(distributionTotal) || 0;

  // Calculate each owner's share based on equity %
  const allocations = owners.map((owner) => {
    const share = (totalNum * (owner.equityPercentage / 100));
    return {
      owner,
      amount: share,
    };
  });

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (totalNum <= 0) return;

    onExecuteDistribution(
      allocations.map((a) => ({ ownerId: a.owner.id, amount: a.amount }))
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#ffffff] border border-[#e5dfd2] rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="bg-[#f8f6f0] border-b border-[#e5dfd2] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#1c1d1f] text-white flex items-center justify-center font-bold">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#1c1d1f] uppercase tracking-tight">
                Distribute Truck Profit Shares
              </h3>
              <p className="text-[10px] text-[#787672] font-semibold">
                Split Net Freight Revenue by Owner Equity Percentage
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

        <form onSubmit={handleConfirm} className="p-6 space-y-4 text-xs font-semibold">
          {/* Net Profit Summary Box */}
          <div className="bg-[#fbf9f4] border border-[#e8e3d8] rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[#8c8880] text-[10px] font-bold uppercase">
                Cumulative Truck Net Freight Profit
              </span>
              <span className="font-serif-display font-bold text-lg text-[#1c1d1f]">
                {formatCurrency(summary.netProfit)}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#787672]">
              <span>Already Distributed:</span>
              <strong className="text-[#1d7334] font-bold">
                {formatCurrency(summary.totalProfitDistributed)}
              </strong>
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#787672] border-t border-[#e8e3d8] pt-1">
              <span>Truck Cash Available:</span>
              <strong className="text-[#3f4d34] font-bold">
                {formatCurrency(summary.cashOnHand)}
              </strong>
            </div>
          </div>

          {/* Amount to Distribute */}
          <div>
            <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
              Total Net Profit Amount to Distribute ($) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8c8880] font-bold">
                $
              </span>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={distributionTotal}
                onChange={(e) => setDistributionTotal(e.target.value)}
                className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl pl-7 pr-3 py-2.5 text-base font-serif-display font-bold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
              />
            </div>
          </div>

          {/* Breakdown Preview Table */}
          <div>
            <div className="text-[10px] font-bold uppercase text-[#8c8880] mb-2 flex items-center justify-between">
              <span>Automatic Equity Share Breakdown</span>
              <span>Total 100% Equity</span>
            </div>

            <div className="space-y-2 bg-[#f8f6f0] border border-[#e5dfd2] rounded-2xl p-3 max-h-48 overflow-y-auto">
              {allocations.map(({ owner, amount }) => (
                <div
                  key={owner.id}
                  className="bg-white border border-[#e8e3d8] rounded-xl p-2.5 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <PieChart className="w-3.5 h-3.5 text-[#a3683a]" />
                    <div>
                      <div className="font-bold text-[#1c1d1f]">{owner.name}</div>
                      <div className="text-[10px] text-[#787672]">
                        {owner.equityPercentage}% Equity Share
                      </div>
                    </div>
                  </div>

                  <div className="font-serif-display font-bold text-sm text-[#1d7334]">
                    +{formatCurrency(amount)}
                  </div>
                </div>
              ))}
            </div>
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
              className="px-6 py-2.5 rounded-xl bg-[#1c1d1f] hover:bg-[#2e2f33] text-white font-bold shadow-xs transition-transform active:scale-95 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-[#2e7d32]" />
              <span>Execute Dividend Payouts</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
