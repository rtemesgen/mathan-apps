import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
}

export function DeleteConfirmModal({ isOpen, title = 'Delete item?', message, onClose, onConfirm, confirmLabel = 'Delete' }: DeleteConfirmModalProps) {
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
    <div className="w-full max-w-sm rounded-xl border border-[#E6E2D6] bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between"><div className="flex items-start gap-2"><span className="rounded-lg bg-red-50 p-2 text-red-600"><AlertTriangle className="h-4 w-4" /></span><div><h2 className="text-sm font-bold text-[#121212]">{title}</h2><p className="mt-1 text-xs leading-5 text-[#6B7280]">{message}</p></div></div><button type="button" onClick={onClose} aria-label="Close confirmation"><X className="h-4 w-4 text-[#6B7280]" /></button></div>
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-[#D8D3C5] px-3 py-2 text-xs font-bold text-[#4B5563] hover:bg-[#F7F5EE]">Cancel</button><button type="button" onClick={onConfirm} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700">{confirmLabel}</button></div>
    </div>
  </div>;
}
