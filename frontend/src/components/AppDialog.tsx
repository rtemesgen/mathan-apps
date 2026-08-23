import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function AppDialog({ open, title, children, onClose, footer, maxWidth = 'max-w-md' }: { open: boolean; title: string; children: ReactNode; onClose: () => void; footer?: ReactNode; maxWidth?: string }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#1C1D1F]/50 p-4" role="presentation" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label={title} className={`erp-card w-full ${maxWidth} p-5 shadow-2xl sm:p-6`} onClick={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-3"><h2 className="text-base font-bold text-[#1C1D1F]">{title}</h2><button type="button" aria-label="Close dialog" onClick={onClose} className="rounded-[11px] p-1.5 text-[#787672] hover:bg-[#EDF2E7]"><X className="h-4 w-4" /></button></div>
      <div className="mt-4">{children}</div>
      {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
    </section>
  </div>;
}
