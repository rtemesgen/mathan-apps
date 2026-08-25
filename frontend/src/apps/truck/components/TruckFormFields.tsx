import React from 'react';

export type TruckDraft = {
  name: string;
  unitNumber: string;
  makeModel: string;
  vin: string;
  cashOnHand: string;
  licensePlate: string;
};

type TruckFormFieldsProps = {
  value: TruckDraft;
  onChange: (field: keyof TruckDraft, value: string) => void;
  variant?: 'modal' | 'page';
};

export function TruckFormFields({ value, onChange, variant = 'page' }: TruckFormFieldsProps) {
  const compact = variant === 'page';
  const inputClass = compact
    ? 'w-full rounded-lg border border-[#d8d0be] bg-[#f8f6f0] px-2.5 py-1.5 text-xs font-bold text-[#1c1d1f] focus:outline-none'
    : 'w-full rounded-xl border border-[#d8d0be] bg-[#f8f6f0] px-3 py-2 text-xs font-bold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none';
  const labelClass = 'mb-1 block text-[10px] font-bold uppercase text-[#787672]';
  const field = (name: keyof TruckDraft, input: React.ReactNode) => <label className={labelClass}>{name === 'name' ? 'Truck Name / Title' : name === 'unitNumber' ? 'Unit Number' : name === 'makeModel' ? 'Make / Model' : name === 'vin' ? 'VIN' : name === 'cashOnHand' ? 'Initial Starting Cash ($)' : 'License Plate'}{(name === 'name' || name === 'unitNumber') && ' *'}{input}</label>;
  const input = (name: keyof TruckDraft, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => <input {...props} value={value[name]} onChange={(event) => onChange(name, event.target.value)} className={inputClass} />;

  return <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
    {field('name', input('name', { type: 'text', required: true, placeholder: compact ? 'e.g. Big Red' : 'e.g. Kenworth W900 - Fleet #103' }))}
    {field('unitNumber', input('unitNumber', { type: 'text', required: true, placeholder: compact ? 'e.g. Unit 101' : 'FL-103' }))}
    {field('makeModel', input('makeModel', { type: 'text', placeholder: compact ? 'e.g. 2024 Kenworth T680' : '2025 Peterbilt 579' }))}
    {field('cashOnHand', input('cashOnHand', { type: 'number', min: 0, step: '0.01', placeholder: '15000' }))}
    {field('vin', input('vin', { type: 'text', placeholder: 'Vehicle identification number' }))}
    {field('licensePlate', input('licensePlate', { type: 'text', placeholder: 'TRK-8810' }))}
  </div>;
}
