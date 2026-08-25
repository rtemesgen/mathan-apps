import { Download } from 'lucide-react';

export function ExportButton({ onClick, label = 'Export', disabled = false, loading = false }: { onClick: () => void; label?: string; disabled?: boolean; loading?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled || loading} aria-busy={loading} className="inline-flex items-center gap-1.5 rounded-xl bg-[#3f4d34] px-3.5 py-2 text-xs font-extrabold uppercase tracking-wide text-white shadow-sm transition hover:bg-[#32402a] focus:outline-none focus:ring-2 focus:ring-[#3f4d34]/30 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-3.5 w-3.5" />{loading ? 'Preparing…' : label}</button>;
}
