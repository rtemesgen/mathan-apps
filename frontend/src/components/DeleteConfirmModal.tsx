import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { AppButton } from './AppButton';
import { AppDialog } from './AppDialog';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  itemName?: string;
  itemDetails?: string;
}

export function DeleteConfirmModal({ isOpen, title = 'Delete item?', message, onClose, onConfirm, confirmLabel = 'Delete', itemName, itemDetails }: DeleteConfirmModalProps) {
  if (!isOpen) return null;
  return <AppDialog open={isOpen} title={title} onClose={onClose} footer={<><AppButton type="button" onClick={onClose}>Cancel</AppButton><AppButton type="button" variant="danger" onClick={onConfirm}><AlertTriangle className="h-4 w-4" />{confirmLabel}</AppButton></>}>
    <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#B42318]"><AlertTriangle className="h-4 w-4" /></span><div className="min-w-0 text-xs leading-5 text-[#787672]"><p>{message}</p>{(itemName || itemDetails) && <div className="mt-2 rounded-lg border border-[#e8e3d8] bg-[#fcfaf6] p-2"><p className="truncate font-bold text-[#1c1d1f]">{itemName}</p>{itemDetails && <p className="text-[11px]">{itemDetails}</p>}</div>}</div></div>
  </AppDialog>;
}
