import type { Book, Transaction } from './types';
import type { RepositoryResult } from '../../lib/repositories/types';

export type NewBook = Omit<Book, 'id' | 'createdAt' | 'updatedAt'>;
export type NewTransaction = Omit<Transaction, 'id' | 'bookId' | 'createdAt' | 'type'>;

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
