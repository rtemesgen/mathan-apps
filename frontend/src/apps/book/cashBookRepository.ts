import type { Book, Transaction } from './types';
import type { PersistenceState, RepositoryResult } from '../../lib/repositories/types';
import { useSnapshotRepository } from '../../lib/repositories/useSnapshotRepository';

export type NewBook = Omit<Book, 'id' | 'createdAt' | 'updatedAt'>;
export type BookUpdate = Pick<Book, 'name' | 'openingBalance'>;
export type NewTransaction = Omit<Transaction, 'id' | 'bookId' | 'createdAt' | 'type'>;
type Persist<T> = (next: T) => Promise<PersistenceState>;
type PersistUpdate<T> = (update: (current: T) => T) => Promise<PersistenceState>;
export type CashBookImport = { book: NewBook; transactions: Omit<Transaction, 'id' | 'bookId' | 'createdAt'>[] };

/** Cash Book repository adapter: domain operations and their snapshot-backed persistence stay together. */
export function useCashBookRepository() {
  const books = useSnapshotRepository<Book[]>('cash_book', 'books', []);
  const transactions = useSnapshotRepository<Transaction[]>('cash_book', 'transactions', []);
  const persistBooks = books[4];
  const persistTransactions = transactions[4];
  const updateBooks = books[5];
  const updateTransactions = transactions[5];
  return {
    books,
    transactions,
    actions: {
      createBook: (input: Parameters<typeof saveNewBook>[0]) => saveNewBook(input, books[0], persistBooks, updateBooks),
      renameBook: (bookId: string, name: string) => {
        const book = books[0].find((item) => item.id === bookId);
        return book ? saveRenamedBook(book, name, books[0], persistBooks, updateBooks) : Promise.resolve(undefined);
      },
      updateBook: (bookId: string, changes: BookUpdate) => {
        const book = books[0].find((item) => item.id === bookId);
        return book ? saveUpdatedBook(book, changes, books[0], persistBooks, updateBooks) : Promise.resolve(undefined);
      },
      deleteBook: (bookId: string) => saveRemovedBook(bookId, books[0], transactions[0], persistBooks, persistTransactions, updateBooks, updateTransactions),
      createTransaction: (bookId: string, type: Transaction['type'], input: Parameters<typeof saveNewTransactionAndTouchBook>[2]) => saveNewTransactionAndTouchBook(bookId, type, input, transactions[0], books[0], persistTransactions, persistBooks, updateTransactions, updateBooks),
      deleteTransaction: (transactionId: string) => saveRemovedTransaction(transactionId, transactions[0], persistTransactions, updateTransactions),
      importBooks: (input: CashBookImport[]) => saveImportedBooks(input, books[0], transactions[0], persistBooks, persistTransactions, updateBooks, updateTransactions),
    },
  };
}

const now = () => new Date().toISOString();
const id = (_prefix: string) => crypto.randomUUID();


export function createBook(input: NewBook, timestamp = now()): RepositoryResult<Book> {
  return { data: { ...input, id: id('book'), createdAt: timestamp, updatedAt: timestamp }, persistence: 'saving' };
}

export function renameBook(book: Book, name: string, timestamp = now()): RepositoryResult<Book> {
  return { data: { ...book, name, updatedAt: timestamp }, persistence: 'saving' };
}

