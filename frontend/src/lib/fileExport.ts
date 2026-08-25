import { saveTextFile } from './mobile';

export type CsvValue = string | number | boolean | null | undefined;

export function csvEscape(value: CsvValue) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export function createCsv(headers: readonly string[], rows: readonly (readonly CsvValue[])[]) {
  return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

export function downloadTextFile(filename: string, content: string, type = 'text/plain;charset=utf-8;') {
  return saveTextFile(filename, content, type);
}

export function downloadCsvFile(filename: string, headers: readonly string[], rows: readonly (readonly CsvValue[])[]) {
  return downloadTextFile(filename, createCsv(headers, rows), 'text/csv;charset=utf-8;');
}
