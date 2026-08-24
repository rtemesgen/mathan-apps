import React, { useState } from 'react';
import { X, Truck as TruckIcon, Plus, Check } from 'lucide-react';
import { Truck } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { useSubmitGuard } from '../../../../hooks/useSubmitGuard';

interface AddTruckModalProps {
  isOpen: boolean;
  onClose: () => void;
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
}

export const AddTruckModal: React.FC<AddTruckModalProps> = ({
  isOpen,
  onClose,
  trucks,
  currentTruckId,
  onSelectTruck,
  onAddTruck,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [makeModel, setMakeModel] = useState('');
  const [vin, setVin] = useState('');
  const [cashOnHand, setCashOnHand] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const { submitting, run } = useSubmitGuard();

  if (!isOpen) return null;

  const handleSubmitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !unitNumber.trim() || submitting) return;
    await run(() => onAddTruck({
      name,
      unitNumber,
      makeModel,
      vin,
      cashOnHand: parseFloat(cashOnHand) || 0,
      licensePlate: licensePlate || 'TRK-NEW',
    })).then(() => { setShowAddForm(false); setName(''); setUnitNumber(''); setMakeModel(''); setVin(''); setCashOnHand(''); setLicensePlate(''); });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#ffffff] border border-[#e5dfd2] rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="bg-[#f8f6f0] border-b border-[#e5dfd2] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#1c1d1f] text-white flex items-center justify-center font-bold">
              <TruckIcon className="w-4 h-4 text-[#3f4d34]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#1c1d1f] uppercase tracking-tight">
                Fleet Management & Truck Selection
              </h3>
              <p className="text-[10px] text-[#787672] font-semibold">
                Switch active truck or add new vehicle unit
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

        <div className="p-6 space-y-4 text-xs font-semibold">
          {/* List Existing Fleet Trucks */}
          {!showAddForm ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[10px] uppercase font-bold text-[#8c8880]">
                <span>Select Active Truck Unit</span>
                <span>{trucks.length} Trucks in Fleet</span>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {trucks.map((t) => {
                  const isSelected = t.id === currentTruckId;
                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        onSelectTruck(t.id);
                        onClose();
                      }}
                      className={`border rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[#1c1d1f] text-white border-[#1c1d1f] shadow-md'
                          : 'bg-[#f8f6f0] hover:bg-[#eae4d5] text-[#1c1d1f] border-[#e5dfd2]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <TruckIcon className={`w-5 h-5 ${isSelected ? 'text-[#a3683a]' : 'text-[#3f4d34]'}`} />
                        <div>
                          <div className="font-bold text-sm">{t.name}</div>
                          <div className={`text-[11px] ${isSelected ? 'text-gray-300' : 'text-[#787672]'}`}>
                            Unit #{t.unitNumber} • {t.makeModel}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className={`text-[10px] uppercase font-bold ${isSelected ? 'text-gray-300' : 'text-[#8c8880]'}`}>
                            Initial Cash
                          </div>
                          <div className={`font-serif-display font-bold ${isSelected ? 'text-white' : 'text-[#1c1d1f]'}`}>
                            {formatCurrency(t.cashOnHand)}
                          </div>
                        </div>

                        {isSelected && (
                          <div className="w-6 h-6 rounded-full bg-[#2e7d32] text-white flex items-center justify-center">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="w-full py-3 bg-[#f0ebd9] hover:bg-[#e2dac8] text-[#1c1d1f] border border-[#d8d0be] rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors mt-4"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add New Semi-Truck to Fleet</span>
              </button>
            </div>
          ) : (
            /* Add Truck Form */
            <form onSubmit={handleSubmitNew} className="space-y-3">
              <div>
                <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                  Truck Name / Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kenworth W900 - Fleet #103"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl px-3 py-2 text-xs font-bold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                    Unit Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="FL-103"
                    value={unitNumber}
                    onChange={(e) => setUnitNumber(e.target.value)}
                    className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl px-3 py-2 text-xs font-bold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                    Initial Cash ($)
                  </label>
                  <input
                    type="number"
                    value={cashOnHand}
                    onChange={(e) => setCashOnHand(e.target.value)}
                    className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl px-3 py-2 text-xs font-bold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                    Make / Model
                  </label>
                  <input
                    type="text"
                    placeholder="2025 Peterbilt 579"
                    value={makeModel}
                    onChange={(e) => setMakeModel(e.target.value)}
                    className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl px-3 py-2 text-xs font-semibold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">
                    License Plate
                  </label>
                  <input
                    type="text"
                    placeholder="TRK-8810"
                    value={licensePlate}
                    onChange={(e) => setLicensePlate(e.target.value)}
                    className="w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl px-3 py-2 text-xs font-semibold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-xs text-[#787672] hover:underline font-bold"
                >
                  ← Back to Fleet List
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-[#3f4d34] hover:bg-[#323e29] text-white font-bold"
                >
                  {submitting ? 'Saving…' : 'Save Truck'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
