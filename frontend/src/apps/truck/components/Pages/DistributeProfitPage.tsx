import React, { useState } from 'react';
import { ArrowLeft, TrendingUp, DollarSign, CheckCircle2 } from 'lucide-react';
import { TruckFinancialSummary, Owner } from '../../types';
import { formatCurrency } from '../../utils/formatters';

interface DistributeProfitPageProps {
  summary: TruckFinancialSummary;
  owners: Owner[];
  onExecuteDistribution: (allocations: { ownerId: string; amount: number }[]) => void;
  onBack: () => void;
}

export const DistributeProfitPage: React.FC<DistributeProfitPageProps> = ({
  summary,
  owners,
  onExecuteDistribution,
  onBack,
}) => {
  const availableCash = summary.cashOnHand;
  const [totalPool, setTotalPool] = useState<string>(
    availableCash > 0 ? (availableCash * 0.5).toFixed(0) : '0'
  );

  const poolAmount = parseFloat(totalPool) || 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (poolAmount <= 0) return;

    const allocations = owners.map((o) => ({
      ownerId: o.id,
      amount: Number(((poolAmount * o.equityPercentage) / 100).toFixed(2)),
    }));

    onExecuteDistribution(allocations);
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
              Profit Equity Share Dividend
            </h2>
            <p className="text-xs text-[#787672] font-semibold">
              Distribute net treasury profit dividends according to equity ownership %
            </p>
          </div>
        </div>
      </div>

      {/* Main Card */}
      <div className="bg-white border border-[#e5dfd2] rounded-3xl p-6 md:p-8 shadow-xs">
        <form onSubmit={handleSubmit} className="space-y-6 text-xs font-semibold">
          {/* Treasury Cash Overview */}
          <div className="bg-[#fbf9f4] border border-[#e8e3d8] rounded-2xl p-5 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#787672]">
                Total Available Treasury Cash
              </span>
              <div className="text-2xl font-serif-display font-bold text-[#1c1d1f] mt-0.5">
                {formatCurrency(availableCash)}
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#787672]">
                Unpaid Owner Debts
              </span>
              <div className="text-lg font-serif-display font-bold text-[#c62828] mt-0.5">
                {formatCurrency(summary.totalUnpaidDebtToOwners)}
              </div>
            </div>
          </div>

          {/* Distribution Dividend Pool Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[#787672] uppercase text-[10px] font-bold">
                Total Dividend Distribution Pool ($) *
              </label>
              <button
                type="button"
                onClick={() => setTotalPool(availableCash.toFixed(0))}
                className="text-xs text-[#2e7d32] hover:underline font-bold"
              >
                Use 100% Cash ({formatCurrency(availableCash)})
              </button>
            </div>

            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8c8880] font-bold text-base">
                $
              </span>
              <input
                type="number"
                step="100"
                min="0"
                max={availableCash}
                required
                value={totalPool}
                onChange={(e) => setTotalPool(e.target.value)}
                className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl pl-9 pr-4 py-3 text-xl font-serif-display font-bold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
              />
            </div>
          </div>

          {/* Equity Breakdown Table */}
          <div>
            <label className="block text-[#787672] uppercase text-[10px] mb-2 font-bold tracking-wider">
              Calculated Share Per Owner (Based on Equity %)
            </label>

            <div className="bg-[#f8f6f0] border border-[#e5dfd2] rounded-2xl overflow-hidden divide-y divide-[#e5dfd2]">
              {owners.map((owner) => {
                const calculatedShare = (poolAmount * owner.equityPercentage) / 100;
                return (
                  <div key={owner.id} className="p-4 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-[#1c1d1f]">
                        {owner.name}
                      </div>
                      <div className="text-[11px] text-[#787672] font-semibold">
                        {owner.equityPercentage}% Ownership Equity
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-serif-display font-bold text-base text-[#2e7d32]">
                        + {formatCurrency(calculatedShare)}
                      </div>
                      <div className="text-[10px] text-[#787672]">
                        Dividend Allocation
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
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
              disabled={poolAmount <= 0}
              className="px-6 py-2.5 rounded-xl bg-[#1c1d1f] hover:bg-[#2e2f33] disabled:opacity-50 text-white transition-colors font-bold text-xs flex items-center gap-2 shadow-xs"
            >
              <TrendingUp className="w-4 h-4 text-[#81c784]" />
              <span>Distribute Equity Dividend</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
