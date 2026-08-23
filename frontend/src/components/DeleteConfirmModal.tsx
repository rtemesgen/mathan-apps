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
}

export function DeleteConfirmModal({ isOpen, title = 'Delete item?', message, onClose, onConfirm, confirmLabel = 'Delete' }: DeleteConfirmModalProps) {
  if (!isOpen) return null;
  return <AppDialog open={isOpen} title={title} onClose={onClose} footer={<><AppButton type="button" onClick={onClose}>Cancel</AppButton><AppButton type="button" variant="danger" onClick={onConfirm}><AlertTriangle className="h-4 w-4" />{confirmLabel}</AppButton></>}>
    <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#B42318]"><AlertTriangle className="h-4 w-4" /></span><p className="text-xs leading-5 text-[#787672]">{message}</p></div>
  </AppDialog>;
}
