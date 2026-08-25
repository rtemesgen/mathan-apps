import React, { useState, useEffect, useRef } from 'react';
import { TransactionType } from '../types';
import { X, Check, Calendar, Plus, Paperclip, FileText, Image as ImageIcon } from 'lucide-react';
import { getCurrentLocalDateTimeString } from '../utils/formatters';
import { AppSelect } from '../../../components/AppSelect';
import { useAsyncAction } from '../../../hooks/useAsyncAction';

interface TransactionModalProps {
  isOpen: boolean;
  type: TransactionType; // 'in' | 'out'
  bookName: string;
  currencySymbol?: string;
  onClose: () => void;
  onSave: (data: {
    amount: number;
    remark: string;
    category: string;
    paymentMode: 'Cash' | 'Bank Transfer' | 'UPI / Online' | 'Cheque';
    dateTime: string;
    attachmentUrl?: string;
    attachmentName?: string;
  }) => void;
}

const CATEGORY_PRESETS = {
  in: ['Sales', 'Customer Payment', 'Service Fee', 'Investment', 'Refund', 'Other Income'],
  out: ['Vendor Payment', 'Inventory Restock', 'Rent', 'Utilities', 'Salary / Wages', 'Tax & Fees', 'Other Expense'],
};

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  type,
  bookName,
  currencySymbol = '$',
  onClose,
  onSave,
}) => {
  const [amount, setAmount] = useState<string>('');
  const [remark, setRemark] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Bank Transfer' | 'UPI / Online' | 'Cheque'>('Cash');
  const [dateTime, setDateTime] = useState<string>(getCurrentLocalDateTimeString());
  const [attachmentUrl, setAttachmentUrl] = useState<string>('');
  const [attachmentName, setAttachmentName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { submitting, runAction } = useAsyncAction();

  const isCashIn = type === 'in';

  useEffect(() => {
    if (isOpen) {
      setDateTime(getCurrentLocalDateTimeString());
      setCategory(isCashIn ? 'Sales' : 'Vendor Payment');
      setAmount('');
      setRemark('');
      setAttachmentUrl('');
      setAttachmentName('');
      setError('');
    }
  }, [isOpen, type, isCashIn]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('File size exceeds 5MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setAttachmentUrl(reader.result as string);
      setAttachmentName(file.name);
      if (error) setError('');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAttachment = () => {
    setAttachmentUrl('');
    setAttachmentName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  const validate = (): number | null => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      setError('Please enter a valid positive amount.');
      return null;
    }
    if (!remark.trim()) {
      setError('Please enter a description or remark.');
      return null;
    }
    return parsed;
  };

  const handleSaveAndClose = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = validate();
    if (numAmount === null) return;

    await runAction({
      operation: () => onSave({
        amount: numAmount,
        remark: remark.trim(),
        category: category || (isCashIn ? 'General Income' : 'General Expense'),
        paymentMode,
        dateTime: dateTime || getCurrentLocalDateTimeString(),
        attachmentUrl: attachmentUrl || undefined,
        attachmentName: attachmentName || undefined,
      }),
      errorMessage: 'Could not save the Cash Book transaction. Your entries were kept.',
    });

    onClose();
  };

  const handleSaveAndAddNew = async (e: React.MouseEvent) => {
    e.preventDefault();
    const numAmount = validate();
    if (numAmount === null) return;

    await runAction({
      operation: () => onSave({
        amount: numAmount,
        remark: remark.trim(),
        category: category || (isCashIn ? 'General Income' : 'General Expense'),
        paymentMode,
        dateTime: dateTime || getCurrentLocalDateTimeString(),
        attachmentUrl: attachmentUrl || undefined,
        attachmentName: attachmentName || undefined,
      }),
      errorMessage: 'Could not save the Cash Book transaction. Your entries were kept.',
    });

    // Clear form inputs but keep current Date/Time
    setAmount('');
    setRemark('');
    setAttachmentUrl('');
    setAttachmentName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setError('');

  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-[#FFFFFF] rounded-xl border border-[#E6E2D6] shadow-2xl overflow-hidden text-[#121212] max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div 
          className={`flex items-center justify-between px-3.5 sm:px-4 py-2.5 border-b shrink-0 ${
            isCashIn 
              ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]' 
              : 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
          }`}
        >
          <div className="flex items-center gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-md ${
                  isCashIn ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#FEE2E2] text-[#DC2626]'
                }`}>
                  {isCashIn ? 'CASH IN' : 'CASH OUT'}
                </span>
                <span className="text-[11px] text-[#6B7280]">in <strong className="text-[#121212] font-semibold">{bookName}</strong></span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            type="button"
            className="p-1 text-[#6B7280] hover:text-[#121212] rounded-md hover:bg-black/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body - Scrollable on small screens */}
        <form onSubmit={handleSaveAndClose} className="p-3.5 sm:p-4 space-y-3 overflow-y-auto flex-1">
          {error && (
            <div className="p-2 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          {/* Amount Input */}
          <div>
            <label className="block text-[10px] font-bold tracking-wider text-[#4B5563] uppercase mb-1">
              Amount <span className="text-red-500">*</span>
            </label>
            <div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (error) setError('');
                }}
                placeholder="0"
                className={`w-full px-3 py-2 text-base font-bold bg-[#FAF9F5] border rounded-lg focus:outline-none focus:ring-1 transition-all ${
                  isCashIn 
                    ? 'border-[#D8D3C5] focus:ring-[#15803D] text-[#15803D]' 
                    : 'border-[#D8D3C5] focus:ring-[#DC2626] text-[#DC2626]'
                }`}
                autoFocus
              />
            </div>
          </div>

          {/* Remark / Note Input */}
          <div>
            <label className="block text-[10px] font-bold tracking-wider text-[#4B5563] uppercase mb-1">
              Remark / Note <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={remark}
              onChange={(e) => {
                setRemark(e.target.value);
                if (error) setError('');
              }}
              placeholder={isCashIn ? 'e.g. Counter sale, Payment received' : 'e.g. Rent, Restock, Vendor payout'}
              className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#D8D3C5] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#121212] transition-all"
            />
          </div>

          {/* Category Selection */}
          <div>
            <label className="block text-[10px] font-bold tracking-wider text-[#4B5563] uppercase mb-1">
              Category
            </label>
            <AppSelect value={category} onChange={setCategory} options={[...CATEGORY_PRESETS[type], 'General'].map((cat) => ({ value: cat, label: cat }))} />
          </div>

          {/* Payment Mode & Date Time */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold tracking-wider text-[#4B5563] uppercase mb-1">
                Payment Mode
              </label>
              <AppSelect value={paymentMode} onChange={(value) => setPaymentMode(value as any)} options={['Cash', 'Bank Transfer', 'UPI / Online', 'Cheque'].map((value) => ({ value, label: value }))} />
            </div>

            <div>
              <label className="block text-[10px] font-bold tracking-wider text-[#4B5563] uppercase mb-1 flex items-center gap-0.5">
                <Calendar className="w-3 h-3 text-[#6B7280]" />
                Date & Time
              </label>
              <input
                type="datetime-local"
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
                className="w-full px-2 py-1 text-[10px] bg-[#FAF9F5] border border-[#D8D3C5] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#121212] font-mono text-[#121212]"
              />
            </div>
          </div>

          {/* Attachment Upload Field */}
          <div>
            <label className="block text-[10px] font-bold tracking-wider text-[#4B5563] uppercase mb-1 flex items-center gap-1">
              <Paperclip className="w-3 h-3 text-[#6B7280]" />
              Attachment (Pic / Doc)
            </label>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,.pdf,.doc,.docx,.txt"
              className="hidden"
              id="file-attachment-input"
            />

            {!attachmentUrl ? (
              <label
                htmlFor="file-attachment-input"
                className="flex items-center justify-center gap-1.5 w-full py-2 px-3 border border-dashed border-[#D8D3C5] bg-[#FAF9F5] hover:bg-[#F0EDE6] rounded-lg cursor-pointer transition-colors text-xs text-[#4B5563] font-medium"
              >
                <Paperclip className="w-3.5 h-3.5 text-[#6B7280]" />
                <span>Upload Bill, Receipt or Doc</span>
              </label>
            ) : (
              <div className="flex items-center justify-between p-2 bg-[#FAF9F5] border border-[#D8D3C5] rounded-lg">
                <div className="flex items-center gap-2 min-w-0">
                  {attachmentUrl.startsWith('data:image/') ? (
                    <img
                      src={attachmentUrl}
                      alt="Attachment preview"
                      className="w-8 h-8 rounded object-cover border border-[#E6E2D6] shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-[#EFECE3] rounded flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-[#4B5563]" />
                    </div>
                  )}
                  <span className="text-xs font-semibold text-[#121212] truncate">
                    {attachmentName || 'Attachment'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleRemoveAttachment}
                  title="Remove attachment"
                  className="p-1 text-[#9CA3AF] hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Bottom Action Buttons */}
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#E6E2D6] shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-bold text-[#4B5563] hover:bg-[#EFECE3] rounded-lg transition-colors"
            >
              Cancel
            </button>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={submitting}
                onClick={handleSaveAndAddNew}
                className="px-2.5 py-1.5 text-[11px] font-bold border border-[#D8D3C5] bg-[#F7F5EE] hover:bg-[#EFECE3] text-[#121212] rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
              >
                <Plus className="w-3 h-3" />
                Add & Next
              </button>

              <button
                type="submit"
                disabled={submitting}
                className={`px-3.5 py-1.5 text-[11px] font-bold text-white rounded-lg shadow-xs transition-all flex items-center gap-1 ${
                  isCashIn 
                    ? 'bg-[#15803D] hover:bg-[#166534]' 
                    : 'bg-[#DC2626] hover:bg-[#B91C1C]'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                {submitting ? 'Saving…' : 'Save Entry'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
