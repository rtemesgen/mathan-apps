import { saveTextFile } from '../mobile';
import { exportReportCsv } from './csvExporter';
import { exportReportExcel } from './excelExporter';
import { exportReportPdf } from './pdfExporter';
import { printExportReport } from './printExporter';
import type { ExportFormat, ExportReport } from './exportTypes';

const safeFilename = (value: string) => value.trim().replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'mathan-export';
const dateStamp = () => new Date().toISOString().slice(0, 10);

export async function exportReport(report: ExportReport, format: ExportFormat) {
  const filename = `${safeFilename(report.filename)}_${dateStamp()}`;
  const prepared = { ...report, filename };
  if (format === 'print') { printExportReport(prepared); return; }
  if (format === 'pdf') { await exportReportPdf(prepared); return; }
  if (format === 'xlsx') { await exportReportExcel(prepared); return; }
  await saveTextFile(`${filename}.csv`, exportReportCsv(prepared), 'text/csv;charset=utf-8;');
}
