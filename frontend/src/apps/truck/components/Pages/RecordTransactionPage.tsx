import React from 'react';
import { ArrowLeft, DollarSign, Calendar, Tag, FileText, User, Save, Truck as TruckIcon } from 'lucide-react';
import { Owner, TransactionType, Truck } from '../../types';
import { TruckSelect } from '../TruckSelect';
import { AppDatePicker } from '../../../../components/AppDatePicker';
import { useTruckTransactionForm, TruckTransactionInput } from '../useTruckTransactionForm';
import { TransactionTypeTabs } from '../TransactionTypeTabs';

interface RecordTransactionPageProps {
  owners: Owner[];
  trucks: Truck[];
  currentTruckId: string;
  defaultOwnerId?: string;
  defaultType?: TransactionType;
  onSubmit: (txData: TruckTransactionInput) => Promise<void>;
  onBack: () => void;
}

export const RecordTransactionPage: React.FC<RecordTransactionPageProps> = ({
  owners,
  trucks,
  currentTruckId,
  defaultOwnerId,
  defaultType = 'INCOME',
  onSubmit,
  onBack,
}) => {
  const form = useTruckTransactionForm({ owners, trucks, currentTruckId, defaultOwnerId, defaultType, active: true, onSubmit, onComplete: onBack });
  const { truckId, setTruckId, type, ownerId, setOwnerId, amount, setAmount, category, setCategory, description, setDescription, referenceNo, setReferenceNo, counterpartyType, setCounterpartyType, counterpartyName, setCounterpartyName, date, setDate, submitting, handleTypeChange, handleSubmit } = form;

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
              Record Cash / Ledger Entry
            </h2>
            <p className="text-xs text-[#787672] font-semibold">
              Log freight revenue, truck maintenance, owner loans or debt repayments
            </p>
          </div>
        </div>
      </div>

      {/* Main Form Card */}
      <div className="bg-white border border-[#e5dfd2] rounded-3xl p-6 md:p-8 shadow-xs">
        <form onSubmit={handleSubmit} className="space-y-6 text-xs font-semibold">
          <TransactionTypeTabs value={type} onChange={handleTypeChange} label="Select Entry Type" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Truck Selector */}
            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Truck Unit
              </label>
              <TruckSelect value={truckId} onChange={setTruckId} options={trucks.map((t) => ({ value: t.id, label: `${t.name} (${t.unitNumber})` }))} />
            </div>

            {/* Date */}
            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Transaction Date *
              </label>
              <AppDatePicker value={date} onChange={setDate} required />
            </div>
          </div>

          {/* If Owner-related, Owner Select */}
          {(type === 'CAPITAL_INJECTION' || type === 'CAPITAL_REPAYMENT' || type === 'PROFIT_DISTRIBUTION') && (
            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Associated Owner / Partner *
              </label>
              <TruckSelect value={ownerId} onChange={setOwnerId} options={owners.map((o) => ({ value: o.id, label: `${o.name} (${o.equityPercentage}% Equity)` }))} />
            </div>
          )}

          {(['RECEIVABLE', 'PAYABLE', 'RECEIVABLE_SETTLEMENT', 'PAYABLE_SETTLEMENT'] as TransactionType[]).includes(type) && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
            <label className="block text-[#787672] uppercase text-[10px] font-bold">Money is with / owed by<select value={counterpartyType} onChange={(event) => setCounterpartyType(event.target.value as typeof counterpartyType)} className="mt-1 w-full rounded-xl border border-[#d8d0be] bg-white px-3 py-2.5 text-xs font-bold text-[#1c1d1f]"><option value="CUSTOMER">Customer</option><option value="OWNER">Owner</option><option value="OTHER">Other person / place</option></select></label>
            <label className="block text-[#787672] uppercase text-[10px] font-bold">Name / location<input required value={counterpartyName} onChange={(event) => setCounterpartyName(event.target.value)} placeholder="e.g. ABC Customer or Owner John" className="mt-1 w-full rounded-xl border border-[#d8d0be] bg-white px-3 py-2.5 text-xs font-bold text-[#1c1d1f]" /></label>
            {counterpartyType === 'OWNER' && <label className="block text-[#787672] uppercase text-[10px] font-bold sm:col-span-2">Owner record<TruckSelect value={ownerId} onChange={setOwnerId} options={owners.map((o) => ({ value: o.id, label: o.name }))} /></label>}
          </div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Amount */}
            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Amount ($) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8c8880] font-bold text-sm">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl pl-8 pr-4 py-2.5 text-base font-serif-display font-bold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Category
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., Diesel Fuel, Repair, Rate Confirmation"
                className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl px-3 py-2.5 text-xs font-bold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
              />
            </div>
          </div>

          {/* Description & Reference No */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Memo / Description
              </label>
              <input
                type="text"
                placeholder="e.g., Freight load payment from CH Robinson"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl px-3 py-2.5 text-xs font-semibold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Reference / Invoice #
              </label>
              <input
                type="text"
                placeholder="e.g., INV-8821"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl px-3 py-2.5 text-xs font-semibold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
              />
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
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-[#1c1d1f] hover:bg-[#2e2f33] text-white transition-colors font-bold text-xs flex items-center gap-2 shadow-xs"
            >
              <Save className="w-4 h-4" />
              <span>{submitting ? 'Saving…' : 'Submit Ledger Entry'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