export function updateBook(book: Book, changes: BookUpdate, timestamp = now()): RepositoryResult<Book> {
  return { data: { ...book, ...changes, openingBalance: Number(changes.openingBalance) || 0, updatedAt: timestamp }, persistence: 'saving' };
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
export async function saveNewBook(input: NewBook, books: Book[], persistBooks: Persist<Book[]>, updateBooks?: PersistUpdate<Book[]>) {
  const result = createBook(input);
  const persistence = updateBooks
    ? await updateBooks((current) => [result.data, ...current])
    : await persistBooks([result.data, ...books]);
  return { ...result, persistence };
}

export async function saveRenamedBook(book: Book, name: string, books: Book[], persistBooks: Persist<Book[]>, updateBooks?: PersistUpdate<Book[]>) {
  const result = renameBook(book, name);
  const persistence = updateBooks
    ? await updateBooks((current) => current.map((item) => item.id === book.id ? { ...item, ...result.data } : item))
    : await persistBooks(books.map((item) => item.id === book.id ? result.data : item));
  return { ...result, persistence };
}

export async function saveUpdatedBook(book: Book, changes: BookUpdate, books: Book[], persistBooks: Persist<Book[]>, updateBooks?: PersistUpdate<Book[]>) {
  const result = updateBook(book, changes);
  const persistence = updateBooks
    ? await updateBooks((current) => current.map((item) => item.id === book.id ? { ...item, ...changes, openingBalance: Number(changes.openingBalance) || 0, updatedAt: result.data.updatedAt } : item))
    : await persistBooks(books.map((item) => item.id === book.id ? result.data : item));
  return { ...result, persistence };
}

export async function saveNewTransaction(bookId: string, type: Transaction['type'], input: NewTransaction, transactions: Transaction[], persistTransactions: Persist<Transaction[]>, updateTransactions?: PersistUpdate<Transaction[]>) {
  const result = createTransaction(bookId, type, input);
  const persistence = updateTransactions
    ? await updateTransactions((current) => [result.data, ...current])
    : await persistTransactions([result.data, ...transactions]);
  return { ...result, persistence };
}

export async function saveNewTransactionAndTouchBook(bookId: string, type: Transaction['type'], input: NewTransaction, transactions: Transaction[], books: Book[], persistTransactions: Persist<Transaction[]>, persistBooks: Persist<Book[]>, updateTransactions?: PersistUpdate<Transaction[]>, updateBooks?: PersistUpdate<Book[]>) {
  const transactionResult = createTransaction(bookId, type, input);
  const persistence = updateTransactions
    ? await updateTransactions((current) => [transactionResult.data, ...current])
    : await persistTransactions([transactionResult.data, ...transactions]);
  if (updateBooks) await updateBooks((current) => current.map((book) => book.id === bookId ? { ...book, updatedAt: now() } : book));
  else await persistBooks(books.map((book) => book.id === bookId ? { ...book, updatedAt: now() } : book));
  return { ...transactionResult, persistence };
}

export async function saveRemovedBook(bookId: string, books: Book[], transactions: Transaction[], persistBooks: Persist<Book[]>, persistTransactions: Persist<Transaction[]>, updateBooks?: PersistUpdate<Book[]>, updateTransactions?: PersistUpdate<Transaction[]>) {
  const result = removeBook(bookId, books, transactions);
  if (updateBooks) await updateBooks((current) => current.filter((book) => book.id !== bookId));
  else await persistBooks(result.data.books);
  const persistence = updateTransactions
    ? await updateTransactions((current) => current.filter((transaction) => transaction.bookId !== bookId))
    : await persistTransactions(result.data.transactions);
  return { ...result, persistence };
}

export async function saveRemovedTransaction(transactionId: string, transactions: Transaction[], persistTransactions: Persist<Transaction[]>, updateTransactions?: PersistUpdate<Transaction[]>) {
  const result = removeTransaction(transactionId, transactions);
  const persistence = updateTransactions
    ? await updateTransactions((current) => current.filter((transaction) => transaction.id !== transactionId))
    : await persistTransactions(result.data);
  return { ...result, persistence };
}

export async function saveImportedBooks(importedBooks: CashBookImport[], books: Book[], transactions: Transaction[], persistBooks: Persist<Book[]>, persistTransactions: Persist<Transaction[]>, updateBooks?: PersistUpdate<Book[]>, updateTransactions?: PersistUpdate<Transaction[]>) {
  const timestamp = now();
  const newBooks = importedBooks.map(({ book }) => ({ ...book, id: crypto.randomUUID(), createdAt: timestamp, updatedAt: timestamp }));
  const newTransactions = importedBooks.flatMap(({ transactions: importedTransactions }, index) => importedTransactions.map((transaction, transactionIndex) => ({
    ...transaction,
    id: crypto.randomUUID(),
    bookId: newBooks[index].id,
    createdAt: timestamp,
  })));
  if (updateBooks) await updateBooks((current) => [...newBooks, ...current]);
  else await persistBooks([...newBooks, ...books]);
  const persistence = updateTransactions
    ? await updateTransactions((current) => [...newTransactions, ...current])
    : await persistTransactions([...newTransactions, ...transactions]);
  return { data: { books: [...newBooks, ...books], transactions: [...newTransactions, ...transactions] }, persistence };
}
