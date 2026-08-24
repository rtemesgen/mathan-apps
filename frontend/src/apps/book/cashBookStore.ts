import { useCloudSnapshot } from '../../hooks/useCloudSnapshot';
import type { Book, Transaction } from './types';

/** React adapter for Cash Book persistence; storage and sync remain in shared infrastructure. */
export function useCashBookRepository() {
  const books = useCloudSnapshot<Book[]>('cash_book', 'books', []);
  const transactions = useCloudSnapshot<Transaction[]>('cash_book', 'transactions', []);
  return { books, transactions };
}
