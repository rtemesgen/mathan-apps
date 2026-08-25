export function formatExportDate(value: unknown): string {
  const text = String(value ?? '');
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  return match ? `${match[3]}/${match[2]}/${match[1].slice(-2)}` : text;
}

export function formatExportRows<T>(rows: readonly (readonly T[])[]): string[][] {
  return rows.map((row) => row.map((value) => formatExportDate(value)));
}
