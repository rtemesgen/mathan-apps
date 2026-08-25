import type { CsvValue } from '../fileExport';
import type { ExportMetadata } from './exportTypes';
import { formatExportDate } from './dateFormatting';

export function buildExportMetadataRows(metadata?: ExportMetadata): CsvValue[][] {
  if (!metadata) return [];
  return [
    ['Company', metadata.companyName],
    ...(metadata.entityName ? [['Entity', metadata.entityName]] : []),
    ['From', formatExportDate(metadata.startDate ?? '—')],
    ['To', formatExportDate(metadata.endDate ?? '—')],
  ];
}
