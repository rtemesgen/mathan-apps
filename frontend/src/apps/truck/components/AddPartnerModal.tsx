import React, { useState, useEffect } from 'react';
import { Save, Truck as TruckIcon, X, Trash2, Users } from 'lucide-react';
import { Owner, Truck } from '../types';
import { TruckSelect } from './TruckSelect';
import { AppDatePicker } from '../../../components/AppDatePicker';
import { useAsyncAction } from '../../../hooks/useAsyncAction';

interface AddPartnerModalProps {
  isOpen: boolean;
  editingOwner?: Owner | null;
  currentTruckId: string;
  trucks: Truck[];
  members?: Array<{ user_id: string; email: string; display_name: string }>;
  onSubmitPartner: (partnerData: {
    id?: string;
    truckId: string;
    name: string;
    startDate: string;
    equityPercentage: number;
    monthlyDrawRate: number;
    userId?: string | null;
  }) => void | Promise<void>;
  onDeletePartner?: (partnerId: string) => void;
  onClose: () => void;
}

export const AddPartnerModal: React.FC<AddPartnerModalProps> = ({
  isOpen,
  editingOwner,
  currentTruckId,
  trucks,
  members = [],
  onSubmitPartner,
  onDeletePartner,
  onClose,
}) => {
  const [name, setName] = useState('');
  const [assignedTruckId, setAssignedTruckId] = useState(editingOwner?.truckId || currentTruckId);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [equityPercentage, setEquityPercentage] = useState('');
  const [monthlyDrawRate, setMonthlyDrawRate] = useState('');
  const [linkedUserId, setLinkedUserId] = useState('');
  const { submitting, runAction } = useAsyncAction();

  useEffect(() => {
    if (editingOwner) {
      setName(editingOwner.name);
      setAssignedTruckId(editingOwner.truckId || currentTruckId);
      setStartDate(editingOwner.startDate || new Date().toISOString().split('T')[0]);
      setEquityPercentage(editingOwner.equityPercentage.toString());
      setMonthlyDrawRate(editingOwner.monthlyDrawRate.toString());
      setLinkedUserId('');
    } else {
      setName('');
      setAssignedTruckId(currentTruckId || (trucks[0]?.id ?? ''));
      setStartDate(new Date().toISOString().split('T')[0]);
      setEquityPercentage('');
      setMonthlyDrawRate('');
      setLinkedUserId('');
    }
  }, [editingOwner, currentTruckId, isOpen, trucks]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;

    await runAction({ operation: () => onSubmitPartner({
      id: editingOwner ? editingOwner.id : undefined,
      truckId: assignedTruckId || currentTruckId,
      name: name.trim(),
      startDate,
      equityPercentage: parseFloat(equityPercentage) || 0,
      monthlyDrawRate: parseFloat(monthlyDrawRate) || 0,
      userId: linkedUserId || null,
    }), errorMessage: 'Could not save the Truck owner. Your entries were kept.' });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Dimmed backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
      />

      {/* Modal Dialog Card */}
      <div className="relative bg-white border border-[#e5dfd2] rounded-2xl shadow-2xl max-w-lg w-full p-4 sm:p-5 z-10 animate-in zoom-in-95 duration-150 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#e5dfd2]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#3f4d34] text-white flex items-center justify-center shadow-xs">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#1c1d1f] uppercase tracking-tight">
                {editingOwner ? 'Edit Partner Details' : 'Add New Partner'}
              </h2>
              <p className="text-[10px] text-[#787672]">
                Configure equity share and monthly draw for this unit
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#787672] hover:text-[#1c1d1f] hover:bg-[#f0ebd9] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="space-y-3 text-xs font-semibold">
          {/* Truck Assignment Field */}
          <div>
            <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
              Assigned Fleet Truck *
            </label>
            <TruckSelect value={assignedTruckId} onChange={setAssignedTruckId} options={trucks.map((truck) => ({ value: truck.id, label: `${truck.name} (Unit ${truck.unitNumber})` }))} placeholder="Select fleet truck" />
            <p className="text-[10px] text-[#8c8880] mt-0.5">
              This partner's equity and loans will belong strictly to this truck.
            </p>
          </div>

          {/* Partner Name + Start Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Partner Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Marcus Vance"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl px-3 py-2 text-xs font-bold text-[#1c1d1f] focus:outline-none focus:border-[#1c1d1f]"
              />
            </div>

            <div>
              <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                Start / Agreement Date *
              </label>
              <AppDatePicker value={startDate} onChange={setStartDate} required />
            </div>
          </div>

          {members.length > 0 && <div>
            <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">Link ERP User (optional)</label>
            <TruckSelect value={linkedUserId} onChange={(value) => { setLinkedUserId(value); const member = members.find((item) => item.user_id === value); if (member && !name) setName(member.display_name || member.email); }} options={members.map((member) => ({ value: member.user_id, label: member.display_name || member.email }))} placeholder="External partner" />
          </div>}

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
                  className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl pl-3 pr-7 py-2 text-xs font-bold text-[#1c1d1f] focus:outline-none focus:border-[#1c1d1f]"
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
                  className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl pl-7 pr-3 py-2 text-xs font-bold text-[#1c1d1f] focus:outline-none focus:border-[#1c1d1f]"
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-[#f0ebd9]">
            {editingOwner && onDeletePartner ? (
              <button
                type="button"
                onClick={() => {
                  onDeletePartner(editingOwner.id);
                  onClose();
                }}
                className="px-3 py-1.5 rounded-xl border border-[#ffcdd2] text-[#c62828] hover:bg-[#ffebee] transition-colors font-bold text-xs flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Partner</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-[#d8d0be] text-[#4a4843] hover:bg-[#f3efe6] transition-colors font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-[#3f4d34] hover:bg-[#323e29] text-white transition-colors font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{submitting ? 'Saving…' : editingOwner ? 'Update Partner' : 'Save Partner'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
