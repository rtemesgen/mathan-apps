import React, { useState } from 'react';
import { Book } from '../types';
import { X, BookPlus } from 'lucide-react';

interface AddBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (bookData: Omit<Book, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export const AddBookModal: React.FC<AddBookModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('$');
  const [category, setCategory] = useState('Business');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a book name');
      return;
    }

    onSave({
      name: name.trim(),
      description: description.trim(),
      currency: currency.trim() || '$',
      category: category.trim(),
    });

    // Reset form
    setName('');
    setDescription('');
    setCurrency('$');
    setCategory('Business');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-sm bg-[#FFFFFF] rounded-xl border border-[#E6E2D6] shadow-xl overflow-hidden text-[#121212]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#F7F5EE] border-b border-[#E6E2D6]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#121212] text-[#FFFFFF] flex items-center justify-center font-bold">
              <BookPlus className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-[#121212]">Create New Book</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-1 text-[#6B7280] hover:text-[#121212] rounded-md hover:bg-[#EFECE3] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {error && (
            <div className="p-2 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold tracking-wider text-[#4B5563] uppercase mb-1">
              Book Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. Retail Shop Cashbook, Daily Expenses"
              className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#D8D3C5] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#121212] transition-all placeholder:text-[#9CA3AF]"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold tracking-wider text-[#4B5563] uppercase mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#D8D3C5] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#121212] transition-all"
            >
              <option value="Business">Business / Shop</option>
              <option value="Payroll">Payroll & Staff</option>
              <option value="Personal">Personal Ledger</option>
              <option value="Projects">Client Project</option>
              <option value="Other">Other Category</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold tracking-wider text-[#4B5563] uppercase mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional summary"
              className="w-full px-3 py-1.5 text-xs bg-[#FAF9F5] border border-[#D8D3C5] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#121212]"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E6E2D6]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-bold text-[#4B5563] hover:bg-[#EFECE3] rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-bold text-white bg-[#121212] hover:bg-[#27272A] rounded-lg shadow-2xs transition-colors flex items-center gap-1"
            >
              Save Book
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

