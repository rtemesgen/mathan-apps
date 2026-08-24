import type { Book, Transaction } from './types';
import type { PersistenceState, RepositoryResult } from '../../lib/repositories/types';

export type NewBook = Omit<Book, 'id' | 'createdAt' | 'updatedAt'>;
export type NewTransaction = Omit<Transaction, 'id' | 'bookId' | 'createdAt' | 'type'>;
type Persist<T> = (next: T) => Promise<PersistenceState>;

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
