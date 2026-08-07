import React, { useState, useMemo } from 'react';
import { Book, Transaction } from '../types';
import { calculateBookStats, formatCurrency, formatDateTime } from '../utils/formatters';
import {
  ArrowLeft, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  Calendar,
  CreditCard,
  Tag,
  Clock,
  Download,
  Paperclip,
  FileText,
  X
} from 'lucide-react';
import { exportPdfFile, showAppToast } from '../../../lib/mobile';

interface BookDetailViewProps {
  book: Book;
  transactions: Transaction[];
  onBackToDashboard: () => void;
  onOpenCashInModal: () => void;
  onOpenCashOutModal: () => void;
  onDeleteTransaction: (id: string) => void;
}

export const BookDetailView: React.FC<BookDetailViewProps> = ({
  book,
  transactions,
  onBackToDashboard,
  onOpenCashInModal,
  onOpenCashOutModal,
  onDeleteTransaction,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'in' | 'out'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'highest'>('newest');
  const [previewAttachment, setPreviewAttachment] = useState<{ url: string; name: string } | null>(null);

  // Book Statistics
  const bookTransactions = useMemo(() => {
    return transactions.filter(t => t.bookId === book.id);
  }, [transactions, book.id]);

  const stats = useMemo(() => {
    return calculateBookStats(bookTransactions);
  }, [bookTransactions]);

  // Compute running balance map: tx.id -> net balance after that entry
  const runningBalanceMap = useMemo(() => {
    const sortedChronologically = [...bookTransactions].sort((a, b) => {
      const timeA = new Date(a.dateTime).getTime();
      const timeB = new Date(b.dateTime).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const map = new Map<string, number>();
    let currentBalance = 0;

    for (const tx of sortedChronologically) {
      if (tx.type === 'in') {
        currentBalance += tx.amount;
      } else {
        currentBalance -= tx.amount;
      }
      map.set(tx.id, currentBalance);
    }

    return map;
  }, [bookTransactions]);

  // Filtered & Sorted Transactions
  const filteredTransactions = useMemo(() => {
    return bookTransactions
      .filter(t => {
        if (typeFilter !== 'all' && t.type !== typeFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchRemark = t.remark.toLowerCase().includes(q);
          const matchCategory = t.category?.toLowerCase().includes(q);
          const matchMode = t.paymentMode?.toLowerCase().includes(q);
          const matchAmount = t.amount.toString().includes(q);
          return matchRemark || matchCategory || matchMode || matchAmount;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          return new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime();
        }
        if (sortBy === 'oldest') {
          return new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime();
        }
        if (sortBy === 'highest') {
          return b.amount - a.amount;
        }
        return 0;
      });
  }, [bookTransactions, typeFilter, searchQuery, sortBy]);

  const handleExportPDF = () => {
    const lines = [
      `Book: ${book.name}`,
      `Currency: ${book.currency}`,
      `Total cash in: ${formatCurrency(stats.totalIn, book.currency)}`,
      `Total cash out: ${formatCurrency(stats.totalOut, book.currency)}`,
      `Net balance: ${formatCurrency(stats.netBalance, book.currency)}`,
      '',
      ...bookTransactions
        .slice()
        .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())
        .map((transaction) => [
          formatDateTime(transaction.dateTime).dateStr,
          transaction.type === 'in' ? 'CASH IN' : 'CASH OUT',
          `${transaction.type === 'in' ? '+' : '-'}${formatCurrency(transaction.amount, book.currency)}`,
          transaction.remark,
          transaction.category || '—',
          transaction.paymentMode || '—',
        ].join(' | ')),
    ];
    void exportPdfFile(`${book.name.replace(/\s+/g, '_')}_transactions.pdf`, `Cash Book Transactions — ${book.name}`, lines)
      .then(() => showAppToast('Cash Book PDF saved'))
      .catch(() => showAppToast('Could not save the Cash Book PDF'));
  };

  return (
    <div className="min-h-screen pb-20">
      {/* Top Navigation Bar inside Book */}
      <div className="bg-[#FFFFFF] border-b border-[#E6E2D6] px-2.5 sm:px-4 py-1.5 mb-2 sm:mb-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
          <button
            onClick={onBackToDashboard}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-[#121212] bg-[#F7F5EE] hover:bg-[#EFECE3] border border-[#E6E2D6] rounded-md transition-colors shadow-2xs"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>Dashboard</span>
          </button>

          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#15803D]"></span>
              <h1 className="text-xs sm:text-sm font-bold font-serif italic text-[#121212]">
                {book.name}
              </h1>
            </div>
            {book.description && (
              <p className="text-[9px] text-[#6B7280] hidden sm:block leading-none mt-0.5">{book.description}</p>
            )}
          </div>

          <button
            onClick={handleExportPDF}
            title="Export transactions to PDF"
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-[#4B5563] hover:text-[#121212] bg-[#FAF9F5] hover:bg-[#EFECE3] border border-[#E6E2D6] rounded-md transition-colors"
          >
            <Download className="w-2.5 h-2.5" />
            <span className="hidden sm:inline">PDF</span>
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-2 sm:px-3 space-y-2.5">
        {/* SUMMARY CARD VIEW AT TOP - MINIMIZED SIZE */}
        <div className="bg-[#FFFFFF] rounded-lg border border-[#E6E2D6] p-2 sm:p-3 shadow-2xs relative overflow-hidden">
          <div className="text-center max-w-xs mx-auto mb-2">
            <span className="text-[8px] font-extrabold tracking-widest text-[#B45309] uppercase bg-[#FEF3C7] px-2 py-0.2 rounded-full border border-[#FDE68A]">
              NET BALANCE
            </span>
            <div className={`text-xl sm:text-2xl font-bold tracking-tight mt-0.5 ${
              stats.netBalance >= 0 ? 'text-[#121212]' : 'text-[#DC2626]'
            }`}>
              {formatCurrency(stats.netBalance, book.currency)}
            </div>
            <p className="text-[9px] text-[#6B7280] mt-0.5">
              {stats.transactionCount} entries recorded
            </p>
          </div>

          {/* Sub-cards: Total Cash In (+) and Total Cash Out (-) */}
          <div className="grid grid-cols-2 gap-1.5">
            {/* Total In Card */}
            <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-md p-1.5 flex items-center justify-between">
              <div>
                <span className="block text-[8px] font-bold uppercase tracking-wider text-[#166534]">
                  TOTAL IN
                </span>
                <span className="text-xs sm:text-sm font-bold text-[#15803D]">
                  +{formatCurrency(stats.totalIn, book.currency)}
                </span>
              </div>
            </div>

            {/* Total Out Card */}
            <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-md p-1.5 flex items-center justify-between">
              <div>
                <span className="block text-[8px] font-bold uppercase tracking-wider text-[#991B1B]">
                  TOTAL OUT
                </span>
                <span className="text-xs sm:text-sm font-bold text-[#DC2626]">
                  -{formatCurrency(stats.totalOut, book.currency)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* TRANSACTIONS SECTION BELOW CARD */}
        <div className="bg-[#FFFFFF] rounded-lg border border-[#E6E2D6] p-2 sm:p-3 shadow-2xs space-y-2">
          {/* Section Header */}
          <div className="pb-2 border-b border-[#E6E2D6]">
            <h2 className="text-xs font-bold text-[#121212] tracking-tight">
              Transactions
            </h2>
            <p className="text-[9px] text-[#6B7280]">
              Showing {filteredTransactions.length} of {bookTransactions.length} entries
            </p>
          </div>

          {/* Search, Filter & Sort Controls */}
          <div className="flex flex-row gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#9CA3AF]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search entries..."
                className="w-full pl-6 pr-2 py-1 text-[10px] bg-[#FAF9F5] border border-[#D8D3C5] rounded-md focus:outline-none focus:ring-1 focus:ring-[#121212]"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | 'in' | 'out')}
              className="px-1.5 py-1 text-[10px] font-semibold bg-[#FAF9F5] border border-[#D8D3C5] rounded-md focus:outline-none focus:ring-1 focus:ring-[#121212]"
            >
              <option value="all">All Entries</option>
              <option value="in">Cash In Only</option>
              <option value="out">Cash Out Only</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'highest')}
              className="px-1.5 py-1 text-[10px] font-semibold bg-[#FAF9F5] border border-[#D8D3C5] rounded-md focus:outline-none focus:ring-1 focus:ring-[#121212]"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="highest">Highest Amount</option>
            </select>
          </div>

          {/* Transactions List */}
          {filteredTransactions.length === 0 ? (
            <div className="py-6 text-center bg-[#FAF9F5] rounded-md border border-dashed border-[#D8D3C5] p-3">
              <Clock className="w-5 h-5 text-[#9CA3AF] mx-auto mb-1" />
              <h3 className="text-xs font-bold text-[#121212]">No entries found</h3>
              <p className="text-[9px] text-[#6B7280] max-w-xs mx-auto mt-0.5">
                {searchQuery || typeFilter !== 'all'
                  ? 'Try adjusting filters or search term'
                  : 'Record entries using Cash In or Cash Out below!'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E6E2D6] overflow-hidden rounded-md border border-[#E6E2D6]">
              {filteredTransactions.map((tx) => {
                const { dateStr, timeStr } = formatDateTime(tx.dateTime);
                const isCashIn = tx.type === 'in';

                return (
                  <div
                    key={tx.id}
                    className="p-2 sm:p-2.5 bg-[#FFFFFF] hover:bg-[#FAF9F5] transition-colors flex items-center justify-between gap-2 group"
                  >
                    {/* Left Details */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                          <span
                            className={`text-[8px] font-extrabold uppercase px-1 py-0.2 rounded-md ${
                              isCashIn
                                ? 'bg-[#DCFCE7] text-[#15803D]'
                                : 'bg-[#FEE2E2] text-[#DC2626]'
                            }`}
                          >
                            {isCashIn ? 'CASH IN' : 'CASH OUT'}
                          </span>

                          {tx.category && (
                            <span className="text-[8px] font-medium text-[#4B5563] bg-[#EFECE3] px-1 py-0.2 rounded-md flex items-center gap-0.5">
                              <Tag className="w-2 h-2" />
                              {tx.category}
                            </span>
                          )}

                          {tx.paymentMode && (
                            <span className="text-[8px] text-[#6B7280] bg-[#FAF9F5] border border-[#E6E2D6] px-1 py-0.2 rounded-md flex items-center gap-0.5 hidden sm:inline-flex">
                              <CreditCard className="w-2 h-2" />
                              {tx.paymentMode}
                            </span>
                          )}

                          {tx.attachmentUrl && (
                            <button
                              type="button"
                              onClick={() => setPreviewAttachment({ url: tx.attachmentUrl!, name: tx.attachmentName || 'Attachment' })}
                              className="text-[8px] font-semibold text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] hover:bg-[#DCFCE7] px-1 py-0.2 rounded-md flex items-center gap-0.5 transition-colors"
                              title="View Attachment"
                            >
                              <Paperclip className="w-2 h-2" />
                              <span>Doc</span>
                            </button>
                          )}
                        </div>

                        <h4 className="text-[11px] font-bold text-[#121212] truncate leading-tight">
                          {tx.remark}
                        </h4>

                        <div className="flex items-center gap-1 text-[9px] text-[#6B7280] mt-0.5 font-mono">
                          <span className="flex items-center gap-0.5">
                            <Calendar className="w-2 h-2 text-[#9CA3AF]" />
                            {dateStr}
                          </span>
                          {timeStr && (
                            <span className="flex items-center gap-0.5">
                              <Clock className="w-2 h-2 text-[#9CA3AF]" />
                              {timeStr}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Amount, Net Balance After Entry, & Delete Action */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="text-right">
                        <div
                          className={`text-xs sm:text-sm font-bold ${
                            isCashIn ? 'text-[#15803D]' : 'text-[#DC2626]'
                          }`}
                        >
                          {isCashIn ? '+' : '-'}{formatCurrency(tx.amount, book.currency)}
                        </div>
                        <div className="text-[8px] sm:text-[9px] font-medium text-[#6B7280] mt-0.5">
                          Net: <span className="font-bold text-[#121212]">{formatCurrency(runningBalanceMap.get(tx.id) ?? 0, book.currency)}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => onDeleteTransaction(tx.id)}
                        title="Delete entry"
                        className="p-0.5 text-[#9CA3AF] hover:text-red-600 hover:bg-red-50 rounded-md transition-colors opacity-80 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ATTACHMENT PREVIEW MODAL */}
      {previewAttachment && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setPreviewAttachment(null)}
        >
          <div 
            className="w-full max-w-lg bg-white rounded-xl border border-[#E6E2D6] shadow-2xl p-4 overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E6E2D6]">
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="w-4 h-4 text-[#15803D] shrink-0" />
                <h3 className="text-xs sm:text-sm font-bold text-[#121212] truncate">
                  {previewAttachment.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                className="p-1 text-[#6B7280] hover:text-[#121212] rounded-md hover:bg-black/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 my-2 bg-[#FAF9F5] border border-[#E6E2D6] rounded-lg overflow-auto flex-1 flex items-center justify-center">
              {previewAttachment.url.startsWith('data:image/') ? (
                <img 
                  src={previewAttachment.url} 
                  alt={previewAttachment.name}
                  className="max-h-[60vh] max-w-full rounded object-contain shadow-xs" 
                />
              ) : (
                <div className="text-center py-6">
                  <FileText className="w-12 h-12 text-[#9CA3AF] mx-auto mb-2" />
                  <p className="text-xs font-semibold text-[#121212]">{previewAttachment.name}</p>
                  <p className="text-[10px] text-[#6B7280] mt-1">Document attached</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E6E2D6]">
              <a
                href={previewAttachment.url}
                download={previewAttachment.name}
                className="px-3 py-1.5 text-xs font-bold text-white bg-[#121212] hover:bg-[#27272A] rounded-lg transition-colors flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download / Open</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* STICKY BOTTOM BUTTONS OPTIMIZED FOR MOBILE */}
      <div className="native-safe-bottom fixed bottom-0 left-0 right-0 z-40 bg-[#FFFFFF]/95 backdrop-blur-md border-t border-[#E6E2D6] p-1.5 sm:p-2 shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-1.5">
          {/* Cash In Button (Green) */}
          <button
            onClick={onOpenCashInModal}
            type="button"
            className="flex-1 py-2 px-2.5 text-xs font-bold text-white bg-[#15803D] hover:bg-[#166534] active:scale-[0.98] rounded-md shadow-xs transition-all flex items-center justify-center gap-1"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Cash In</span>
          </button>

          {/* Cash Out Button (Red) */}
          <button
            onClick={onOpenCashOutModal}
            type="button"
            className="flex-1 py-2 px-2.5 text-xs font-bold text-white bg-[#DC2626] hover:bg-[#B91C1C] active:scale-[0.98] rounded-md shadow-xs transition-all flex items-center justify-center gap-1"
          >
            <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Cash Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
