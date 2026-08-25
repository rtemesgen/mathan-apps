import { createCsv } from '../fileExport';
import type { ExportReport } from './exportTypes';
import { buildExportMetadataRows } from './exportMetadata';
import { formatExportRows } from './dateFormatting';

export function exportReportCsv(report: ExportReport): string {
  const metadata = report.metadata;
  const identity = buildExportMetadataRows(metadata);
  const summary = report.summary?.map((item) => [item.label, item.value]) ?? [];
  return createCsv(['Field', 'Value'], [...identity, ...(summary.length ? [['', ''], ...summary] : []), ...(identity.length || summary.length ? [['', '']] : []), report.headers, ...formatExportRows(report.rows)]);
}
