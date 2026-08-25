/** Format exported numeric amounts with thousands separators and cents. */
export const formatExportNumber = (value: number): string => new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number.isFinite(value) ? value : 0);
