import { useSnapshotRepository } from '../../lib/repositories/useSnapshotRepository';
import type { Book, Transaction } from './types';
import { saveImportedBooks, saveNewBook, saveNewTransactionAndTouchBook, saveRemovedBook, saveRemovedTransaction, saveRenamedBook, type CashBookImport } from './cashBookRepository';

/** React adapter for Cash Book persistence; storage and sync remain in shared infrastructure. */
export function useCashBookRepository() {
  const books = useSnapshotRepository<Book[]>('cash_book', 'books', []);
  const transactions = useSnapshotRepository<Transaction[]>('cash_book', 'transactions', []);
  const saveBooks = books[4];
  const saveTransactions = transactions[4];
  return {
    books,
    transactions,
    actions: {
      createBook: (input: Parameters<typeof saveNewBook>[0]) => saveNewBook(input, books[0], saveBooks),
      renameBook: (bookId: string, name: string) => {
        const book = books[0].find((item) => item.id === bookId);
        return book ? saveRenamedBook(book, name, books[0], saveBooks) : Promise.resolve(undefined);
      },
      deleteBook: (bookId: string) => saveRemovedBook(bookId, books[0], transactions[0], saveBooks, saveTransactions),
      createTransaction: (bookId: string, type: Transaction['type'], input: Parameters<typeof saveNewTransactionAndTouchBook>[2]) => saveNewTransactionAndTouchBook(bookId, type, input, transactions[0], books[0], saveTransactions, saveBooks),
      deleteTransaction: (transactionId: string) => saveRemovedTransaction(transactionId, transactions[0], saveTransactions),
      importBooks: (input: CashBookImport[]) => saveImportedBooks(input, books[0], transactions[0], saveBooks, saveTransactions),
    },
  };
}
