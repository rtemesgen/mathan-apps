import React from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  itemName?: string;
  itemDetails?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  title = 'Confirm Deletion',
  message = 'Are you sure you want to delete this?',
  itemName,
  itemDetails,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
        onClick={onCancel}
      />

      {/* Modal Card */}
      <div className="relative bg-white border border-[#e5dfd2] rounded-2xl shadow-2xl max-w-md w-full p-5 z-10 animate-in zoom-in-95 duration-150 space-y-4">
        {/* Top Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ffebee] text-[#c62828] flex items-center justify-center shrink-0 border border-[#ffcdd2]">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#1c1d1f] tracking-tight">
                {title}
              </h3>
              <p className="text-xs text-[#787672]">
                This action cannot be undone.
              </p>
            </div>
          </div>

          <button
            onClick={onCancel}
            className="p-1 rounded-lg text-[#787672] hover:text-[#1c1d1f] hover:bg-[#f0ebd9] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message body */}
        <div className="space-y-2">
          <p className="text-xs sm:text-sm text-[#383734] font-medium leading-relaxed">
            {message}
          </p>

          {(itemName || itemDetails) && (
            <div className="bg-[#fcfaf6] border border-[#e8e3d8] rounded-xl p-3 text-xs space-y-0.5">
              {itemName && (
                <div className="font-bold text-[#1c1d1f] truncate">
                  {itemName}
                </div>
              )}
              {itemDetails && (
                <div className="text-[11px] text-[#787672]">
                  {itemDetails}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#f0ebd9]">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-[#d8d0be] text-[#4a4843] hover:bg-[#f3efe6] transition-colors font-bold text-xs cursor-pointer"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl bg-[#c62828] hover:bg-[#b71c1c] text-white transition-colors font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-98 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
