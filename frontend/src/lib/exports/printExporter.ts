import type { ExportReport } from './exportTypes';
import { buildExportMetadataRows } from './exportMetadata';
import { formatExportRows } from './dateFormatting';

export function printExportReport(report: ExportReport): void {
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) throw new Error('Allow popups to print this report.');
  const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
  const m = report.metadata;
  const rows = formatExportRows(report.rows);
  const identityRows = buildExportMetadataRows(m);
  const identity = identityRows.length ? `<div class="meta">${identityRows.map(([label, value]) => `<span><strong>${esc(label)}:</strong> ${esc(value)}</span>`).join(' · ')}</div>` : '';
  const summary = report.summary?.length ? `<div class="summary">${report.summary.map((item) => `<div><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong></div>`).join('')}</div>` : '';
  const incomeIndex = report.headers.findIndex((header) => /cash in|income|inflow/i.test(header));
  const expenseIndex = report.headers.findIndex((header) => /cash out|expense|debit|outflow/i.test(header));
  const typeIndex = report.headers.findIndex((header) => /type|entry/i.test(header));
  const amountIndex = report.headers.findIndex((header) => /^amount$/i.test(header));
  const tableRows = rows.map((row) => { const type = typeIndex >= 0 ? String(row[typeIndex] ?? '').toLowerCase() : ''; const isReceivable = /receivable/.test(type); const isPayable = /payable/.test(type); const isIncome = !isReceivable && !isPayable && ((incomeIndex >= 0 && Boolean(row[incomeIndex])) || /income|cash in|inflow|capital injection/.test(type)); const isExpense = !isReceivable && !isPayable && ((expenseIndex >= 0 && Boolean(row[expenseIndex])) || /expense|cash out|debit|outflow|withdraw|repay|loan|bill/.test(type)); const rowClass = isReceivable ? 'receivable-row' : isPayable ? 'payable-row' : isIncome ? 'income-row' : isExpense ? 'expense-row' : ''; return `<tr class="${rowClass}">${row.map((cell, index) => `<td class="${isReceivable ? 'receivable' : isPayable ? 'payable' : (index === incomeIndex && cell) || (index === typeIndex && isIncome) || (index === amountIndex && isIncome) ? 'income' : (index === expenseIndex && cell) || (index === typeIndex && isExpense) || (index === amountIndex && isExpense) ? 'expense' : ''}">${esc(cell)}</td>`).join('')}</tr>`; }).join('');
  popup.document.write(`<html><head><title>${esc(report.title)}</title><style>body{font-family:Arial;padding:24px;font-size:11pt;color:#1f241f}h1{margin:0 0 8px;font-size:20pt}.meta{color:#3f4d34;font-size:11pt;font-weight:600;margin-bottom:20px}.summary{display:grid;grid-template-columns:repeat(${Math.min(report.summary?.length ?? 1, 4)},1fr);margin-bottom:22px}.summary div{border:1px solid #cfd8c9;padding:12px}.summary span,.summary strong{display:block}.summary span{color:#68736a;font-size:11pt}.summary strong{font-size:16pt;margin-top:8px}table{border-collapse:collapse;width:100%;border:1px solid #aeb9a8}th,td{border:1px solid #c7d0c3;padding:9px 8px;text-align:left;font-size:11pt}th{background:#54623e;color:white;font-weight:700}.income-row{background:#eff9f2}.expense-row{background:#fff1f1}.receivable-row{background:#eff6ff}.payable-row{background:#fff1f2}.income{color:#00805a;font-weight:700}.expense{color:#c0202d;font-weight:700}.receivable{color:#1565c0;font-weight:700}.payable{color:#be123c;font-weight:700}</style></head><body><h1>${esc(report.title)}</h1>${identity}${summary}<table><thead><tr>${report.headers.map(header => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
  popup.document.close();
}
