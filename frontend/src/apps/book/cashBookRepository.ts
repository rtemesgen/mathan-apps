import type { Book, Transaction } from './types';
import type { PersistenceState, RepositoryResult } from '../../lib/repositories/types';
import { useSnapshotRepository } from '../../lib/repositories/useSnapshotRepository';

export type NewBook = Omit<Book, 'id' | 'createdAt' | 'updatedAt'>;
export type BookUpdate = Pick<Book, 'name' | 'openingBalance'>;
export type NewTransaction = Omit<Transaction, 'id' | 'bookId' | 'createdAt' | 'type'>;
type Persist<T> = (next: T) => Promise<PersistenceState>;
type PersistUpdate<T> = (update: (current: T) => T) => Promise<PersistenceState>;
export type CashBookImport = { book: NewBook; transactions: Omit<Transaction, 'id' | 'bookId' | 'createdAt'>[] };
export type CashBookState = { books: Book[]; transactions: Transaction[] };

export function combineLegacyCashBookSnapshots(values: Record<string, unknown>): CashBookState {
  const books = Array.isArray(values.books) ? values.books as Book[] : [];
  const transactions = Array.isArray(values.transactions) ? values.transactions as Transaction[] : [];
  const knownIds = new Set(books.map((book) => book.id));
  const recovered = [...new Set(transactions.map((transaction) => transaction.bookId).filter((bookId) => bookId && !knownIds.has(bookId)))].map((bookId) => {
    const rows = transactions.filter((transaction) => transaction.bookId === bookId);
    const createdAt = rows.map((row) => row.createdAt || row.dateTime).sort()[0] || new Date(0).toISOString();
    const updatedAt = rows.map((row) => row.dateTime || row.createdAt).sort().at(-1) || createdAt;
    return { id: bookId, name: 'Recovered Cash Book', currency: '$', category: 'Recovered', createdAt, updatedAt } satisfies Book;
  });
  return { books: [...books, ...recovered], transactions };
}

export function mergeCashBookStates(current: CashBookState, legacy: CashBookState): CashBookState {
  const legacyBooks = new Map(legacy.books.map((book) => [book.id, book]));
  const books = [
    ...current.books.map((book) => book.category === 'Recovered' && legacyBooks.has(book.id) ? legacyBooks.get(book.id)! : book),
    ...legacy.books.filter((candidate) => !current.books.some((book) => book.id === candidate.id)),
  ];
  const transactions = [...current.transactions, ...legacy.transactions.filter((candidate) => !current.transactions.some((transaction) => transaction.id === candidate.id))];
  return combineLegacyCashBookSnapshots({ books, transactions });
}

const emptyCashBookState: CashBookState = { books: [], transactions: [] };
const cashBookLegacy = { keys: ['books', 'transactions'], combine: combineLegacyCashBookSnapshots, merge: mergeCashBookStates };

/** Cash Book repository adapter: domain operations and their snapshot-backed persistence stay together. */
export function useCashBookRepository() {
  const state = useSnapshotRepository<CashBookState>('cash_book', 'state', emptyCashBookState, cashBookLegacy);
  const [current, , ready, status, , updateState] = state;
  // Compatibility tuples keep view code simple while every mutation below is
  // committed as one parent+entries snapshot and one outbox operation.
  const updateBooks = (update: (books: Book[]) => Book[]) => updateState((value) => ({ ...value, books: update(value.books) }));
  const updateTransactions = (update: (transactions: Transaction[]) => Transaction[]) => updateState((value) => ({ ...value, transactions: update(value.transactions) }));
  const books = [current.books, undefined, ready, status] as const;
  const transactions = [current.transactions, undefined, ready, status] as const;
  return {
    books,
    transactions,
    actions: {
      createBook: async (input: Parameters<typeof saveNewBook>[0]) => {
        const result = createBook(input);
        const persistence = await updateState((value) => ({ ...value, books: [result.data, ...value.books] }));
        return { ...result, persistence };
      },
      renameBook: (bookId: string, name: string) => {
        const book = books[0].find((item) => item.id === bookId);
        if (!book) return Promise.resolve(undefined);
        const result = renameBook(book, name);
        return updateState((value) => ({ ...value, books: value.books.map((item) => item.id === bookId ? result.data : item) })).then((persistence) => ({ ...result, persistence }));
      },
      updateBook: (bookId: string, changes: BookUpdate) => {
        const book = books[0].find((item) => item.id === bookId);
        if (!book) return Promise.resolve(undefined);
        const result = updateBook(book, changes);
        return updateState((value) => ({ ...value, books: value.books.map((item) => item.id === bookId ? result.data : item) })).then((persistence) => ({ ...result, persistence }));
      },
      deleteBook: async (bookId: string) => {
        const result = removeBook(bookId, current.books, current.transactions);
        const persistence = await updateState((value) => ({ books: value.books.filter((book) => book.id !== bookId), transactions: value.transactions.filter((transaction) => transaction.bookId !== bookId) }));
        return { ...result, persistence };
      },
      createTransaction: async (bookId: string, type: Transaction['type'], input: Parameters<typeof saveNewTransactionAndTouchBook>[2]) => {
        if (!current.books.some((book) => book.id === bookId)) throw new Error('The Cash Book for this transaction is not available locally.');
        const result = createTransaction(bookId, type, input);
        const touchedAt = now();
        const persistence = await updateState((value) => ({ books: value.books.map((book) => book.id === bookId ? { ...book, updatedAt: touchedAt } : book), transactions: [result.data, ...value.transactions] }));
        return { ...result, persistence };
      },
      deleteTransaction: async (transactionId: string) => {
        const result = removeTransaction(transactionId, current.transactions);
        const persistence = await updateState((value) => ({ ...value, transactions: value.transactions.filter((transaction) => transaction.id !== transactionId) }));
        return { ...result, persistence };
      },
      importBooks: async (input: CashBookImport[]) => {
        const timestamp = now();
        const importedBooks = input.map(({ book }) => ({ ...book, id: crypto.randomUUID(), createdAt: timestamp, updatedAt: timestamp }));
        const importedTransactions = input.flatMap(({ transactions: rows }, index) => rows.map((transaction) => ({ ...transaction, id: crypto.randomUUID(), bookId: importedBooks[index].id, createdAt: timestamp })));
        const persistence = await updateState((value) => ({ books: [...importedBooks, ...value.books], transactions: [...importedTransactions, ...value.transactions] }));
        return { data: { books: [...importedBooks, ...current.books], transactions: [...importedTransactions, ...current.transactions] }, persistence };
      },
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
