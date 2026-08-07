import React, { useState, useEffect } from 'react';
import { Book, Transaction, TransactionType } from './types';
import { INITIAL_BOOKS, INITIAL_TRANSACTIONS } from './data/initialData';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { BookDetailView } from './components/BookDetailView';
import { AddBookModal } from './components/AddBookModal';
import { TransactionModal } from './components/TransactionModal';

const BOOKS_STORAGE_KEY = 'mathan_cashbook_books_v1';
const TRANSACTIONS_STORAGE_KEY = 'mathan_cashbook_transactions_v1';

export default function App() {
  // Books state initialized from localStorage
  const [books, setBooks] = useState<Book[]>(() => {
    try {
      const saved = localStorage.getItem(BOOKS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Failed to parse books from localStorage:', e);
    }
    return INITIAL_BOOKS;
  });

  // Transactions state initialized from localStorage
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem(TRANSACTIONS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to parse transactions from localStorage:', e);
    }
    return INITIAL_TRANSACTIONS;
  });

  // Active Selected Book (null = Dashboard, string = Book Detail View)
  const [activeBookId, setActiveBookId] = useState<string | null>(null);

  // Modals state
  const [isAddBookOpen, setIsAddBookOpen] = useState<boolean>(false);
  const [transactionModalType, setTransactionModalType] = useState<TransactionType | null>(null);
  const [targetBookForTransaction, setTargetBookForTransaction] = useState<Book | null>(null);

  // Sync to LocalStorage on changes
  useEffect(() => {
    try {
      localStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify(books));
    } catch (e) {
      console.error('Failed to save books to localStorage:', e);
    }
  }, [books]);

  useEffect(() => {
    try {
      localStorage.setItem(TRANSACTIONS_STORAGE_KEY, JSON.stringify(transactions));
    } catch (e) {
      console.error('Failed to save transactions to localStorage:', e);
    }
  }, [transactions]);

  // Active book object if selected
  const activeBook = books.find(b => b.id === activeBookId) || null;

  // Add New Book Handler
  const handleCreateBook = (bookData: Omit<Book, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newBook: Book = {
      ...bookData,
      id: `book-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setBooks(prev => [newBook, ...prev]);
    // Automatically select & enter the newly created book!
    setActiveBookId(newBook.id);
  };

  // Delete Book Handler
  const handleDeleteBook = (bookId: string) => {
    if (confirm('Are you sure you want to delete this book and all its transaction records?')) {
      setBooks(prev => prev.filter(b => b.id !== bookId));
      setTransactions(prev => prev.filter(t => t.bookId !== bookId));
      if (activeBookId === bookId) {
        setActiveBookId(null);
      }
    }
  };

  // Open Cash In Modal
  const handleOpenCashInModal = (bookToTarget?: Book) => {
    const book = bookToTarget || activeBook;
    if (!book) return;
    setTargetBookForTransaction(book);
    setTransactionModalType('in');
  };

  // Open Cash Out Modal
  const handleOpenCashOutModal = (bookToTarget?: Book) => {
    const book = bookToTarget || activeBook;
    if (!book) return;
    setTargetBookForTransaction(book);
    setTransactionModalType('out');
  };

  // Save Transaction Handler
  const handleSaveTransaction = (data: {
    amount: number;
    remark: string;
    category: string;
    paymentMode: 'Cash' | 'Bank Transfer' | 'UPI / Online' | 'Cheque';
    dateTime: string;
    attachmentUrl?: string;
    attachmentName?: string;
  }) => {
    if (!targetBookForTransaction || !transactionModalType) return;

    const newTx: Transaction = {
      id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      bookId: targetBookForTransaction.id,
      type: transactionModalType,
      amount: data.amount,
      remark: data.remark,
      category: data.category,
      paymentMode: data.paymentMode,
      dateTime: data.dateTime,
      attachmentUrl: data.attachmentUrl,
      attachmentName: data.attachmentName,
      createdAt: new Date().toISOString(),
    };

    setTransactions(prev => [newTx, ...prev]);

    // Update book timestamp
    setBooks(prev => prev.map(b => b.id === targetBookForTransaction.id ? { ...b, updatedAt: new Date().toISOString() } : b));
  };

  // Delete Transaction Handler
  const handleDeleteTransaction = (txId: string) => {
    if (confirm('Delete this transaction record?')) {
      setTransactions(prev => prev.filter(t => t.id !== txId));
    }
  };

  // Reset Demo Records Handler
  const handleResetDemoData = () => {
    if (confirm('Reset all books and transactions to initial demo records?')) {
      setBooks(INITIAL_BOOKS);
      setTransactions(INITIAL_TRANSACTIONS);
      setActiveBookId(null);
      localStorage.removeItem(BOOKS_STORAGE_KEY);
      localStorage.removeItem(TRANSACTIONS_STORAGE_KEY);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F5EE] text-[#18181B] flex flex-col font-sans">
      {/* Top Header Bar */}
      <Header
        activeBookName={activeBook?.name}
        totalBooksCount={books.length}
        onGoToDashboard={() => setActiveBookId(null)}
        onResetDemoData={handleResetDemoData}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {activeBookId && activeBook ? (
          /* INSIDE A BOOK VIEW */
          <BookDetailView
            book={activeBook}
            transactions={transactions}
            onBackToDashboard={() => setActiveBookId(null)}
            onOpenCashInModal={() => handleOpenCashInModal(activeBook)}
            onOpenCashOutModal={() => handleOpenCashOutModal(activeBook)}
            onDeleteTransaction={handleDeleteTransaction}
          />
        ) : (
          /* OUTSIDE BOOKS DASHBOARD VIEW */
          <DashboardView
            books={books}
            transactions={transactions}
            onSelectBook={(bookId) => setActiveBookId(bookId)}
            onOpenAddBookModal={() => setIsAddBookOpen(true)}
            onQuickCashIn={(b) => handleOpenCashInModal(b)}
            onQuickCashOut={(b) => handleOpenCashOutModal(b)}
            onDeleteBook={handleDeleteBook}
          />
        )}
      </main>

      {/* Add New Book Modal */}
      <AddBookModal
        isOpen={isAddBookOpen}
        onClose={() => setIsAddBookOpen(false)}
        onSave={handleCreateBook}
      />

      {/* Cash In / Cash Out Transaction Modal */}
      {transactionModalType && targetBookForTransaction && (
        <TransactionModal
          isOpen={!!transactionModalType}
          type={transactionModalType}
          bookName={targetBookForTransaction.name}
          currencySymbol={targetBookForTransaction.currency}
          onClose={() => {
            setTransactionModalType(null);
            setTargetBookForTransaction(null);
          }}
          onSave={handleSaveTransaction}
        />
      )}
    </div>
  );
}
