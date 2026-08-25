import React, { useState, useEffect } from 'react';
import { X, UserPlus, PieChart, DollarSign, Calendar } from 'lucide-react';
import { Owner } from '../../types';
import { AppDatePicker } from '../../../../components/AppDatePicker';
import { useAsyncAction } from '../../../../hooks/useAsyncAction';

interface AddOwnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingOwner?: Owner | null;
  onSubmitOwner: (ownerData: {
    id?: string;
    name: string;
    startDate: string;
    equityPercentage: number;
    monthlyDrawRate: number;
  }) => Promise<void>;
}

export const AddOwnerModal: React.FC<AddOwnerModalProps> = ({
  isOpen,
  onClose,
  editingOwner,
  onSubmitOwner,
}) => {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [equityPercentage, setEquityPercentage] = useState('');
  const [monthlyDrawRate, setMonthlyDrawRate] = useState('');
  const { submitting, runAction } = useAsyncAction();

  useEffect(() => {
    if (editingOwner) {
      setName(editingOwner.name);
      setStartDate(editingOwner.startDate);
      setEquityPercentage(editingOwner.equityPercentage.toString());
      setMonthlyDrawRate(editingOwner.monthlyDrawRate.toString());
    } else {
      setName('');
      setStartDate(new Date().toISOString().split('T')[0]);
      setEquityPercentage('');
      setMonthlyDrawRate('');
    }
  }, [editingOwner, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    await runAction({ operation: () => onSubmitOwner({
      id: editingOwner ? editingOwner.id : undefined,
      name,
      startDate,
      equityPercentage: parseFloat(equityPercentage) || 0,
      monthlyDrawRate: parseFloat(monthlyDrawRate) || 0,
    }), successMessage: editingOwner ? 'Truck owner updated successfully.' : 'Truck owner saved successfully.', errorMessage: 'Could not save the Truck owner. Your entries were kept.' }).then(onClose);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#ffffff] border border-[#e5dfd2] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="bg-[#f8f6f0] border-b border-[#e5dfd2] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#1c1d1f] text-white flex items-center justify-center font-bold">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#1c1d1f] uppercase tracking-tight">
                {editingOwner ? 'Adjust Owner Equity / Rate' : 'Add New Owner / Partner'}
              </h3>
              <p className="text-[10px] text-[#787672] font-semibold">
                Set ownership equity % & monthly draw rate
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
          {/* Owner Full Name */}
          <div>
            <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
              Owner / Partner Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g., Marcus Vance"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl px-3 py-2.5 text-xs font-bold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
            />
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
              Partnership Start Date *
            </label>
            <AppDatePicker value={startDate} onChange={setStartDate} required />
          </div>

          {/* Equity Share % & Monthly Draw Rate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Equity Share (%) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  required
                  placeholder="20"
                  value={equityPercentage}
                  onChange={(e) => setEquityPercentage(e.target.value)}
                  className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl pl-3 pr-7 py-2.5 text-xs font-bold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8c8880] font-bold">
                  %
                </span>
              </div>
            </div>

            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Monthly Draw / Rate ($)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8c8880] font-bold">
                  $
                </span>
                <input
                  type="number"
                  step="100"
                  placeholder="5000"
                  value={monthlyDrawRate}
                  onChange={(e) => setMonthlyDrawRate(e.target.value)}
                  className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl pl-7 pr-3 py-2.5 text-xs font-bold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
                />
              </div>
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
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-[#3f4d34] hover:bg-[#323e29] text-white font-bold shadow-xs transition-transform active:scale-95"
            >
              {submitting ? 'Saving…' : editingOwner ? 'Update Owner' : 'Add Owner'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
