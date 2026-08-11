import React, { useState } from 'react';
import { Book, Transaction, TransactionType } from './types';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { BookDetailView } from './components/BookDetailView';
import { AddBookModal } from './components/AddBookModal';
import { TransactionModal } from './components/TransactionModal';
import { CashBookSidebar } from './components/Sidebar';
import { useCloudSnapshot } from '../../hooks/useCloudSnapshot';
import { useAndroidBackHandler } from '../../hooks/useAndroidBackButton';
import { showAppToast } from '../../lib/mobile';
import { ImportBookModal } from './components/ImportBookModal';
import { RenameBookModal } from './components/RenameBookModal';
import { DeleteBookModal } from './components/DeleteBookModal';
import { AddMembersModal } from './components/AddMembersModal';

export default function App() {
  const [books, setBooks] = useCloudSnapshot<Book[]>('cash_book', 'books', []);
  const [transactions, setTransactions] = useCloudSnapshot<Transaction[]>('cash_book', 'transactions', []);

  // Active Selected Book (null = Dashboard, string = Book Detail View)
  const [activeBookId, setActiveBookId] = useState<string | null>(null);

  // Modals state
  const [isAddBookOpen, setIsAddBookOpen] = useState<boolean>(false);
  const [isImportBookOpen, setIsImportBookOpen] = useState(false);
  const [bookToRename, setBookToRename] = useState<Book | null>(null);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);
  const [bookForMembers, setBookForMembers] = useState<Book | null>(null);
  const [transactionModalType, setTransactionModalType] = useState<TransactionType | null>(null);
  const [targetBookForTransaction, setTargetBookForTransaction] = useState<Book | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);

  useAndroidBackHandler(() => {
    if (transactionModalType) {
      setTransactionModalType(null);
      setTargetBookForTransaction(null);
      return true;
    }
    if (isAddBookOpen) {
      setIsAddBookOpen(false);
      return true;
    }
    if (isImportBookOpen || bookToRename || bookToDelete || bookForMembers) {
      setIsImportBookOpen(false);
      setBookToRename(null);
      setBookToDelete(null);
      setBookForMembers(null);
      return true;
    }
    if (isSidebarOpen && window.innerWidth < 1024) {
      setIsSidebarOpen(false);
      return true;
    }
    if (activeBookId) {
      setActiveBookId(null);
      return true;
    }
    return false;
  }, [transactionModalType, isAddBookOpen, isImportBookOpen, bookToRename, bookToDelete, bookForMembers, isSidebarOpen, activeBookId]);

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
    const book = books.find((item) => item.id === bookId);
    if (!book) return;
    setBooks(prev => prev.filter(b => b.id !== bookId));
    setTransactions(prev => prev.filter(t => t.bookId !== bookId));
    if (activeBookId === bookId) {
      setActiveBookId(null);
    }
    setBookToDelete(null);
    showAppToast(`${book.name} deleted`);
  };

  const handleRenameBook = (bookId: string, name: string) => {
    setBooks(prev => prev.map(book => book.id === bookId ? { ...book, name, updatedAt: new Date().toISOString() } : book));
    setBookToRename(null);
  };

  const handleImportBooks = (importedBooks: Array<{ book: Omit<Book, 'id' | 'createdAt' | 'updatedAt'>; transactions: Omit<Transaction, 'id' | 'bookId' | 'createdAt'>[] }>) => {
    const now = new Date().toISOString();
    const newBooks = importedBooks.map(({ book }) => ({ ...book, id: `book-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: now, updatedAt: now }));
    const newTransactions = importedBooks.flatMap(({ transactions }, index) => transactions.map((transaction, txIndex) => ({
      ...transaction,
      id: `tx-import-${Date.now()}-${index}-${txIndex}`,
      bookId: newBooks[index].id,
      createdAt: now,
    })));
    setBooks(prev => [...newBooks, ...prev]);
    setTransactions(prev => [...newTransactions, ...prev]);
    setIsImportBookOpen(false);
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
    setTransactions(prev => prev.filter(t => t.id !== txId));
  };

  return (
    <div className="min-h-screen bg-[#F7F5EE] text-[#18181B] flex flex-col font-sans">
      {/* Top Header Bar */}
      <Header
        activeBookName={activeBook?.name}
        totalBooksCount={books.length}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(value => !value)}
      />

      <div className="flex flex-1 min-h-0">
        {isSidebarOpen && <div className="hidden lg:block shrink-0"><CashBookSidebar bookCount={books.length} onClose={() => setIsSidebarOpen(false)} /></div>}
        {isSidebarOpen && <div className="lg:hidden fixed inset-0 z-[100] flex"><button aria-label="Close Cash Book menu" onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/40" /><div className="relative z-10 h-full w-56 shadow-2xl"><CashBookSidebar bookCount={books.length} onClose={() => setIsSidebarOpen(false)} /></div></div>}
        <main className="flex-1 min-w-0">
          {activeBookId && activeBook ? (
            <BookDetailView
              book={activeBook}
              transactions={transactions}
              onBackToDashboard={() => setActiveBookId(null)}
              onOpenCashInModal={() => handleOpenCashInModal(activeBook)}
              onOpenCashOutModal={() => handleOpenCashOutModal(activeBook)}
              onDeleteTransaction={handleDeleteTransaction}
            />
          ) : (
            <DashboardView
              books={books}
              transactions={transactions}
              onSelectBook={(bookId) => setActiveBookId(bookId)}
              onOpenAddBookModal={() => setIsAddBookOpen(true)}
              onQuickCashIn={(b) => handleOpenCashInModal(b)}
              onQuickCashOut={(b) => handleOpenCashOutModal(b)}
              onRenameBook={setBookToRename}
              onRequestDeleteBook={setBookToDelete}
              onAddMembers={setBookForMembers}
              onOpenImportBookModal={() => setIsImportBookOpen(true)}
            />
          )}
        </main>
      </div>

      {/* Add New Book Modal */}
      <AddBookModal
        isOpen={isAddBookOpen}
        onClose={() => setIsAddBookOpen(false)}
        onSave={handleCreateBook}
      />

      <RenameBookModal
        book={bookToRename}
        onClose={() => setBookToRename(null)}
        onSave={handleRenameBook}
      />

      <DeleteBookModal
        book={bookToDelete}
        onClose={() => setBookToDelete(null)}
        onConfirm={handleDeleteBook}
      />

      <AddMembersModal
        book={bookForMembers}
        onClose={() => setBookForMembers(null)}
      />

      <ImportBookModal
        isOpen={isImportBookOpen}
        onClose={() => setIsImportBookOpen(false)}
        onImport={handleImportBooks}
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
