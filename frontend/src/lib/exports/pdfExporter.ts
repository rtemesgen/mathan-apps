import { exportPdfFile } from '../mobile';
import type { ExportReport } from './exportTypes';

export function exportReportPdf(report: ExportReport): Promise<void> {
  const metadata = report.metadata;
  const identity = metadata ? [metadata.companyName, `${metadata.appName} — ${metadata.reportName}`, metadata.entityName ? `Entity: ${metadata.entityName}` : '', metadata.startDate || metadata.endDate ? `Period: ${metadata.startDate ?? 'All time'} – ${metadata.endDate ?? 'Current'}` : '', `Generated: ${metadata.generatedAt ?? new Date().toISOString()}`, ''] : [];
  return exportPdfFile(`${report.filename}.pdf`, report.title, [...identity, ...(metadata?.detailLabel ? [`Report: ${metadata.detailLabel}`] : []), ...(report.lines ?? [report.headers.join(' | '), ...report.rows.map(row => row.join(' | '))])]);
}
