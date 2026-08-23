import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type TruckSelectOption = { value: string; label: string };
export function TruckSelect({ value, onChange, options, placeholder = 'Select…', className = '' }: { value: string; onChange: (value: string) => void; options: TruckSelectOption[]; placeholder?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, []);
  const selected = options.find((option) => option.value === value);
  return <div ref={ref} className={`relative ${className}`}>
    <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex min-h-9 w-full items-center justify-between gap-2 rounded-xl border border-[#d8d0be] bg-[#f8f6f0] px-3 py-2 text-left text-xs font-bold text-[#1c1d1f] shadow-2xs transition hover:border-[#3f4d34] focus:outline-none focus:ring-2 focus:ring-[#3f4d34]/15">
      <span className={`min-w-0 truncate ${selected ? '' : 'text-[#8c8880]'}`}>{selected?.label ?? placeholder}</span><ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[#787672] transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div role="listbox" className="absolute left-0 right-0 top-[calc(100%+0.3rem)] z-[70] max-h-56 overflow-y-auto rounded-xl border border-[#e5dfd2] bg-white p-1 shadow-xl">
      {options.length ? options.map((option) => <button key={option.value} type="button" role="option" aria-selected={option.value === value} onClick={() => { onChange(option.value); setOpen(false); }} className={`block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold ${option.value === value ? 'bg-[#3f4d34] text-white' : 'text-[#4a4843] hover:bg-[#f3efe6]'}`}>{option.label}</button>) : <p className="px-3 py-2 text-xs text-[#8c8880]">No options</p>}
    </div>}
  </div>;
}
