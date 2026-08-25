import type { TransactionType } from '../types';

const options: Array<{ value: TransactionType; label: string; active: string }> = [
  { value: 'INCOME', label: 'Freight Revenue', active: 'bg-[#2e7d32] text-white shadow-xs' },
  { value: 'EXPENSE', label: 'Truck Expense', active: 'bg-[#c62828] text-white shadow-xs' },
  { value: 'CAPITAL_INJECTION', label: 'Owner Cash Loan', active: 'bg-[#e65100] text-white shadow-xs' },
  { value: 'CAPITAL_REPAYMENT', label: 'Truck Repays Loan', active: 'bg-[#3f4d34] text-white shadow-xs' },
  { value: 'PROFIT_DISTRIBUTION', label: 'Distribute Profit Dividend', active: 'bg-[#6a1b9a] text-white shadow-xs' },
];

export function TransactionTypeTabs({ value, onChange, label = 'Entry Type', compact = false }: { value: TransactionType; onChange: (value: TransactionType) => void; label?: string; compact?: boolean }) {
  return <div>
    <label className="block text-[#8c8880] uppercase tracking-wider text-[10px] mb-1.5 font-bold">{label}</label>
    <div className={`grid grid-cols-2 sm:grid-cols-3 ${compact ? 'gap-1.5 p-1.5' : 'gap-2 p-2'} rounded-2xl border border-[#e5dfd2] bg-[#f3efe6]`}>
      {options.map((option, index) => <button
        key={option.value}
        type="button"
        onClick={() => onChange(option.value)}
        className={`${compact ? 'py-2 px-2' : 'py-2.5 px-3'} rounded-xl text-center font-bold transition-all ${index === options.length - 1 ? 'col-span-2 sm:col-span-2' : ''} ${value === option.value ? option.active : 'text-[#4a4843] hover:text-[#1c1d1f]'}`}
      >{option.label}</button>)}
    </div>
  </div>;
}
