import * as XLSX from 'xlsx';
import { saveBinaryFile } from '../mobile';
import type { ExportReport } from './exportTypes';

export async function exportReportExcel(report: ExportReport): Promise<void> {
  const m = report.metadata;
  const identity = m ? [['Company', m.companyName], ['App', m.appName], ['Report', m.reportName], ...(m.entityName ? [['Entity', m.entityName]] : []), ...(m.startDate || m.endDate ? [['Period', `${m.startDate ?? 'All time'} – ${m.endDate ?? 'Current'}`]] : []), ...(m.detailLabel ? [['Detail', m.detailLabel]] : []), ['Generated', m.generatedAt ?? new Date().toISOString()], ['', '']] : [];
  const sheet = XLSX.utils.aoa_to_sheet([...identity, report.headers, ...report.rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Report');
  const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  await saveBinaryFile(`${report.filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', new Uint8Array(data));
}
