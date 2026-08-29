import React from 'react';
import { X, UserPlus, PieChart, DollarSign, Calendar } from 'lucide-react';
import { Owner } from '../../types';
import { useAsyncAction } from '../../../../hooks/useAsyncAction';
import { OwnerFormFields } from '../OwnerFormFields';
import { useOwnerFormDraft } from '../useOwnerFormDraft';

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
  const { draft, setField } = useOwnerFormDraft(editingOwner, isOpen);
  const { submitting, runAction } = useAsyncAction();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim() || submitting) return;
    await runAction({ operation: () => onSubmitOwner({
      id: editingOwner ? editingOwner.id : undefined,
      name: draft.name,
      startDate: draft.startDate,
      equityPercentage: parseFloat(draft.equityPercentage) || 0,
      monthlyDrawRate: parseFloat(draft.monthlyDrawRate) || 0,
    }), successMessage: editingOwner ? 'Truck owner updated successfully.' : 'Truck owner saved successfully.', errorMessage: 'Could not save the Truck owner. Your form has been kept open.' }).then(onClose);
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
          <OwnerFormFields name={draft.name} setName={(value) => setField('name', value)} startDate={draft.startDate} setStartDate={(value) => setField('startDate', value)} equityPercentage={draft.equityPercentage} setEquityPercentage={(value) => setField('equityPercentage', value)} monthlyDrawRate={draft.monthlyDrawRate} setMonthlyDrawRate={(value) => setField('monthlyDrawRate', value)} />

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
