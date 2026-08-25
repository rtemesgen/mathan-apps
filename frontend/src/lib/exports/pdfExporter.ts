import { exportPdfFile } from '../mobile';
import type { ExportReport } from './exportTypes';
import { formatExportRows } from './dateFormatting';

export function exportReportPdf(report: ExportReport): Promise<void> {
  const metadata = report.metadata;
  const lines = formatExportRows(report.rows).map((row) => row.join(' | '));
  return exportPdfFile(`${report.filename}.pdf`, report.title, lines, report.headers, metadata, report.summary);
}
