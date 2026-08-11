import React, { useState, useMemo } from 'react';
import { Book, Transaction } from '../types';
import { BookCard } from './BookCard';
import { calculateBookStats, formatCurrency } from '../utils/formatters';
import { 
  Plus, 
  Search, 
  BookOpen
} from 'lucide-react';

interface DashboardViewProps {
  books: Book[];
  transactions: Transaction[];
  onSelectBook: (bookId: string) => void;
  onOpenAddBookModal: () => void;
  onQuickCashIn: (book: Book) => void;
  onQuickCashOut: (book: Book) => void;
  onRenameBook: (book: Book) => void;
  onRequestDeleteBook: (book: Book) => void;
  onAddMembers: (book: Book) => void;
  onOpenImportBookModal: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  books,
  transactions,
  onSelectBook,
  onOpenAddBookModal,
  onQuickCashIn,
  onQuickCashOut,
  onRenameBook,
  onRequestDeleteBook,
  onAddMembers,
  onOpenImportBookModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'balance' | 'name'>('recent');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSortClick = (key: 'recent' | 'balance' | 'name') => {
    if (sortBy === key) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortOrder(key === 'name' ? 'asc' : 'desc');
    }
  };

  // Total Summary across all books
  const grandTotalStats = useMemo(() => {
    return calculateBookStats(transactions);
  }, [transactions]);

  // Helper to compute latest activity timestamp for a book
  const getLatestTimestamp = (bookId: string, updatedAt: string) => {
    const bookTxs = transactions.filter(t => t.bookId === bookId);
    if (bookTxs.length === 0) return new Date(updatedAt).getTime();
    const latestTxTime = Math.max(...bookTxs.map(t => new Date(t.dateTime).getTime()));
    return Math.max(latestTxTime, new Date(updatedAt).getTime());
  };

  // Filtered and Sorted Books
  const filteredBooks = useMemo(() => {
    return books
      .filter(b => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          b.name.toLowerCase().includes(q) ||
          b.category?.toLowerCase().includes(q) ||
          b.description?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'recent') {
          const diff = getLatestTimestamp(b.id, b.updatedAt) - getLatestTimestamp(a.id, a.updatedAt);
          return sortOrder === 'desc' ? diff : -diff;
        }
        if (sortBy === 'balance') {
          const statsA = calculateBookStats(transactions, a.id);
          const statsB = calculateBookStats(transactions, b.id);
          const diff = statsB.netBalance - statsA.netBalance;
          return sortOrder === 'desc' ? diff : -diff;
        }
        if (sortBy === 'name') {
          const diff = a.name.localeCompare(b.name);
          return sortOrder === 'asc' ? diff : -diff;
        }
        return 0;
      });
  }, [books, transactions, searchQuery, sortBy, sortOrder]);

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2.5 sm:py-4 pb-20 space-y-2.5 sm:space-y-3">
      {/* GRAND OVERVIEW CARD - COMPACT SIZE */}
      <div className="bg-[#FFFFFF] rounded-lg border border-[#E6E2D6] p-2.5 sm:p-3 shadow-2xs relative overflow-hidden">
        <button type="button" onClick={onOpenImportBookModal} className="absolute top-2 right-2 sm:top-3 sm:right-3 z-10 rounded-md bg-[#121212] px-2 py-1 text-[9px] font-bold text-white hover:bg-[#27272A]">
          Import
        </button>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="px-1.5 py-0.2 text-[8px] font-extrabold uppercase tracking-widest bg-[#121212] text-white rounded-md">
                ALL BOOKS
              </span>
              <span className="text-[10px] text-[#6B7280]">
                {books.length} {books.length === 1 ? 'Book' : 'Books'}
              </span>
            </div>
            <h1 className="text-sm sm:text-base font-bold font-serif italic text-[#121212] tracking-tight">
              Cash Book Overview
            </h1>
          </div>

          {/* Aggregate Financial Metrics */}
          <div className="grid grid-cols-3 gap-1.5 w-full md:w-auto">
            <div className="bg-[#FAF9F5] border border-[#E6E2D6] px-2 py-1 rounded-md">
              <span className="block text-[8px] font-extrabold tracking-widest text-[#B45309] uppercase">
                NET BALANCE
              </span>
              <span className="text-xs sm:text-sm font-bold text-[#121212] truncate block">
                {formatCurrency(grandTotalStats.netBalance)}
              </span>
            </div>

            <div className="bg-[#F0FDF4] border border-[#BBF7D0] px-2 py-1 rounded-md">
              <span className="block text-[8px] font-bold text-[#166534] uppercase tracking-wider">
                TOTAL IN
              </span>
              <span className="text-xs sm:text-sm font-bold text-[#15803D] truncate block">
                +{formatCurrency(grandTotalStats.totalIn)}
              </span>
            </div>

            <div className="bg-[#FEF2F2] border border-[#FECACA] px-2 py-1 rounded-md">
              <span className="block text-[8px] font-bold text-[#991B1B] uppercase tracking-wider">
                TOTAL OUT
              </span>
              <span className="text-xs sm:text-sm font-bold text-[#DC2626] truncate block">
                -{formatCurrency(grandTotalStats.totalOut)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SEARCH AND SORT BAR */}
      <div className="flex flex-row items-center justify-between gap-2 bg-[#FFFFFF] p-2.5 rounded-xl border border-[#E6E2D6] shadow-2xs">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search books..."
            className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-[#FAF9F5] border border-[#D8D3C5] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#121212]"
          />
        </div>

        <div className="flex items-center gap-1 bg-[#F7F5EE] p-0.5 rounded-lg border border-[#E6E2D6]">
          <button
            type="button"
            onClick={() => handleSortClick('recent')}
            className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors flex items-center gap-1 ${
              sortBy === 'recent'
                ? 'bg-[#121212] text-white'
                : 'text-[#4B5563] hover:text-[#121212]'
            }`}
          >
            <span>Last Edited</span>
            {sortBy === 'recent' && (
              <span className="text-[9px]">{sortOrder === 'desc' ? '↓' : '↑'}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleSortClick('balance')}
            className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors flex items-center gap-1 ${
              sortBy === 'balance'
                ? 'bg-[#121212] text-white'
                : 'text-[#4B5563] hover:text-[#121212]'
            }`}
          >
            <span>Balance</span>
            {sortBy === 'balance' && (
              <span className="text-[9px]">{sortOrder === 'desc' ? '↓' : '↑'}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleSortClick('name')}
            className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors flex items-center gap-1 ${
              sortBy === 'name'
                ? 'bg-[#121212] text-white'
                : 'text-[#4B5563] hover:text-[#121212]'
            }`}
          >
            <span>Name</span>
            {sortBy === 'name' && (
              <span className="text-[9px]">{sortOrder === 'asc' ? 'A-Z' : 'Z-A'}</span>
            )}
          </button>
        </div>
      </div>

      {/* BOOKS GRID - COMPACT CARDS */}
      {filteredBooks.length === 0 ? (
        <div className="py-10 text-center bg-[#FFFFFF] rounded-xl border border-dashed border-[#D8D3C5] p-4">
          <BookOpen className="w-8 h-8 text-[#9CA3AF] mx-auto mb-2" />
          <h3 className="text-sm font-bold text-[#121212]">No books found</h3>
          <p className="text-[11px] text-[#6B7280] max-w-xs mx-auto mt-0.5 mb-4">
            {searchQuery 
              ? `No books matching "${searchQuery}".` 
              : 'Create your first cash book to start recording entries!'}
          </p>
          <button
            onClick={onOpenAddBookModal}
            className="px-4 py-2 text-xs font-bold text-white bg-[#121212] hover:bg-[#27272A] rounded-lg shadow-xs transition-colors inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Book</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              transactions={transactions}
              onSelectBook={onSelectBook}
              onQuickCashIn={onQuickCashIn}
              onQuickCashOut={onQuickCashOut}
              onRenameBook={onRenameBook}
              onAddMembers={onAddMembers}
              onRequestDeleteBook={onRequestDeleteBook}
            />
          ))}
        </div>
      )}

      {/* FLOATING ACTION BUTTON FOR ADDING NEW BOOK */}
      <div className="fixed bottom-4 right-4 z-40">
        <button
          onClick={onOpenAddBookModal}
          type="button"
          className="px-3.5 py-2.5 bg-[#121212] hover:bg-[#27272A] text-white font-bold text-xs rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 border border-white/20"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>New Book</span>
        </button>
      </div>
    </div>
  );
};
