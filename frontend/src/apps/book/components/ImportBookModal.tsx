import React, { useRef, useState } from 'react';
import { Download, FileUp, LoaderCircle, X } from 'lucide-react';
import { Book, Transaction } from '../types';
import { parseBookImport, ImportedBook } from '../utils/importers';
import { saveTextFile } from '../../../lib/mobile';
import { useAsyncAction } from '../../../hooks/useAsyncAction';

type ImportPayload = { book: Omit<Book, 'id' | 'createdAt' | 'updatedAt'>; transactions: Omit<Transaction, 'id' | 'bookId' | 'createdAt'>[] }[];
const template = 'Book Name,Description,Category,Currency,Date,Type,Amount,Remark,Payment Mode\nRetail Shop,Daily cash book,Business,$,2026-08-11 09:00,Cash In,1500,Opening cash,Cash\nRetail Shop,Daily cash book,Business,$,2026-08-11 17:00,Cash Out,200,Transport,Cash\n';

export function ImportBookModal({ isOpen, onClose, onImport }: { isOpen: boolean; onClose: () => void; onImport: (payload: ImportPayload) => void | Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ImportedBook[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { submitting, runAction } = useAsyncAction();
  if (!isOpen) return null;
  const chooseFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError(''); setFileName(file.name);
    try { setParsed(await parseBookImport(file)); } catch (caught) { setParsed([]); setError(caught instanceof Error ? caught.message : 'Could not read this file.'); }
    finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
    <div className="w-full max-w-md rounded-xl border border-[#E6E2D6] bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between"><div><h2 className="flex items-center gap-2 text-sm font-bold"><FileUp className="h-4 w-4" /> Import books</h2><p className="mt-1 text-[11px] text-[#6B7280]">Choose a PDF, Excel, or CSV file.</p></div><button type="button" onClick={onClose}><X className="h-4 w-4 text-[#6B7280]" /></button></div>
      <input ref={inputRef} type="file" accept=".pdf,.csv,.xlsx,.xls" className="hidden" onChange={(event) => void chooseFile(event.target.files?.[0])} />
      <button type="button" onClick={() => inputRef.current?.click()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#D8D3C5] bg-[#FAF9F5] px-3 py-5 text-xs font-bold hover:border-[#121212]"><FileUp className="h-4 w-4" /> {busy ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Reading file…</> : fileName || 'Choose file'}</button>
      <button type="button" onClick={() => void saveTextFile('cash_book_import_template.csv', template)} className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-[#15803D] hover:underline"><Download className="h-3.5 w-3.5" /> Download import template</button>
      <p className="mt-2 text-[10px] leading-4 text-[#6B7280]">Use the template column order: Book Name, Description, Category, Currency, Date, Type, Amount, Remark, Payment Mode. Type must be Cash In or Cash Out.</p>
      {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-[11px] font-semibold text-red-700">{error}</p>}
      {fileName && !busy && !error && <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-[11px] font-semibold text-emerald-800">Found {parsed.length} book{parsed.length === 1 ? '' : 's'} and {parsed.reduce((total, item) => total + item.transactions.length, 0)} entries.</p>}
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={submitting} className="rounded-lg px-3 py-2 text-xs font-bold text-[#6B7280] hover:bg-[#F7F5EE] disabled:opacity-50">Cancel</button><button type="button" disabled={!parsed.length || busy || submitting} onClick={() => void runAction({ operation: () => onImport(parsed), successMessage: 'Cash Book imported successfully.', errorMessage: 'Could not import the Cash Book. Your file was kept.' })} className="rounded-lg bg-[#121212] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{submitting ? 'Importing…' : 'Import'}</button></div>
    </div>
  </div>;
}
