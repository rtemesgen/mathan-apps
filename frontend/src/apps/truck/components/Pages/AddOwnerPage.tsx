import React, { useState, useEffect } from 'react';
import { Save, Truck as TruckIcon } from 'lucide-react';
import { Owner, Truck } from '../../types';
import { TruckSelect } from '../TruckSelect';
import { useAsyncAction } from '../../../../hooks/useAsyncAction';
import { OwnerFormFields } from '../OwnerFormFields';

interface AddOwnerPageProps {
  editingOwner?: Owner | null;
  currentTruckId: string;
  trucks: Truck[];
  onSubmitOwner: (ownerData: {
    id?: string;
    truckId: string;
    name: string;
    startDate: string;
    equityPercentage: number;
    monthlyDrawRate: number;
  }) => Promise<void>;
  onBack: () => void;
}

export const AddOwnerPage: React.FC<AddOwnerPageProps> = ({
  editingOwner,
  currentTruckId,
  trucks,
  onSubmitOwner,
  onBack,
}) => {
  const [name, setName] = useState('');
  const [assignedTruckId, setAssignedTruckId] = useState(editingOwner?.truckId || currentTruckId);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [equityPercentage, setEquityPercentage] = useState('');
  const [monthlyDrawRate, setMonthlyDrawRate] = useState('');
  const { submitting, runAction } = useAsyncAction();

  useEffect(() => {
    if (editingOwner) {
      setName(editingOwner.name);
      setAssignedTruckId(editingOwner.truckId || currentTruckId);
      setStartDate(editingOwner.startDate);
      setEquityPercentage(editingOwner.equityPercentage.toString());
      setMonthlyDrawRate(editingOwner.monthlyDrawRate.toString());
    } else {
      setName('');
      setAssignedTruckId(currentTruckId);
      setStartDate(new Date().toISOString().split('T')[0]);
      setEquityPercentage('');
      setMonthlyDrawRate('');
    }
  }, [editingOwner, currentTruckId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    await runAction({ operation: () => onSubmitOwner({
      id: editingOwner ? editingOwner.id : undefined,
      truckId: assignedTruckId || currentTruckId,
      name,
      startDate,
      equityPercentage: parseFloat(equityPercentage) || 0,
      monthlyDrawRate: parseFloat(monthlyDrawRate) || 0,
      }), successMessage: editingOwner ? 'Truck owner updated successfully.' : 'Truck owner saved successfully.', errorMessage: 'Could not save the Truck owner. Your entries were kept.' }).then(onBack);
  };

  return (
    <div className="p-3 sm:p-5 max-w-2xl mx-auto space-y-3">
      {/* Page Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#e5dfd2]">
        <h2 className="text-sm sm:text-base font-bold text-[#1c1d1f] uppercase tracking-tight">
          {editingOwner ? 'Edit Partner Details' : 'Add New Partner'}
        </h2>
      </div>

      {/* Main Form Card */}
      <div className="bg-white border border-[#e5dfd2] rounded-2xl p-3.5 sm:p-5 shadow-xs">
        <form onSubmit={handleSubmit} className="space-y-3 text-xs font-semibold">
          {/* Truck Assignment Field */}
          <div>
            <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
              Assigned Fleet Truck *
            </label>
            <TruckSelect value={assignedTruckId} onChange={setAssignedTruckId} options={trucks.map((t) => ({ value: t.id, label: `${t.name} (Unit ${t.unitNumber})` }))} />
            <p className="text-[10px] text-[#8c8880] mt-0.5">
              This partner's equity, loans, and payouts will be strictly tied to this truck only.
            </p>
          </div>

          <OwnerFormFields name={name} setName={setName} startDate={startDate} setStartDate={setStartDate} equityPercentage={equityPercentage} setEquityPercentage={setEquityPercentage} monthlyDrawRate={monthlyDrawRate} setMonthlyDrawRate={setMonthlyDrawRate} compact />

          {/* Form Submit Actions */}
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
              <Save className="w-3.5 h-3.5" />
              <span>{submitting ? 'Saving…' : editingOwner ? 'Update Partner' : 'Save Partner'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
