import type { Book, Transaction } from './types';
import type { PersistenceState, RepositoryResult } from '../../lib/repositories/types';
import { useSnapshotRepository } from '../../lib/repositories/useSnapshotRepository';

export type NewBook = Omit<Book, 'id' | 'createdAt' | 'updatedAt'>;
export type NewTransaction = Omit<Transaction, 'id' | 'bookId' | 'createdAt' | 'type'>;
type Persist<T> = (next: T) => Promise<PersistenceState>;
export type CashBookImport = { book: NewBook; transactions: Omit<Transaction, 'id' | 'bookId' | 'createdAt'>[] };

/** Cash Book repository adapter: domain operations and their snapshot-backed persistence stay together. */
export function useCashBookRepository() {
  const books = useSnapshotRepository<Book[]>('cash_book', 'books', []);
  const transactions = useSnapshotRepository<Transaction[]>('cash_book', 'transactions', []);
  const persistBooks = books[4];
  const persistTransactions = transactions[4];
  return {
    books,
    transactions,
    actions: {
      createBook: (input: Parameters<typeof saveNewBook>[0]) => saveNewBook(input, books[0], persistBooks),
      renameBook: (bookId: string, name: string) => {
        const book = books[0].find((item) => item.id === bookId);
        return book ? saveRenamedBook(book, name, books[0], persistBooks) : Promise.resolve(undefined);
      },
      deleteBook: (bookId: string) => saveRemovedBook(bookId, books[0], transactions[0], persistBooks, persistTransactions),
      createTransaction: (bookId: string, type: Transaction['type'], input: Parameters<typeof saveNewTransactionAndTouchBook>[2]) => saveNewTransactionAndTouchBook(bookId, type, input, transactions[0], books[0], persistTransactions, persistBooks),
      deleteTransaction: (transactionId: string) => saveRemovedTransaction(transactionId, transactions[0], persistTransactions),
      importBooks: (input: CashBookImport[]) => saveImportedBooks(input, books[0], transactions[0], persistBooks, persistTransactions),
    },
  };
}

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;


export function createBook(input: NewBook, timestamp = now()): RepositoryResult<Book> {
  return { data: { ...input, id: id('book'), createdAt: timestamp, updatedAt: timestamp }, persistence: 'saving' };
}

export function renameBook(book: Book, name: string, timestamp = now()): RepositoryResult<Book> {
  return { data: { ...book, name, updatedAt: timestamp }, persistence: 'saving' };
}

export function createTransaction(bookId: string, type: Transaction['type'], input: NewTransaction, timestamp = now()): RepositoryResult<Transaction> {
  return { data: { ...input, type, id: id('tx'), bookId, createdAt: timestamp }, persistence: 'saving' };
}

export function removeBook(bookId: string, books: Book[], transactions: Transaction[]): RepositoryResult<{ books: Book[]; transactions: Transaction[] }> {
  return { data: { books: books.filter((book) => book.id !== bookId), transactions: transactions.filter((transaction) => transaction.bookId !== bookId) }, persistence: 'saving' };
}

export function removeTransaction(transactionId: string, transactions: Transaction[]): RepositoryResult<Transaction[]> {
  return { data: transactions.filter((transaction) => transaction.id !== transactionId), persistence: 'saving' };
}

/** Domain operations persist through the shared snapshot adapter only after their next state is complete. */
export async function saveNewBook(input: NewBook, books: Book[], persistBooks: Persist<Book[]>) {
  const result = createBook(input);
  return { ...result, persistence: await persistBooks([result.data, ...books]) };
}

export async function saveRenamedBook(book: Book, name: string, books: Book[], persistBooks: Persist<Book[]>) {
  const result = renameBook(book, name);
  return { ...result, persistence: await persistBooks(books.map((item) => item.id === book.id ? result.data : item)) };
}

export async function saveNewTransaction(bookId: string, type: Transaction['type'], input: NewTransaction, transactions: Transaction[], persistTransactions: Persist<Transaction[]>) {
  const result = createTransaction(bookId, type, input);
  return { ...result, persistence: await persistTransactions([result.data, ...transactions]) };
}

export async function saveNewTransactionAndTouchBook(bookId: string, type: Transaction['type'], input: NewTransaction, transactions: Transaction[], books: Book[], persistTransactions: Persist<Transaction[]>, persistBooks: Persist<Book[]>) {
  const transactionResult = createTransaction(bookId, type, input);
  const persistence = await persistTransactions([transactionResult.data, ...transactions]);
  await persistBooks(books.map((book) => book.id === bookId ? { ...book, updatedAt: now() } : book));
  return { ...transactionResult, persistence };
}

export async function saveRemovedBook(bookId: string, books: Book[], transactions: Transaction[], persistBooks: Persist<Book[]>, persistTransactions: Persist<Transaction[]>) {
  const result = removeBook(bookId, books, transactions);
  await persistBooks(result.data.books);
  const persistence = await persistTransactions(result.data.transactions);
  return { ...result, persistence };
}

export async function saveRemovedTransaction(transactionId: string, transactions: Transaction[], persistTransactions: Persist<Transaction[]>) {
  const result = removeTransaction(transactionId, transactions);
  return { ...result, persistence: await persistTransactions(result.data) };
}

export async function saveImportedBooks(importedBooks: CashBookImport[], books: Book[], transactions: Transaction[], persistBooks: Persist<Book[]>, persistTransactions: Persist<Transaction[]>) {
  const timestamp = now();
  const newBooks = importedBooks.map(({ book }, index) => ({ ...book, id: `book-import-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`, createdAt: timestamp, updatedAt: timestamp }));
  const newTransactions = importedBooks.flatMap(({ transactions: importedTransactions }, index) => importedTransactions.map((transaction, transactionIndex) => ({
    ...transaction,
    id: `tx-import-${Date.now()}-${index}-${transactionIndex}-${Math.random().toString(36).slice(2, 7)}`,
    bookId: newBooks[index].id,
    createdAt: timestamp,
  })));
  await persistBooks([...newBooks, ...books]);
  const persistence = await persistTransactions([...newTransactions, ...transactions]);
  return { data: { books: [...newBooks, ...books], transactions: [...newTransactions, ...transactions] }, persistence };
}
