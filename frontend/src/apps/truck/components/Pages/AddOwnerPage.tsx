import React, { useState, useEffect } from 'react';
import { Save, Truck as TruckIcon } from 'lucide-react';
import { Owner, Truck } from '../../types';
import { TruckSelect } from '../TruckSelect';
import { AppDatePicker } from '../../../../components/AppDatePicker';

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
  }) => void;
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
  const [equityPercentage, setEquityPercentage] = useState('20');
  const [monthlyDrawRate, setMonthlyDrawRate] = useState('5000');

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
      setEquityPercentage('20');
      setMonthlyDrawRate('5000');
    }
  }, [editingOwner, currentTruckId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSubmitOwner({
      id: editingOwner ? editingOwner.id : undefined,
      truckId: assignedTruckId || currentTruckId,
      name,
      startDate,
      equityPercentage: parseFloat(equityPercentage) || 0,
      monthlyDrawRate: parseFloat(monthlyDrawRate) || 0,
    });

    onBack();
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

          {/* Header Row: Partner Name on Left + Start Date in Right Corner */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[#787672] uppercase text-[10px] font-bold">
                Partner Name *
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-[#787672] uppercase text-[10px] font-bold">Start Date:</span>
                <AppDatePicker value={startDate} onChange={setStartDate} required className="w-36" />
              </div>
            </div>
            <input
              type="text"
              required
              placeholder="e.g., Marcus Vance"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg px-3 py-1.5 text-xs font-bold text-[#1c1d1f] focus:outline-none"
            />
          </div>

          {/* Ownership Share & Monthly Draw Rate */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Ownership Share (% of Profit) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  required
                  placeholder="20"
                  value={equityPercentage}
                  onChange={(e) => setEquityPercentage(e.target.value)}
                  className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg pl-3 pr-7 py-1.5 text-xs font-bold text-[#1c1d1f] focus:outline-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#787672] font-bold text-xs">
                  %
                </span>
              </div>
            </div>

            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Agreed Monthly Pay ($ / month) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#787672] font-bold text-xs">
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  required
                  placeholder="5000"
                  value={monthlyDrawRate}
                  onChange={(e) => setMonthlyDrawRate(e.target.value)}
                  className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg pl-7 pr-3 py-1.5 text-xs font-bold text-[#1c1d1f] focus:outline-none"
                />
              </div>
            </div>
          </div>

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
              className="px-4 py-1.5 rounded-lg bg-[#3f4d34] hover:bg-[#323e29] text-white transition-colors font-bold text-xs flex items-center gap-1.5 shadow-2xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{editingOwner ? 'Update Partner' : 'Save Partner'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
