import React, { useEffect, useState } from 'react';
import { X, Pencil } from 'lucide-react';
import { Book } from '../types';
import type { BookUpdate } from '../cashBookRepository';
import { useAsyncAction } from '../../../hooks/useAsyncAction';

export function RenameBookModal({ book, onClose, onSave }: { book: Book | null; onClose: () => void; onSave: (bookId: string, changes: BookUpdate) => void }) {
  const [name, setName] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const { submitting, runAction } = useAsyncAction();
  useEffect(() => { setName(book?.name ?? ''); setOpeningBalance(book?.openingBalance ? String(book.openingBalance) : ''); }, [book]);
  if (!book) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
    <form className="w-full max-w-sm rounded-xl border border-[#E6E2D6] bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); if (name.trim() && !submitting) void runAction({ operation: () => onSave(book.id, { name: name.trim(), openingBalance: Math.max(0, Number(openingBalance) || 0) }), successMessage: 'Cash Book updated successfully.', errorMessage: 'Could not update the Cash Book. Your entries were kept.' }).then(onClose).catch(() => undefined); }}>
      <div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-bold"><Pencil className="h-4 w-4" /> Edit book name</h2><button type="button" onClick={onClose}><X className="h-4 w-4 text-[#6B7280]" /></button></div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-[#4B5563]">Book name<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-[#D8D3C5] bg-[#FAF9F5] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#121212]" /></label>
      <label className="mt-3 block text-[10px] font-bold uppercase tracking-wider text-[#4B5563]">Opening balance<input type="number" min="0" step="0.01" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} className="mt-1 w-full rounded-lg border border-[#D8D3C5] bg-[#FAF9F5] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#121212]" /></label>
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={submitting} className="rounded-lg px-3 py-2 text-xs font-bold text-[#6B7280] hover:bg-[#F7F5EE]">Cancel</button><button disabled={submitting} className="rounded-lg bg-[#121212] px-3 py-2 text-xs font-bold text-white">{submitting ? 'Saving…' : 'Save'}</button></div>
    </form>
  </div>;
}
