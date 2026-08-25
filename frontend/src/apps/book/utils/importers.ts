import * as XLSX from 'xlsx';
import { Book, Transaction } from '../types';

export type ImportedBook = { book: Omit<Book, 'id' | 'createdAt' | 'updatedAt'>; transactions: Omit<Transaction, 'id' | 'bookId' | 'createdAt'>[] };

const clean = (value: unknown) => String(value ?? '').trim();
const keyOf = (value: unknown) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const valueFor = (row: Record<string, unknown>, names: string[]) => {
  const entry = Object.entries(row).find(([key]) => names.includes(keyOf(key)));
  return clean(entry?.[1]);
};
const hasKey = (row: Record<string, unknown>, names: string[]) => Object.keys(row).some((key) => names.includes(keyOf(key)));
const parseAmount = (value: string) => { const cleaned = value.replace(/[^0-9.-]/g, ''); return cleaned ? Number(cleaned) : Number.NaN; };
const parseDateTime = (value: string) => {
  const date = new Date(value.replace(/\s*@\s*/g, ' '));
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 16);
  const namedDate = value.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2}|\d{4})$/);
  if (namedDate) {
    const [, day, month, year] = namedDate;
    const fullYear = year.length === 2 ? `20${year}` : year;
    const parsed = new Date(`${month} ${day}, ${fullYear}`);
    if (!Number.isNaN(parsed.getTime())) return `${fullYear}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${day.padStart(2, '0')}T12:00`;
  }
  const shortDate = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (shortDate) { const [, day, month, year] = shortDate; const fullYear = year.length === 2 ? `20${year}` : year; return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T12:00`; }
  return '';
};

export function rowsToBooks(rows: Record<string, unknown>[], fallbackName: string): ImportedBook[] {
  const groups = new Map<string, ImportedBook>();
  for (const row of rows) {
    const isCashBookSummary = hasKey(row, ['entries']) && hasKey(row, ['cashin', 'cashout', 'balance']);
    const isCashBookStatement = hasKey(row, ['cashin', 'cashout']);
    const isTruckExport = hasKey(row, ['truck', 'truckname']);
    const isPayrollExport = hasKey(row, ['employee', 'employeename']) || (hasKey(row, ['entry']) && hasKey(row, ['name']));
    const name = isTruckExport ? valueFor(row, ['truck', 'truckname']) || fallbackName : isCashBookSummary || isCashBookStatement ? valueFor(row, ['book', 'bookname']) || fallbackName : isPayrollExport ? fallbackName : valueFor(row, ['book', 'bookname']) || fallbackName;
    const typeValue = valueFor(row, ['type', 'transactiontype', 'entrytype', 'entry']).toLowerCase();
    const cashIn = parseAmount(valueFor(row, ['cashin', 'income', 'credit']));
    const cashOut = parseAmount(valueFor(row, ['cashout', 'expenses', 'expense', 'debit']));
    const importedOpening = parseAmount(valueFor(row, ['openingbalance', 'startingbalance']));
    const rawAmount = isCashBookStatement ? (Number.isFinite(cashIn) && cashIn !== 0 ? cashIn : cashOut) : parseAmount(valueFor(row, ['amount', 'value', 'money']));
    const amount = Number.isFinite(rawAmount) ? Math.abs(rawAmount) : Number.NaN;
    const dateTime = parseDateTime(valueFor(row, ['datetime', 'date', 'transactiondate', 'entrydate']));
    const openingMarker = valueFor(row, ['date', 'remark', 'description']).toLowerCase().includes('opening balance');
    const summaryBalance = parseAmount(valueFor(row, ['balance']));
    const group = groups.get(name) ?? { book: { name, description: valueFor(row, ['description']), currency: valueFor(row, ['currency']) || '$', category: valueFor(row, ['category']) || 'Business', openingBalance: Number.isFinite(importedOpening) ? importedOpening : 0 }, transactions: [] };
    if (isCashBookSummary && Number.isFinite(summaryBalance)) { group.book.openingBalance = summaryBalance - (Number.isFinite(cashIn) ? cashIn : 0) + (Number.isFinite(cashOut) ? cashOut : 0); groups.set(name, group); continue; }
    if (openingMarker && Number.isFinite(summaryBalance)) { group.book.openingBalance = summaryBalance; groups.set(name, group); continue; }
    if (!dateTime && Number.isFinite(importedOpening)) { group.book.openingBalance = importedOpening; groups.set(name, group); continue; }
    if (!dateTime || !Number.isFinite(amount) || amount < 0) { if (groups.has(name)) groups.set(name, group); continue; }
    if (isCashBookStatement && Number.isFinite(summaryBalance) && group.transactions.length === 0) {
      group.book.openingBalance = summaryBalance - (typeValue.includes('out') || Number.isFinite(cashOut) && !Number.isFinite(cashIn) ? -amount : amount);
    }
    const type: Transaction['type'] = isCashBookStatement ? (Number.isFinite(cashIn) && cashIn > 0 ? 'in' : 'out') : typeValue.includes('out') || typeValue.includes('expense') || typeValue.includes('debit') || typeValue.includes('paid') || typeValue.includes('withdraw') || typeValue.includes('repay') ? 'out' : 'in';
    const sourceName = isPayrollExport ? valueFor(row, ['employee', 'employeename', 'name']) : valueFor(row, ['owner', 'ownername']);
    const remark = [sourceName, valueFor(row, ['remark', 'description', 'notes', 'narration'])].filter(Boolean).join(' — ') || 'Imported entry';
    group.transactions.push({ type, amount, remark: valueFor(row, ['remark', 'description', 'notes', 'narration']) || 'Imported entry', category: valueFor(row, ['category']) || undefined, paymentMode: (valueFor(row, ['paymentmode', 'paymentmethod', 'mode']) || undefined) as Transaction['paymentMode'], dateTime, attachmentUrl: undefined, attachmentName: undefined });
    group.transactions[group.transactions.length - 1].remark = remark;
    groups.set(name, group);
  }
  return [...groups.values()];
}

function parseCsv(text: string, fallbackName: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { row.push(cell); cell = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[index + 1] === '\n') index += 1; row.push(cell); if (row.some(value => value.trim())) rows.push(row); row = []; cell = ''; continue; }
    cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headerIndex = rows.findIndex((candidate) => candidate.some((value) => ['book', 'bookname', 'date', 'name', 'employee', 'truck', 'amount'].includes(keyOf(value))));
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex].map(clean);
  const metadata = new Map(rows.slice(0, headerIndex).filter((values) => values.length >= 2 && values[0].trim()).map((values) => [keyOf(values[0]), values[1].trim()]));
  const tableRows = rows.slice(headerIndex + 1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
  const entity = metadata.get('entity');
  const openingBalance = parseAmount(metadata.get('openingbalance') ?? '');
  const isStatement = headers.some((header) => ['cashin', 'cashout'].includes(keyOf(header))) && headers.some((header) => keyOf(header) === 'balance');
  const scopedRows = entity ? tableRows.map((row) => valueFor(row, ['book', 'bookname']) ? row : { ...row, Book: entity }) : tableRows;
  const scopedName = entity || (isStatement ? fallbackName : '');
  return scopedName && Number.isFinite(openingBalance) ? [{ Book: scopedName, 'Opening Balance': openingBalance }, ...scopedRows] : scopedRows;
}

async function parsePdf(file: File): Promise<Record<string, unknown>[]> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  GlobalWorkerOptions.workerSrc = typeof window === 'undefined'
    ? new URL('../../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString()
    : new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  const rows: Record<string, unknown>[] = [];
  const fallbackBookName = file.name.replace(/\.[^.]+$/, '');
  let pdfBookName = fallbackBookName;
  let previousBalance: number | undefined;
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const grouped = new Map<number, Array<{ x: number; text: string }>>();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);
      const existing = [...grouped.keys()].find(key => Math.abs(key - y) <= 2) ?? y;
      grouped.set(existing, [...(grouped.get(existing) ?? []), { x, text: item.str.trim() }]);
    }
    const lines = [...grouped.entries()].sort((a, b) => b[0] - a[0]).map(([y, items]) => ({ y, values: items.sort((a, b) => a.x - b.x).map((item) => item.text) }));
    for (const line of lines) {
      const values = line.values;
      const joined = values.join(' ');
      const lower = joined.toLowerCase();
      const entityMatch = joined.match(/(?:^|\s)entity\s*:\s*(.+)$/i);
      if (entityMatch?.[1]?.trim()) {
        pdfBookName = entityMatch[1].trim();
        continue;
      }
      if (values.length === 1 && /book$/i.test(joined.trim()) && !/gig report/i.test(joined)) {
        pdfBookName = joined.trim();
        continue;
      }
      if (lower.includes('opening balance')) {
        const openingText = [...values].reverse().find((value) => /^[^a-z]*[0-9][0-9,]*(?:\.\d+)?[^a-z]*$/i.test(value)) ?? '';
        if (openingText && Number.isFinite(parseAmount(openingText))) {
          previousBalance = parseAmount(openingText);
          rows.push({ Book: pdfBookName, Date: 'Opening balance', Balance: openingText });
        }
        continue;
      }
      const dateText = values.find(value => /\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Z][a-z]{2} \d{1,2}, \d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}/.test(value)) ?? '';
      if (!dateText) continue;
      const signedAmountText = values.find((value) => /^[+-]\s*[^a-z]*\d[\d,]*(?:\.\d+)?[^a-z]*$/i.test(value.trim())) ?? '';
      const numericValues = values.filter((value) => /^[^a-z]*\d[\d,]*(?:\.\d+)?[^a-z]*$/i.test(value.trim())).map(parseAmount);
      const rowBalance = numericValues.length ? numericValues[numericValues.length - 1] : Number.NaN;
      const balanceDelta = Number.isFinite(previousBalance) && Number.isFinite(rowBalance) ? rowBalance - previousBalance : Number.NaN;
      const statementCashIn = values.length >= 6 ? values[4] : '';
      const statementCashOut = values.length >= 6 ? values[5] : '';
      const hasStatementCashIn = Number.isFinite(parseAmount(statementCashIn)) && parseAmount(statementCashIn) >= 0 && statementCashIn.trim() !== '';
      const hasStatementCashOut = Number.isFinite(parseAmount(statementCashOut)) && parseAmount(statementCashOut) >= 0 && statementCashOut.trim() !== '';
      const type = Number.isFinite(balanceDelta) && balanceDelta !== 0 ? (balanceDelta < 0 ? 'Cash Out' : 'Cash In') : lower.includes('cash out') || lower.includes('expense') || lower.includes('paid') || lower.includes('withdraw') || lower.includes('repay') || lower.includes('debit') || (!lower.includes('cash in') && !lower.includes('income') && !lower.includes('credit') && !lower.includes('trip') && hasStatementCashOut && !hasStatementCashIn) ? 'Cash Out' : lower.includes('cash in') || lower.includes('income') || lower.includes('credit') || lower.includes('trip') || hasStatementCashIn ? 'Cash In' : signedAmountText.startsWith('-') ? 'Cash Out' : signedAmountText.startsWith('+') ? 'Cash In' : '';
      if (!type) continue;
      const parsedAmount = Number.isFinite(balanceDelta) && balanceDelta !== 0 ? Math.abs(balanceDelta) : parseAmount(signedAmountText || (hasStatementCashIn ? statementCashIn : hasStatementCashOut ? statementCashOut : [...values].reverse().find(value => value !== dateText && /^[^a-z]*[0-9][0-9,]*(?:\.\d+)?[^a-z]*$/i.test(value)) ?? ''));
      if (!Number.isFinite(parsedAmount)) continue;
      previousBalance = Number.isFinite(rowBalance) ? rowBalance : previousBalance;
      const legacyStatementRow = values.length >= 5 && values[3].toLowerCase() === 'cash';
      rows.push({ Book: pdfBookName, Date: dateText, Type: type, Amount: Math.abs(parsedAmount), Category: legacyStatementRow ? values[2] : undefined, Mode: legacyStatementRow ? values[3] : undefined, Remark: legacyStatementRow ? values[1] : values.filter(value => value !== type && value !== dateText).join(' ') });
    }
  }
  return rows;
}

export async function parseBookImport(file: File): Promise<ImportedBook[]> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return rowsToBooks(await parsePdf(file), file.name.replace(/\.[^.]+$/, ''));
  if (extension === 'csv') return rowsToBooks(parseCsv(await file.text(), file.name.replace(/\.[^.]+$/, '')), file.name.replace(/\.[^.]+$/, ''));
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  const headerIndex = matrix.findIndex((candidate) => candidate.some((value) => ['book', 'bookname', 'date', 'name', 'employee', 'truck', 'amount'].includes(keyOf(value))));
  if (headerIndex < 0) return [];
  const headers = (matrix[headerIndex] ?? []).map(clean);
  const metadata = new Map(matrix.slice(0, headerIndex).filter((values) => values.length >= 2 && clean(values[0])).map((values) => [keyOf(values[0]), clean(values[1])]));
  const rows = matrix.slice(headerIndex + 1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
  const entity = metadata.get('entity');
  const openingBalance = parseAmount(metadata.get('openingbalance') ?? '');
  const isStatement = headers.some((header) => ['cashin', 'cashout'].includes(keyOf(header))) && headers.some((header) => keyOf(header) === 'balance');
  if (entity) {
    for (const row of rows) if (!valueFor(row, ['book', 'bookname'])) row.Book = entity;
  }
  if ((entity || isStatement) && Number.isFinite(openingBalance)) rows.unshift({ Book: entity || file.name.replace(/\.[^.]+$/, ''), 'Opening Balance': openingBalance });
  return rowsToBooks(rows, file.name.replace(/\.[^.]+$/, ''));
}
