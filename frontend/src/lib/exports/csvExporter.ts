import { createCsv } from '../fileExport';
import type { ExportReport } from './exportTypes';

export function exportReportCsv(report: ExportReport): string {
  const metadata = report.metadata;
  const identity = metadata ? [['Company', metadata.companyName], ['App', metadata.appName], ['Report', metadata.reportName], ...(metadata.entityName ? [['Entity', metadata.entityName]] : []), ...(metadata.startDate || metadata.endDate ? [['Period', `${metadata.startDate ?? 'All time'} – ${metadata.endDate ?? 'Current'}`]] : []), ['Generated', metadata.generatedAt ?? new Date().toISOString()], ['', '']] : [];
  return createCsv(['Field', 'Value'], [...identity, report.headers, ...report.rows]);
}
