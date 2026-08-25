import type { Book, Transaction } from './types';
import type { ExportBuildOptions, ExportReportDefinition } from '../../lib/exports/exportTypes';
import { formatExportNumber } from '../../lib/exports/numberFormatting';

type CashBookExportData = { books: Book[]; transactions: Transaction[] };
const money = formatExportNumber;
const inRange = (date: string, options: ExportBuildOptions) => (!options.startDate || date >= options.startDate) && (!options.endDate || date <= options.endDate);

export function buildCashBookExportReports(data: CashBookExportData): ExportReportDefinition[] {
  const booksById = new Map(data.books.map((book) => [book.id, book]));
  const filtered = (options: ExportBuildOptions) => data.transactions.filter((tx) => { const query = options.query?.trim().toLowerCase(); const text = `${tx.remark} ${tx.category ?? ''} ${tx.paymentMode ?? ''}`.toLowerCase(); return (!options.entityId || tx.bookId === options.entityId) && (!options.transactionType || tx.type === options.transactionType) && (!query || text.includes(query)) && inRange(tx.dateTime.slice(0, 10), options); });
  const cashSummary = (options: ExportBuildOptions) => {
    const scope = (tx: Transaction) => !options.entityId || tx.bookId === options.entityId;
    const allInScope = data.transactions.filter(scope);
    const startingBalance = data.books.filter((book) => !options.entityId || book.id === options.entityId).reduce((sum, book) => sum + (book.openingBalance ?? 0), 0);
    const priorMovement = options.startDate ? allInScope.filter((tx) => tx.dateTime.slice(0, 10) < options.startDate!).reduce((sum, tx) => sum + (tx.type === 'in' ? tx.amount : -tx.amount), 0) : 0;
    const opening = startingBalance + priorMovement;
    const rows = filtered(options).sort((a, b) => a.dateTime.localeCompare(b.dateTime));
    const totalIn = rows.filter((tx) => tx.type === 'in').reduce((sum, tx) => sum + tx.amount, 0);
    const totalOut = rows.filter((tx) => tx.type === 'out').reduce((sum, tx) => sum + tx.amount, 0);
    return { opening, totalIn, totalOut, closing: opening + totalIn - totalOut, rows };
  };
  const summaryRows = (options: ExportBuildOptions) => data.books.filter((book) => !options.entityId || book.id === options.entityId).map((book) => {
    const rows = filtered({ ...options, entityId: book.id });
    const totalIn = rows.filter((tx) => tx.type === 'in').reduce((sum, tx) => sum + tx.amount, 0);
    const totalOut = rows.filter((tx) => tx.type === 'out').reduce((sum, tx) => sum + tx.amount, 0);
    return [book.name, rows.length, money(totalIn), money(totalOut), money((book.openingBalance ?? 0) + totalIn - totalOut)];
  });
  const transactionRows = (options: ExportBuildOptions) => filtered(options).sort((a, b) => b.dateTime.localeCompare(a.dateTime)).map((tx) => [tx.dateTime, booksById.get(tx.bookId)?.name ?? 'Unknown book', tx.type === 'in' ? 'Cash in' : 'Cash out', money(tx.amount), tx.category ?? '', tx.remark, tx.paymentMode ?? '']);
  const statementRows = (options: ExportBuildOptions) => {
    const summary = cashSummary(options);
    let balance = summary.opening;
    const rows: Array<Array<string | number>> = [['Opening balance', '', '', '', '', '', money(balance)]];
    summary.rows.forEach((tx) => {
      balance += tx.type === 'in' ? tx.amount : -tx.amount;
      rows.push([tx.dateTime, tx.remark, tx.category ?? '', tx.paymentMode ?? '', tx.type === 'in' ? money(tx.amount) : '', tx.type === 'out' ? money(tx.amount) : '', money(balance)]);
    });
    rows.push(['Final balance', '', '', '', '', '', money(summary.closing)]);
    return { rows, summary: [
      { label: 'Opening balance', value: money(summary.opening) },
      { label: 'Total cash in', value: money(summary.totalIn), tone: 'positive' as const },
      { label: 'Total cash out', value: money(summary.totalOut), tone: 'negative' as const },
      { label: 'Final balance', value: money(summary.closing) },
    ] };
  };
  const definition = (id: string, label: string, description: string, detailed = false): ExportReportDefinition => ({ id, label, description, build: (options) => { const useSummary = !detailed || options.detail === 'condensed'; const statement = detailed && options.entityId ? statementRows(options) : null; const rows = statement ? statement.rows : useSummary ? summaryRows(options) : transactionRows(options); return { title: `Cash Book ${label}`, filename: `cash-book-${id}`, headers: statement ? ['Date', 'Remark', 'Category', 'Mode', 'Cash in', 'Cash out', 'Balance'] : useSummary ? ['Book', 'Entries', 'Cash in', 'Cash out', 'Balance'] : ['Date', 'Book', 'Type', 'Amount', 'Category', 'Remark', 'Payment mode'], rows, summary: statement?.summary, lines: rows.map((row) => row.join(' | ')) }; } });
  return [definition('books-summary', 'Books summary', 'Balances and totals for every Cash Book'), definition('complete-statement', 'Complete statement', 'All books with their cash movement', true), definition('cash-in-out', 'Cash-in and cash-out', 'Every incoming and outgoing entry', true), definition('transactions-by-book', 'Transactions per book', 'Detailed entries grouped by book', true)];
}
