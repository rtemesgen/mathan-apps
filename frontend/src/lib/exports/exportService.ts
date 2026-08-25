import * as XLSX from 'xlsx';
import { createCsv } from '../fileExport';
import { exportPdfFile, saveBinaryFile, saveTextFile } from '../mobile';
import type { ExportFormat, ExportReport } from './exportTypes';

const safeFilename = (value: string) => value.trim().replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'mathan-export';
const dateStamp = () => new Date().toISOString().slice(0, 10);

function reportLines(report: ExportReport) {
  const metadata = report.metadata;
  const identity = metadata ? [metadata.companyName, `${metadata.appName} — ${metadata.reportName}`, metadata.entityName ? `Entity: ${metadata.entityName}` : '', metadata.startDate || metadata.endDate ? `Period: ${metadata.startDate ?? 'All time'} – ${metadata.endDate ?? 'Current'}` : '', metadata.detailLabel ? `Report: ${metadata.detailLabel}` : '', `Generated: ${formatDateTime(metadata.generatedAt)}`, ''] : [];
  return report.lines ?? [...identity, report.title, '', report.headers.join(' | '), ...report.rows.map((row) => row.map((value) => String(value ?? '')).join(' | '))];
}

function formatDateTime(value?: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(value ? new Date(value) : new Date());
}

function metadataRows(report: ExportReport) {
  const m = report.metadata;
  if (!m) return [];
  return [
    ['Company', m.companyName], ['App', m.appName], ['Report', m.reportName],
    ...(m.entityName ? [['Entity', m.entityName]] : []),
    ...(m.startDate || m.endDate ? [['Period', `${m.startDate ?? 'All time'} – ${m.endDate ?? 'Current'}`]] : []),
    ...(m.detailLabel ? [['Detail', m.detailLabel]] : []), ['Generated', formatDateTime(m.generatedAt)], ['',''],
  ];
}

function printReport(report: ExportReport) {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1000,height=800');
  if (!printWindow) throw new Error('Allow pop-ups to print this report.');
  const header = report.headers.map((value) => `<th>${escapeHtml(value)}</th>`).join('');
  const rows = report.rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(String(value ?? ''))}</td>`).join('')}</tr>`).join('');
  printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(report.title)}</title><style>body{font:12px Arial,sans-serif;color:#1c1d1f;padding:28px}h1{font-size:20px}table{border-collapse:collapse;width:100%;margin-top:18px}th,td{border:1px solid #d8d3c5;padding:7px;text-align:left;vertical-align:top}th{background:#f0ebd9}@media print{button{display:none}}</style></head><body><h1>${escapeHtml(report.title)}</h1><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table><button onclick="window.print()">Print</button></body></html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => printWindow.print(), 150);
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export async function exportReport(report: ExportReport, format: ExportFormat) {
  const base = `${safeFilename(report.filename)}_${dateStamp()}`;
  if (format === 'print') { printReport(report); return; }
  if (format === 'pdf') { await exportPdfFile(`${base}.pdf`, report.title, reportLines(report)); return; }
  if (format === 'csv') { await saveTextFile(`${base}.csv`, createCsv(['', ''], [...metadataRows(report), [report.headers.join(' | '), ''], ...report.rows.map((row) => [row.map((value) => String(value ?? '')).join(' | '), ''])]), 'text/csv;charset=utf-8;'); return; }
  const sheet = XLSX.utils.aoa_to_sheet([...metadataRows(report), report.headers, ...report.rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Report');
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  await saveBinaryFile(`${base}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', new Uint8Array(bytes));
}
