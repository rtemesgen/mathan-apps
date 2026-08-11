import React from 'react';
import { Book, Transaction } from '../types';
import { calculateBookStats, formatCurrency, formatTimeAgo } from '../utils/formatters';
import { MoreVertical, Plus, Minus, Clock, Pencil, UserPlus, Trash2 } from 'lucide-react';

interface BookCardProps {
  book: Book;
  transactions: Transaction[];
  onSelectBook: (bookId: string) => void;
  onQuickCashIn: (book: Book) => void;
  onQuickCashOut: (book: Book) => void;
  onRenameBook: (book: Book) => void;
  onAddMembers: (book: Book) => void;
  onRequestDeleteBook: (book: Book) => void;
}

export const BookCard: React.FC<BookCardProps> = ({
  book,
  transactions,
  onSelectBook,
  onQuickCashIn,
  onQuickCashOut,
  onRenameBook,
  onAddMembers,
  onRequestDeleteBook,
}) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const stats = calculateBookStats(transactions, book.id);
  const isNetPositive = stats.netBalance >= 0;

  // Calculate latest activity timestamp
  const bookTxs = transactions.filter(t => t.bookId === book.id);
  const latestTxTime = bookTxs.length > 0 
    ? Math.max(...bookTxs.map(t => new Date(t.dateTime).getTime()))
    : new Date(book.updatedAt).getTime();
  const lastEditedISO = new Date(latestTxTime).toISOString();
  const lastEditedStr = formatTimeAgo(lastEditedISO);

  return (
    <div 
      onClick={() => onSelectBook(book.id)}
      className="group relative bg-[#FFFFFF] rounded-xl border border-[#E6E2D6] p-3 shadow-2xs hover:shadow-md hover:border-[#121212]/30 transition-all duration-200 cursor-pointer flex flex-col justify-between gap-2.5"
    >
      {/* Top Main Row: Book Name (Left) & Net Balance (Right) */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#15803D] shrink-0"></span>
            <h3 className="text-sm font-bold text-[#121212] group-hover:text-[#15803D] transition-colors truncate">
              {book.name}
            </h3>
            {book.category && (
              <span className="text-[9px] font-semibold text-[#6B7280] uppercase bg-[#FAF9F5] px-1.5 py-0.2 rounded border border-[#E6E2D6] shrink-0">
                {book.category}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-[#6B7280] flex items-center gap-1">
              <Clock className="w-2.5 h-2.5 text-[#9CA3AF]" />
              Edited {lastEditedStr}
            </span>
            <span className="text-[10px] text-[#D8D3C5]">·</span>
            <span className="text-[10px] text-[#6B7280]">
              {stats.transactionCount} {stats.transactionCount === 1 ? 'entry' : 'entries'}
            </span>
          </div>
        </div>

        {/* Net Balance on Right */}
        <div className="flex items-start gap-2 text-right shrink-0">
          <div className="text-right">
          <span className="block text-[8px] font-extrabold tracking-widest uppercase text-[#B45309]">
            NET BALANCE
          </span>
          <span className={`text-base font-bold tracking-tight ${
            isNetPositive ? 'text-[#121212]' : 'text-[#DC2626]'
          }`}>
            {formatCurrency(stats.netBalance, book.currency)}
          </span>
          </div>
          <div className="relative">
            <button type="button" aria-label={`Actions for ${book.name}`} onClick={(event) => { event.stopPropagation(); setMenuOpen(value => !value); }} className="rounded-md p-1 text-[#6B7280] hover:bg-[#F7F5EE] hover:text-[#121212]">
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && <>
              <button type="button" aria-label="Close book actions" className="fixed inset-0 z-20 cursor-default" onClick={(event) => { event.stopPropagation(); setMenuOpen(false); }} />
              <div className="absolute right-0 top-7 z-30 w-44 rounded-lg border border-[#E6E2D6] bg-white p-1.5 text-left shadow-xl">
                <button type="button" onClick={(event) => { event.stopPropagation(); setMenuOpen(false); onRenameBook(book); }} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-[11px] font-semibold hover:bg-[#F7F5EE]"><Pencil className="h-3.5 w-3.5" /> Edit / Rename</button>
                <button type="button" onClick={(event) => { event.stopPropagation(); setMenuOpen(false); onAddMembers(book); }} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-[11px] font-semibold hover:bg-[#F7F5EE]"><UserPlus className="h-3.5 w-3.5" /> Add members</button>
                <button type="button" onClick={(event) => { event.stopPropagation(); setMenuOpen(false); onRequestDeleteBook(book); }} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-[11px] font-semibold text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Delete book</button>
              </div>
            </>}
          </div>
        </div>
      </div>

      {/* Quick Action Bar at bottom */}
      <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-[#F0EDE6]">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onQuickCashIn(book);
          }}
          className="flex-1 py-1 px-2 text-[10px] font-bold text-[#15803D] bg-[#DCFCE7]/70 hover:bg-[#DCFCE7] border border-[#BBF7D0] rounded-md transition-colors flex items-center justify-center gap-1"
        >
          <Plus className="w-3 h-3 stroke-[2.5]" />
          <span>Cash In</span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onQuickCashOut(book);
          }}
          className="flex-1 py-1 px-2 text-[10px] font-bold text-[#DC2626] bg-[#FEE2E2]/70 hover:bg-[#FEE2E2] border border-[#FECACA] rounded-md transition-colors flex items-center justify-center gap-1"
        >
          <Minus className="w-3 h-3 stroke-[2.5]" />
          <span>Cash Out</span>
        </button>

      </div>
    </div>
  );
};
