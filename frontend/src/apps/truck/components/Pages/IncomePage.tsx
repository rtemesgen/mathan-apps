import React, { useState } from 'react';
import { ArrowDownLeft, Save, UserPlus } from 'lucide-react';
import { Owner, TransactionType, Truck } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { TruckSelect } from '../TruckSelect';
import { AppDatePicker } from '../../../../components/AppDatePicker';
import { useAsyncAction } from '../../../../hooks/useAsyncAction';

interface IncomePageProps {
  owners: Owner[];
  trucks: Truck[];
  currentTruckId: string;
  defaultOwnerId?: string;
  cashOnHand: number;
  onSubmit: (txData: {
    truckId: string;
    date: string;
    type: TransactionType;
    category: string;
    amount: number;
    ownerId?: string;
    description: string;
    referenceNo?: string;
  }) => Promise<void>;
  onBack: () => void;
}

export const IncomePage: React.FC<IncomePageProps> = ({
  owners,
  trucks,
  currentTruckId,
  defaultOwnerId,
  cashOnHand,
  onSubmit,
  onBack,
}) => {
  const [incomeType, setIncomeType] = useState<'TRIP' | 'OWNER_LOAN'>('TRIP');
  const truckId = currentTruckId || (trucks[0]?.id ?? '');
  const [ownerId, setOwnerId] = useState(defaultOwnerId || (owners[0]?.id ?? ''));
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Trip Pay / Hauling Cargo');
  const [customerOrCompany, setCustomerOrCompany] = useState('');
  const [description, setDescription] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const { submitting, runAction } = useAsyncAction();

  const resetForm = () => { setAmount(''); setCustomerOrCompany(''); setDescription(''); setReferenceNo(''); setDate(new Date().toISOString().split('T')[0]); };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0 || submitting) return;
    await runAction({ operation: async () => {
      if (incomeType === 'TRIP') {
        await onSubmit({
        truckId,
        date,
        type: 'INCOME',
        category: category || 'Trip Earnings',
        amount: numAmount,
        description: description || (customerOrCompany ? `${customerOrCompany} - ${category}` : category),
        referenceNo: referenceNo || `INV-${Math.floor(1000 + Math.random() * 9000)}`,
        });
      } else {
        const selectedOwner = owners.find((o) => o.id === ownerId);
        await onSubmit({
        truckId,
        date,
        type: 'CAPITAL_INJECTION',
        category: category || 'Owner Loan to Truck',
        amount: numAmount,
        ownerId,
        description: description || `Loan from ${selectedOwner?.name || 'Owner'}`,
        referenceNo: referenceNo || `LOAN-${Math.floor(1000 + Math.random() * 9000)}`,
        });
      }
      resetForm();
    }, errorMessage: 'Could not save the Truck income. Your entries were kept.' });
  };

  return (
    <div className="p-3 sm:p-5 max-w-3xl mx-auto space-y-3">
      {/* Compact Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#e5dfd2]">
        <h2 className="text-sm sm:text-base font-bold text-[#1c1d1f] uppercase tracking-tight flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#2e7d32]"></span>
          Income (Trips)
        </h2>

        <div className="flex items-center gap-1.5 text-xs bg-[#f0ebd9] px-2.5 py-1 rounded-lg border border-[#ded6c4]">
          <span className="text-[#787672] text-[11px]">Truck Cash:</span>
          <strong className="text-[#2e7d32] font-bold text-xs">{formatCurrency(cashOnHand)}</strong>
        </div>
      </div>

      {/* Main Income Form Card */}
      <div className="bg-white border border-[#e5dfd2] rounded-2xl p-3.5 sm:p-5 shadow-xs">
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs font-semibold">
          {/* Header Row: Income Type on Left + Date on Right Corner */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[#787672] uppercase text-[10px] font-bold">
                Income Type
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-[#787672] uppercase text-[10px] font-bold">Date:</span>
                <AppDatePicker value={date} onChange={setDate} required className="w-36" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-[#f3efe6] p-1.5 rounded-xl border border-[#e5dfd2]">
              <button
                type="button"
                onClick={() => {
                  setIncomeType('TRIP');
                  setCategory('Trip Pay / Hauling Cargo');
                }}
                className={`py-2 px-2.5 rounded-lg transition-all text-left flex items-center gap-2 font-bold ${
                  incomeType === 'TRIP'
                    ? 'bg-[#2e7d32] text-white shadow-2xs'
                    : 'text-[#4a4843] hover:text-[#1c1d1f]'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5 shrink-0" />
                <div className="leading-tight">
                  <div className="text-xs font-bold">Trip Earnings</div>
                  <div className={`text-[9px] ${incomeType === 'TRIP' ? 'text-white/80' : 'text-[#787672]'}`}>
                    Cargo / Trip pay
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIncomeType('OWNER_LOAN');
                  setCategory('Owner Loan to Truck');
                }}
                className={`py-2 px-2.5 rounded-lg transition-all text-left flex items-center gap-2 font-bold ${
                  incomeType === 'OWNER_LOAN'
                    ? 'bg-[#c66900] text-white shadow-2xs'
                    : 'text-[#4a4843] hover:text-[#1c1d1f]'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5 shrink-0" />
                <div className="leading-tight">
                  <div className="text-xs font-bold">Owner Loan</div>
                  <div className={`text-[9px] ${incomeType === 'OWNER_LOAN' ? 'text-white/80' : 'text-[#787672]'}`}>
                    Partner cash loan
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Partner (if loan) or Customer */}
          {incomeType === 'OWNER_LOAN' ? (
            <div>
              <label className="block text-[#c66900] uppercase text-[10px] mb-1 font-bold">
                Who gave this loan? *
              </label>
              <TruckSelect value={ownerId} onChange={setOwnerId} options={owners.map((o) => ({ value: o.id, label: `${o.name} (${o.equityPercentage}% Share)` }))} />
            </div>
          ) : (
            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Broker / Customer (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g., TQL, CH Robinson, Landstar"
                value={customerOrCompany}
                onChange={(e) => setCustomerOrCompany(e.target.value)}
                className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#1c1d1f] focus:outline-none"
              />
            </div>
          )}

          {/* Amount & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Amount ($) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#2e7d32] font-bold text-sm">
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
                  className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg pl-7 pr-3 py-1.5 text-base font-bold text-[#1c1d1f] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Category
              </label>
              <TruckSelect value={category} onChange={setCategory} options={(incomeType === 'TRIP' ? ['Trip Pay / Hauling Cargo', 'Dedicated Route Pay', 'Extra Waiting Time / Layover Pay', 'Fuel Surcharge (Extra Fuel Pay)', 'Other Trip Income'] : ['Owner Loan to Truck', 'Emergency Repair Loan', 'Insurance Down Payment Loan', 'Cash Cushion Loan']).map((label) => ({ value: label, label }))} />
            </div>
          </div>

          {/* Customer / Company & Reference # */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                {incomeType === 'TRIP' ? 'Customer / Company Paid By' : 'Notes'}
              </label>
              <input
                type="text"
                value={customerOrCompany}
                onChange={(e) => setCustomerOrCompany(e.target.value)}
                placeholder="e.g. Acme Transport, CH Robinson"
                className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#1c1d1f] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Invoice / Reference #
              </label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="e.g. INV-102"
                className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#1c1d1f] focus:outline-none"
              />
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
              Trip Details / Route Notes
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Trip from Dallas TX to Atlanta GA"
              className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg px-2.5 py-1.5 text-xs text-[#1c1d1f] focus:outline-none"
            />
          </div>

          {/* Submit Actions */}
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
              className="px-4 py-1.5 rounded-lg bg-[#2e7d32] hover:bg-[#256628] text-white transition-colors font-bold text-xs flex items-center gap-1.5 shadow-2xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{submitting ? 'Saving…' : 'Save Income'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
