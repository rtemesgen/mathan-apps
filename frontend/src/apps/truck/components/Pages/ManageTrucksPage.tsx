import React, { useState } from 'react';
import { Truck as TruckIcon, Plus, Check, Edit2, Trash2 } from 'lucide-react';
import { Truck } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { useSubmitGuard } from '../../../../hooks/useSubmitGuard';

interface ManageTrucksPageProps {
  trucks: Truck[];
  currentTruckId: string;
  onSelectTruck: (truckId: string) => void;
  onAddTruck: (truckData: {
    name: string;
    unitNumber: string;
    makeModel: string;
    vin: string;
    cashOnHand: number;
    licensePlate: string;
  }) => Promise<void>;
  onUpdateTruck: (truckData: Truck) => Promise<void>;
  onDeleteTruck: (truckId: string) => void;
  onBack: () => void;
}

export const ManageTrucksPage: React.FC<ManageTrucksPageProps> = ({
  trucks,
  currentTruckId,
  onSelectTruck,
  onAddTruck,
  onUpdateTruck,
  onDeleteTruck,
  onBack,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [makeModel, setMakeModel] = useState('');
  const [vin, setVin] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [cashOnHand, setCashOnHand] = useState('');
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null);
  const { submitting, run } = useSubmitGuard();

  const resetForm = () => {
    setEditingTruck(null); setShowAddForm(false); setName(''); setUnitNumber(''); setMakeModel(''); setVin(''); setLicensePlate(''); setCashOnHand('');
  };

  const startEdit = (truck: Truck) => {
    setEditingTruck(truck); setShowAddForm(true); setName(truck.name); setUnitNumber(truck.unitNumber); setMakeModel(truck.makeModel); setVin(truck.vin); setLicensePlate(truck.licensePlate); setCashOnHand(String(truck.cashOnHand));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !unitNumber.trim() || submitting) return;
    const payload = {
      name,
      unitNumber,
      makeModel,
      vin,
      licensePlate,
      cashOnHand: parseFloat(cashOnHand) || 0,
    };
    await run(async () => {
      if (editingTruck) await onUpdateTruck({ ...editingTruck, ...payload });
      else await onAddTruck(payload);
      resetForm();
    });
  };

  return (
    <div className="p-3 sm:p-5 max-w-3xl mx-auto space-y-3">
      {/* Page Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#e5dfd2]">
        <h2 className="text-sm sm:text-base font-bold text-[#1c1d1f] uppercase tracking-tight">
          Trucks ({trucks.length})
        </h2>

        <button
          onClick={() => { if (showAddForm) resetForm(); else setShowAddForm(true); }}
          className="bg-[#1c1d1f] hover:bg-[#2e2f33] text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-2xs transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{showAddForm ? 'Close' : '+ Add Truck'}</span>
        </button>
      </div>

      {/* Add New Truck Form Card */}
      {showAddForm && (
        <div className="bg-white border border-[#e5dfd2] rounded-2xl p-3.5 sm:p-5 shadow-xs">
          <h3 className="text-xs font-bold text-[#1c1d1f] uppercase tracking-wider mb-2 border-b border-[#f0ebd9] pb-1.5">
            {editingTruck ? 'Edit Truck' : 'Add New Truck'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-3 text-xs font-semibold">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                  Truck Nickname *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Big Red"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#1c1d1f] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                  Unit # *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Unit 101"
                  value={unitNumber}
                  onChange={(e) => setUnitNumber(e.target.value)}
                  className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#1c1d1f] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                  Make & Model
                </label>
                <input
                  type="text"
                  placeholder="e.g. 2024 Kenworth T680"
                  value={makeModel}
                  onChange={(e) => setMakeModel(e.target.value)}
                  className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#1c1d1f] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                  Initial Starting Cash ($)
                </label>
                <input
                  type="number"
                  placeholder="15000"
                  value={cashOnHand}
                  onChange={(e) => setCashOnHand(e.target.value)}
                  className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#1c1d1f] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#f0ebd9]">
              <button
                type="button"
                onClick={resetForm}
                className="px-3.5 py-1.5 rounded-lg border border-[#d8d0be] text-[#4a4843] hover:bg-[#f3efe6] transition-colors font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 rounded-lg bg-[#1c1d1f] hover:bg-[#2e2f33] text-white transition-colors font-bold text-xs shadow-2xs"
              >
                {submitting ? 'Saving…' : editingTruck ? 'Save Changes' : 'Save Truck'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Trucks List */}
      <div className="grid grid-cols-1 gap-2.5">
        {trucks.map((truck) => {
          const isSelected = truck.id === currentTruckId;
          return (
            <div
              key={truck.id}
              onClick={() => onSelectTruck(truck.id)}
              className={`bg-white border rounded-xl p-3 flex items-center justify-between cursor-pointer transition-all ${
                isSelected
                  ? 'border-[#1c1d1f] ring-1 ring-[#1c1d1f] shadow-xs bg-[#faf8f5]'
                  : 'border-[#e5dfd2] hover:border-[#b8b3a7]'
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold ${
                    isSelected
                      ? 'bg-[#1c1d1f] text-white'
                      : 'bg-[#f0ebd9] text-[#787672]'
                  }`}
                >
                  <TruckIcon className="w-4 h-4" />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-xs sm:text-sm text-[#1c1d1f]">{truck.name}</h4>
                    <span className="bg-[#f0ebd9] text-[#4a4843] text-[10px] font-bold px-1.5 py-0.5 rounded">
                      Unit {truck.unitNumber}
                    </span>
                    {isSelected && (
                      <span className="bg-[#e8f5e9] text-[#2e7d32] text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <Check className="w-2.5 h-2.5" />
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#787672] mt-0.5">
                    {truck.makeModel} • Cash: {formatCurrency(truck.cashOnHand)}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={(e) => { e.stopPropagation(); startEdit(truck); }} className="rounded-lg p-2 text-[#54623e] hover:bg-[#edf2e7]" title="Edit truck"><Edit2 className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={(e) => { e.stopPropagation(); onDeleteTruck(truck.id); }} className="rounded-lg p-2 text-[#b42318] hover:bg-[#fef2f2]" title="Delete truck"><Trash2 className="h-3.5 w-3.5" /></button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectTruck(truck.id);
                    onBack();
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-[#3f4d34] text-white'
                      : 'bg-[#f0ebd9] text-[#4a4843] hover:bg-[#e4dcce]'
                  }`}
                >
                  {isSelected ? 'Current' : 'Select'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
