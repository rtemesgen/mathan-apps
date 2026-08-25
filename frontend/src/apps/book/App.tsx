import React, { useState } from 'react';
import { Book, Transaction, TransactionType } from './types';
import { Header } from './components/Header';
import { CashBookViewContent } from './components/CashBookViewContent';
import { AddBookModal } from './components/AddBookModal';
import { TransactionModal } from './components/TransactionModal';
import { CashBookSidebar } from './components/Sidebar';
import { useAndroidBackHandler } from '../../hooks/useAndroidBackButton';
import { ImportBookModal } from './components/ImportBookModal';
import { RenameBookModal } from './components/RenameBookModal';
import { DeleteBookModal } from './components/DeleteBookModal';
import { AddMembersModal } from './components/AddMembersModal';
import { useCashBookRepository } from './cashBookRepository';
import { ExportDialog } from '../../components/ExportDialog';
import { buildCashBookExportReports } from './cashBookExport';
import { useAuth } from '../../auth/AuthProvider';

export default function App() {
  const { workspace } = useAuth();
  const { books: [books], transactions: [transactions], actions } = useCashBookRepository();


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
  const [exportOpen, setExportOpen] = useState(false);

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
  const handleCreateBook = async (bookData: Omit<Book, 'id' | 'createdAt' | 'updatedAt'>) => {
    const { data: newBook } = await actions.createBook(bookData);
    // Automatically select & enter the newly created book!
    setActiveBookId(newBook.id);
  };

  // Delete Book Handler
  const handleDeleteBook = async (bookId: string) => {
    const book = books.find((item) => item.id === bookId);
    if (!book) return;
    await actions.deleteBook(bookId);
    if (activeBookId === bookId) {
      setActiveBookId(null);
    }
    setBookToDelete(null);
  };

  const handleRenameBook = async (bookId: string, name: string) => {
    const book = books.find((item) => item.id === bookId);
    if (book) await actions.renameBook(bookId, name);
    setBookToRename(null);
  };

  const handleImportBooks = async (importedBooks: Array<{ book: Omit<Book, 'id' | 'createdAt' | 'updatedAt'>; transactions: Omit<Transaction, 'id' | 'bookId' | 'createdAt'>[] }>) => {
    await actions.importBooks(importedBooks);
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
  const handleSaveTransaction = async (data: {
    amount: number;
    remark: string;
    category: string;
    paymentMode: 'Cash' | 'Bank Transfer' | 'UPI / Online' | 'Cheque';
    dateTime: string;
    attachmentUrl?: string;
    attachmentName?: string;
  }) => {
    if (!targetBookForTransaction || !transactionModalType) return;

    await actions.createTransaction(targetBookForTransaction.id, transactionModalType, data);
  };

  // Delete Transaction Handler
  const handleDeleteTransaction = async (txId: string) => {
    await actions.deleteTransaction(txId);
  };

  return (
    <div className="erp-app min-h-screen bg-[#f8f6f0] text-[#1c1d1f] flex flex-col font-sans">
      {/* Top Header Bar */}
      <Header
        activeBookName={activeBook?.name}
        totalBooksCount={books.length}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(value => !value)}
        onOpenExport={() => setExportOpen(true)}
      />

      <div className="flex flex-1 min-h-0">
        {isSidebarOpen && <div className="hidden lg:block shrink-0"><CashBookSidebar bookCount={books.length} onClose={() => setIsSidebarOpen(false)} /></div>}
        {isSidebarOpen && <div className="lg:hidden fixed inset-0 z-[100] flex"><button aria-label="Close Cash Book menu" onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 z-0 bg-black/40" /><div className="mobile-sidebar-drawer relative z-10 h-[100dvh] max-h-[100dvh] w-72 overflow-y-auto overscroll-contain shadow-2xl"><CashBookSidebar bookCount={books.length} onClose={() => setIsSidebarOpen(false)} /></div></div>}
        <CashBookViewContent
          books={books}
          transactions={transactions}
          activeBook={activeBook}
          onSelectBook={setActiveBookId}
          onBackToDashboard={() => setActiveBookId(null)}
          onOpenAddBook={() => setIsAddBookOpen(true)}
          onOpenCashIn={handleOpenCashInModal}
          onOpenCashOut={handleOpenCashOutModal}
          onRenameBook={setBookToRename}
          onRequestDeleteBook={setBookToDelete}
          onAddMembers={setBookForMembers}
          onOpenImport={() => setIsImportBookOpen(true)}
          onDeleteTransaction={handleDeleteTransaction}
        />
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
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} context={{ companyName: workspace?.name ?? 'Company', appName: 'Cash Book', reportName: activeBook ? `Current Book Report — ${activeBook.name}` : 'Cash Book Summary', report: buildCashBookExportReports({ books, transactions })[activeBook ? 1 : 0], selectedEntity: activeBook ? { value: activeBook.id, label: activeBook.name } : undefined, activeFilters: activeBook ? { entityId: activeBook.id } : undefined, availableEntities: activeBook ? undefined : books.map(book => ({ value: book.id, label: book.name })) }} />

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
