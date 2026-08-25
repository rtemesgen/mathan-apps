import * as XLSX from 'xlsx';
import { saveBinaryFile } from '../mobile';
import type { ExportReport } from './exportTypes';
import { buildExportMetadataRows } from './exportMetadata';
import { formatExportRows } from './dateFormatting';

export async function exportReportExcel(report: ExportReport): Promise<void> {
  const m = report.metadata;
  const identity = buildExportMetadataRows(m);
  const summary = report.summary?.map((item) => [item.label, item.value]) ?? [];
  const sheet = XLSX.utils.aoa_to_sheet([...identity, ...(summary.length ? [['', ''], ...summary] : []), ...(identity.length || summary.length ? [['', '']] : []), report.headers, ...formatExportRows(report.rows)]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Report');
  const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  await saveBinaryFile(`${report.filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', new Uint8Array(data));
}
