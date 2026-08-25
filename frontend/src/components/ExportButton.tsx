import { Download } from 'lucide-react';

export function ExportButton({ onClick, label = 'Export' }: { onClick: () => void; label?: string }) {
  return <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-xl bg-[#3f4d34] px-3.5 py-2 text-xs font-extrabold uppercase tracking-wide text-white shadow-sm transition hover:bg-[#32402a] focus:outline-none focus:ring-2 focus:ring-[#3f4d34]/30"><Download className="h-3.5 w-3.5" />{label}</button>;
}
