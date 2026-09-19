export const DEFAULT_TRANSACTION_CATEGORIES = {
  in: 'Other Income',
  out: 'Other Expenses',
} as const;

export function formatTransactionAmount(value: string): string {
  const normalized = value.replace(/,/g, '').replace(/[^\d.]/g, '');
  const [rawIntegerPart = '', ...decimalParts] = normalized.split('.');
  const integerPart = rawIntegerPart.replace(/^0+(?=\d)/, '');
  const groupedInteger = (integerPart || (decimalParts.length ? '0' : '')).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return decimalParts.length ? `${groupedInteger}.${decimalParts.join('')}` : groupedInteger;
}

export function parseTransactionAmount(value: string): number {
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}
