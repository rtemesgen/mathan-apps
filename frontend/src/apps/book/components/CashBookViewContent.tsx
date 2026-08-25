import React from 'react';
import type { Book, Transaction } from '../types';
import { DashboardView } from './DashboardView';
import { BookDetailView } from './BookDetailView';

type CashBookViewContentProps = {
  books: Book[];
  transactions: Transaction[];
  activeBook: Book | null;
  onSelectBook: (bookId: string) => void;
  onBackToDashboard: () => void;
  onOpenAddBook: () => void;
  onOpenCashIn: (book: Book) => void;
  onOpenCashOut: (book: Book) => void;
  onRenameBook: (book: Book) => void;
  onRequestDeleteBook: (book: Book) => void;
  onAddMembers: (book: Book) => void;
  onOpenImport: () => void;
  onDeleteTransaction: (transactionId: string) => Promise<void>;
  onOpenExport: (filters?: { transactionType?: string; query?: string }) => void;
};

export function CashBookViewContent({
  books,
  transactions,
  activeBook,
  onSelectBook,
  onBackToDashboard,
  onOpenAddBook,
  onOpenCashIn,
  onOpenCashOut,
  onRenameBook,
  onRequestDeleteBook,
  onAddMembers,
  onOpenImport,
  onDeleteTransaction,
  onOpenExport,
}: CashBookViewContentProps) {
  return <main className="mobile-content-safe flex-1 min-w-0 pb-16 sm:pb-6">
    {activeBook ? <BookDetailView
      book={activeBook}
      transactions={transactions}
      onBackToDashboard={onBackToDashboard}
      onOpenCashInModal={() => onOpenCashIn(activeBook)}
      onOpenCashOutModal={() => onOpenCashOut(activeBook)}
      onDeleteTransaction={onDeleteTransaction}
      onOpenExport={onOpenExport}
    /> : <DashboardView
      books={books}
      transactions={transactions}
      onSelectBook={onSelectBook}
      onOpenAddBookModal={onOpenAddBook}
      onQuickCashIn={onOpenCashIn}
      onQuickCashOut={onOpenCashOut}
      onRenameBook={onRenameBook}
      onRequestDeleteBook={onRequestDeleteBook}
      onAddMembers={onAddMembers}
      onOpenImportBookModal={onOpenImport}
    />}
  </main>;
}
