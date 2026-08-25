import React from 'react';
import { X, DollarSign, Calendar, Tag, FileText, User, Truck as TruckIcon } from 'lucide-react';
import { Owner, Transaction, TransactionType, Truck } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { TruckSelect } from '../TruckSelect';
import { AppDatePicker } from '../../../../components/AppDatePicker';
import { useTruckTransactionForm, TruckTransactionInput } from '../useTruckTransactionForm';
import { TransactionTypeTabs } from '../TransactionTypeTabs';

interface RecordTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  owners: Owner[];
  trucks: Truck[];
  currentTruckId: string;
  defaultOwnerId?: string;
  defaultType?: TransactionType;
  editingTransaction?: Transaction | null;
  onSubmit: (txData: TruckTransactionInput) => Promise<void>;
}

export const RecordTransactionModal: React.FC<RecordTransactionModalProps> = ({
  isOpen,
  onClose,
  owners,
  trucks,
  currentTruckId,
  defaultOwnerId,
  defaultType = 'INCOME',
  editingTransaction,
  onSubmit,
}) => {
  const form = useTruckTransactionForm({ owners, trucks, currentTruckId, defaultOwnerId, defaultType, editingTransaction, active: isOpen, onSubmit, onComplete: onClose });
  const { truckId, setTruckId, type, ownerId, setOwnerId, amount, setAmount, category, setCategory, description, setDescription, referenceNo, setReferenceNo, counterpartyType, setCounterpartyType, counterpartyName, setCounterpartyName, date, setDate, submitting, handleTypeChange, handleSubmit } = form;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#ffffff] border border-[#e5dfd2] rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="bg-[#f8f6f0] border-b border-[#e5dfd2] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#1c1d1f] text-white flex items-center justify-center font-bold">
              <DollarSign className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-[#1c1d1f] uppercase tracking-tight">
              {editingTransaction ? 'Edit Cash / Ledger Entry' : 'Record Cash / Ledger Entry'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-[#8c8880] hover:text-[#1c1d1f] p-1.5 rounded-full hover:bg-[#e8e2d4] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs font-semibold">
          <TransactionTypeTabs value={type} onChange={handleTypeChange} compact />

          {/* Amount & Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Amount ($) *
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
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl pl-7 pr-3 py-2.5 text-sm font-bold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Date *
              </label>
              <AppDatePicker value={date} onChange={setDate} required />
            </div>
          </div>

          {/* Target Owner (If Injection, Repayment or Profit Dividend) */}
          {(type === 'CAPITAL_INJECTION' || type === 'CAPITAL_REPAYMENT' || type === 'PROFIT_DISTRIBUTION') && (
            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Associated Owner / Partner *
              </label>
              <TruckSelect value={ownerId} onChange={setOwnerId} options={owners.map((o) => ({ value: o.id, label: `${o.name} (${o.equityPercentage}% Share)` }))} />
            </div>
          )}

          {(['RECEIVABLE', 'PAYABLE', 'RECEIVABLE_SETTLEMENT', 'PAYABLE_SETTLEMENT'] as TransactionType[]).includes(type) && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
            <label className="block text-[#787672] uppercase text-[10px] font-bold">Money is with / owed by<select value={counterpartyType} onChange={(event) => setCounterpartyType(event.target.value as typeof counterpartyType)} className="mt-1 w-full rounded-xl border border-[#d8d0be] bg-white px-3 py-2.5 text-xs font-bold"><option value="CUSTOMER">Customer</option><option value="OWNER">Owner</option><option value="OTHER">Other person / place</option></select></label>
            <label className="block text-[#787672] uppercase text-[10px] font-bold">Name / location<input required value={counterpartyName} onChange={(event) => setCounterpartyName(event.target.value)} placeholder="e.g. ABC Customer or Owner John" className="mt-1 w-full rounded-xl border border-[#d8d0be] bg-white px-3 py-2.5 text-xs font-bold" /></label>
            {counterpartyType === 'OWNER' && <label className="block text-[#787672] uppercase text-[10px] font-bold sm:col-span-2">Owner record<TruckSelect value={ownerId} onChange={setOwnerId} options={owners.map((o) => ({ value: o.id, label: o.name }))} /></label>}
          </div>}

          {/* Category */}
          <div>
            <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
              Category
            </label>
            <input
              type="text"
              required
              placeholder="e.g., Diesel Fuel, Transmission Repair, Freight Revenue"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl px-3 py-2.5 text-xs font-semibold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
            />
          </div>

          {/* Description & Reference # */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Description / Memo
              </label>
              <input
                type="text"
                placeholder="Details of load or repair"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl px-3 py-2 text-xs font-semibold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Reference / Invoice #
              </label>
              <input
                type="text"
                placeholder="INV-1029 / Check #102"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl px-3 py-2 text-xs font-semibold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-[#e5dfd2] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-[#d8d0be] text-[#4a4843] hover:bg-[#f3efe6] transition-colors font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-[#3f4d34] hover:bg-[#323e29] text-white font-bold shadow-xs transition-transform active:scale-95"
            >
              {submitting ? 'Saving…' : 'Record Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
