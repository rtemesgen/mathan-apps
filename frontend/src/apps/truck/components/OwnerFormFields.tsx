import { AppDatePicker } from '../../../components/AppDatePicker';

type OwnerFormFieldsProps = {
  name: string;
  setName: (value: string) => void;
  startDate: string;
  setStartDate: (value: string) => void;
  equityPercentage: string;
  setEquityPercentage: (value: string) => void;
  monthlyDrawRate: string;
  setMonthlyDrawRate: (value: string) => void;
  compact?: boolean;
};

export function OwnerFormFields({ name, setName, startDate, setStartDate, equityPercentage, setEquityPercentage, monthlyDrawRate, setMonthlyDrawRate, compact = false }: OwnerFormFieldsProps) {
  const inputClass = compact
    ? 'w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg px-3 py-1.5 text-xs font-bold text-[#1c1d1f] focus:outline-none'
    : 'w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl px-3 py-2.5 text-xs font-bold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none';
  const numericClass = compact
    ? 'w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg pl-3 pr-7 py-1.5 text-xs font-bold text-[#1c1d1f] focus:outline-none'
    : 'w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl pl-3 pr-7 py-2.5 text-xs font-bold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none';
  const drawClass = compact
    ? 'w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-lg pl-7 pr-3 py-1.5 text-xs font-bold text-[#1c1d1f] focus:outline-none'
    : 'w-full bg-[#f8f6f0] border border-[#d8d0be] rounded-xl pl-7 pr-3 py-2.5 text-xs font-bold text-[#1c1d1f] focus:ring-2 focus:ring-[#3f4d34] focus:outline-none';
  const fields = <div className={`grid ${compact ? 'grid-cols-1 sm:grid-cols-2 gap-2.5' : 'grid-cols-2 gap-3'}`}>
    <div>
      <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">{compact ? 'Ownership Share (% of Profit) *' : 'Equity Share (%) *'}</label>
      <div className="relative"><input type="number" min="0" max="100" step={compact ? '1' : '0.1'} required value={equityPercentage} onChange={(event) => setEquityPercentage(event.target.value)} className={numericClass} placeholder="20" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#787672] font-bold text-xs">%</span></div>
    </div>
    <div>
      <label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">{compact ? 'Agreed Monthly Pay ($ / month) *' : 'Monthly Draw / Rate ($)'}</label>
      <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#787672] font-bold text-xs">$</span><input type="number" min="0" step="100" required={compact} value={monthlyDrawRate} onChange={(event) => setMonthlyDrawRate(event.target.value)} className={drawClass} placeholder="5000" /></div>
    </div>
  </div>;

  if (compact) return <>
    <div>
      <div className="flex items-center justify-between mb-1"><label className="text-[#787672] uppercase text-[10px] font-bold">Partner Name *</label><div className="flex items-center gap-1.5"><span className="text-[#787672] uppercase text-[10px] font-bold">Start Date:</span><AppDatePicker value={startDate} onChange={setStartDate} required className="w-36" /></div></div>
      <input type="text" required placeholder="e.g., Marcus Vance" value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
    </div>
    {fields}
  </>;

  return <>
    <div><label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">Owner / Partner Name *</label><input type="text" required placeholder="e.g., Marcus Vance" value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></div>
    <div><label className="block text-[#787672] uppercase text-[10px] mb-1 font-bold">Partnership Start Date *</label><AppDatePicker value={startDate} onChange={setStartDate} required /></div>
    {fields}
  </>;
}
