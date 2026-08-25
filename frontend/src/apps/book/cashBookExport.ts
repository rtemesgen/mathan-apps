import type { Book, Transaction } from './types';
import type { ExportBuildOptions, ExportReportDefinition } from '../../lib/exports/exportTypes';

type CashBookExportData = { books: Book[]; transactions: Transaction[] };
const money = (value: number) => value.toFixed(2);
const inRange = (date: string, options: ExportBuildOptions) => (!options.startDate || date >= options.startDate) && (!options.endDate || date <= options.endDate);

export function buildCashBookExportReports(data: CashBookExportData): ExportReportDefinition[] {
  const booksById = new Map(data.books.map((book) => [book.id, book]));
  const filtered = (options: ExportBuildOptions) => data.transactions.filter((tx) => (!options.entityId || tx.bookId === options.entityId) && inRange(tx.dateTime.slice(0, 10), options));
  const summaryRows = (options: ExportBuildOptions) => data.books.filter((book) => !options.entityId || book.id === options.entityId).map((book) => {
    const rows = filtered({ ...options, entityId: book.id });
    const totalIn = rows.filter((tx) => tx.type === 'in').reduce((sum, tx) => sum + tx.amount, 0);
    const totalOut = rows.filter((tx) => tx.type === 'out').reduce((sum, tx) => sum + tx.amount, 0);
    return [book.name, rows.length, money(totalIn), money(totalOut), money(totalIn - totalOut)];
  });
  const transactionRows = (options: ExportBuildOptions) => filtered(options).sort((a, b) => b.dateTime.localeCompare(a.dateTime)).map((tx) => [tx.dateTime, booksById.get(tx.bookId)?.name ?? 'Unknown book', tx.type === 'in' ? 'Cash in' : 'Cash out', money(tx.amount), tx.category ?? '', tx.remark, tx.paymentMode ?? '']);
  const definition = (id: string, label: string, description: string, detailed = false): ExportReportDefinition => ({ id, label, description, build: (options) => { const rows = detailed ? transactionRows(options) : summaryRows(options); return { title: `Cash Book ${label}`, filename: `cash-book-${id}`, headers: detailed ? ['Date', 'Book', 'Type', 'Amount', 'Category', 'Remark', 'Payment mode'] : ['Book', 'Entries', 'Cash in', 'Cash out', 'Balance'], rows, lines: rows.map((row) => row.join(' | ')) }; } });
  return [definition('books-summary', 'Books summary', 'Balances and totals for every Cash Book'), definition('complete-statement', 'Complete statement', 'All books with their cash movement', true), definition('cash-in-out', 'Cash-in and cash-out', 'Every incoming and outgoing entry', true), definition('transactions-by-book', 'Transactions per book', 'Detailed entries grouped by book', true)];
}
