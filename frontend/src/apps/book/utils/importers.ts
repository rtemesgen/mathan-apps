import * as XLSX from 'xlsx';
import { getDocument } from 'pdfjs-dist';
import { Book, Transaction } from '../types';

export type ImportedBook = { book: Omit<Book, 'id' | 'createdAt' | 'updatedAt'>; transactions: Omit<Transaction, 'id' | 'bookId' | 'createdAt'>[] };

const clean = (value: unknown) => String(value ?? '').trim();
const keyOf = (value: unknown) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const valueFor = (row: Record<string, unknown>, names: string[]) => {
  const entry = Object.entries(row).find(([key]) => names.includes(keyOf(key)));
  return clean(entry?.[1]);
};
const parseAmount = (value: string) => Number(value.replace(/[^0-9.-]/g, ''));
const parseDateTime = (value: string) => {
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 16);
  const normalized = value.replace(/\//g, '-');
  return normalized.length >= 10 ? `${normalized.slice(0, 10)}T12:00` : '';
};

function rowsToBooks(rows: Record<string, unknown>[], fallbackName: string): ImportedBook[] {
  const groups = new Map<string, ImportedBook>();
  for (const row of rows) {
    const name = valueFor(row, ['book', 'bookname', 'name']) || fallbackName;
    const typeValue = valueFor(row, ['type', 'transactiontype', 'entrytype']).toLowerCase();
    const amount = parseAmount(valueFor(row, ['amount', 'value', 'money']));
    const dateTime = parseDateTime(valueFor(row, ['datetime', 'date', 'transactiondate', 'entrydate']));
    if (!dateTime || !Number.isFinite(amount) || amount < 0) continue;
    const type: Transaction['type'] = typeValue.includes('out') || typeValue.includes('expense') || typeValue.includes('debit') ? 'out' : 'in';
    const group = groups.get(name) ?? { book: { name, description: valueFor(row, ['description']), currency: valueFor(row, ['currency']) || '$', category: valueFor(row, ['category']) || 'Business' }, transactions: [] };
    group.transactions.push({ type, amount, remark: valueFor(row, ['remark', 'description', 'notes', 'narration']) || 'Imported entry', category: valueFor(row, ['category']) || undefined, paymentMode: (valueFor(row, ['paymentmode', 'paymentmethod', 'mode']) || undefined) as Transaction['paymentMode'], dateTime, attachmentUrl: undefined, attachmentName: undefined });
    groups.set(name, group);
  }
  return [...groups.values()];
}

function parseCsv(text: string): Record<string, unknown>[] {
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
  const headers = rows.shift()?.map(clean) ?? [];
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

async function parsePdf(file: File): Promise<Record<string, unknown>[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  const rows: Record<string, unknown>[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const grouped = new Map<number, string[]>();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const existing = [...grouped.keys()].find(key => Math.abs(key - y) <= 2) ?? y;
      grouped.set(existing, [...(grouped.get(existing) ?? []), item.str.trim()]);
    }
    for (const values of [...grouped.entries()].sort((a, b) => b[0] - a[0]).map(([, value]) => value)) {
      const joined = values.join(' ');
      const type = joined.toLowerCase().includes('cash out') ? 'Cash Out' : joined.toLowerCase().includes('cash in') ? 'Cash In' : '';
      if (!type) continue;
      const amountText = values.find(value => /[0-9]/.test(value) && /[,\d]+(?:\.\d+)?/.test(value)) ?? '';
      const dateText = values.find(value => /\d{4}[-/]\d{1,2}[-/]\d{1,2}|[A-Z][a-z]{2} \d{1,2}, \d{4}/.test(value)) ?? '';
      rows.push({ Book: file.name.replace(/\.[^.]+$/, ''), Date: dateText, Type: type, Amount: amountText, Remark: values.filter(value => value !== type && value !== amountText && value !== dateText).join(' ') });
    }
  }
  return rows;
}

export async function parseBookImport(file: File): Promise<ImportedBook[]> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return rowsToBooks(await parsePdf(file), file.name.replace(/\.[^.]+$/, ''));
  if (extension === 'csv') return rowsToBooks(parseCsv(await file.text()), file.name.replace(/\.[^.]+$/, ''));
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return rowsToBooks(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }), file.name.replace(/\.[^.]+$/, ''));
}
