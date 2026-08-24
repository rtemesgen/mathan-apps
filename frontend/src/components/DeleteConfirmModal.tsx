import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AppButton } from './AppButton';
import { AppDialog } from './AppDialog';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  confirmLabel?: string;
  itemName?: string;
  itemDetails?: string;
}

export function DeleteConfirmModal({ isOpen, title = 'Delete item?', message, onClose, onConfirm, confirmLabel = 'Delete', itemName, itemDetails }: DeleteConfirmModalProps) {
  const [submitting, setSubmitting] = useState(false);
  if (!isOpen) return null;
  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try { await onConfirm(); } catch { /* the owner operation reports its error without closing the dialog */ } finally { setSubmitting(false); }
  };
  return <AppDialog open={isOpen} title={title} onClose={onClose} footer={<><AppButton type="button" onClick={onClose} disabled={submitting}>Cancel</AppButton><AppButton type="button" variant="danger" onClick={() => void handleConfirm()} disabled={submitting}><AlertTriangle className="h-4 w-4" />{submitting ? 'Deleting…' : confirmLabel}</AppButton></>}>
    <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#B42318]"><AlertTriangle className="h-4 w-4" /></span><div className="min-w-0 text-xs leading-5 text-[#787672]"><p>{message}</p>{(itemName || itemDetails) && <div className="mt-2 rounded-lg border border-[#e8e3d8] bg-[#fcfaf6] p-2"><p className="truncate font-bold text-[#1c1d1f]">{itemName}</p>{itemDetails && <p className="text-[11px]">{itemDetails}</p>}</div>}</div></div>
  </AppDialog>;
}
