import type { CsvValue } from '../fileExport';

export type ExportFormat = 'pdf' | 'xlsx' | 'csv' | 'print';
export type ExportDetail = 'condensed' | 'detailed' | 'full';

export type ExportBuildOptions = {
  detail: ExportDetail;
  entityId?: string;
  startDate?: string;
  endDate?: string;
  transactionType?: string;
  status?: string;
};

export type ExportMetadata = {
  companyName: string;
  appName: string;
  reportName: string;
  entityName?: string;
  startDate?: string;
  endDate?: string;
  detailLabel?: string;
  generatedAt?: string;
};

export type ExportReport = {
  title: string;
  filename: string;
  headers: string[];
  rows: CsvValue[][];
  lines?: string[];
  metadata?: ExportMetadata;
};

export type ExportReportDefinition = {
  id: string;
  label: string;
  description: string;
  build: (options: ExportBuildOptions) => ExportReport;
};

export type ExportEntityOption = { value: string; label: string };

export type ExportContext = {
  companyName: string;
  appName: string;
  reportName: string;
  report: ExportReportDefinition;
  selectedEntity?: ExportEntityOption;
  activeFilters?: Pick<ExportBuildOptions, 'entityId' | 'startDate' | 'endDate' | 'transactionType' | 'status'>;
  availableFormats?: ExportFormat[];
  availableDetailLevels?: ExportDetail[];
  availableEntities?: ExportEntityOption[];
};
