import type { ExportReport } from './exportTypes';

export function printExportReport(report: ExportReport): void {
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) throw new Error('Allow popups to print this report.');
  const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
  const m = report.metadata;
  const identity = m ? `<div><strong>${esc(m.companyName)}</strong><br>${esc(m.appName)} — ${esc(m.reportName)}${m.entityName ? `<br>Entity: ${esc(m.entityName)}` : ''}${m.startDate || m.endDate ? `<br>Period: ${esc(m.startDate ?? 'All time')} – ${esc(m.endDate ?? 'Current')}` : ''}${m.detailLabel ? `<br>Detail: ${esc(m.detailLabel)}` : ''}<br>Generated: ${esc(m.generatedAt ?? new Date().toISOString())}</div>` : '';
  popup.document.write(`<html><head><title>${esc(report.title)}</title><style>body{font-family:Arial;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;text-align:left}th{background:#eee}</style></head><body>${identity}<h1>${esc(report.title)}</h1><table><thead><tr>${report.headers.map(header => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${report.rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
  popup.document.close();
}
