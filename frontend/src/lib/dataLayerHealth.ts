export function businessRecordShapeError(key: string, value: unknown): string | null {
  if (key === 'sync-queue-v1') return Array.isArray(value) ? null : 'pending mutation queue is not an array';
  if (key.endsWith(':revision')) return typeof value === 'number' && Number.isFinite(value) ? null : 'snapshot revision is not a number';
  if (/:(cash_book|payroll):(books|transactions|employees)$/.test(key)) return Array.isArray(value) ? null : 'business snapshot is not an array';
  if (key.endsWith(':cash_book:state')) {
    const state = value as { books?: unknown; transactions?: unknown } | null;
    return state && Array.isArray(state.books) && Array.isArray(state.transactions) ? null : 'Cash Book state has an incompatible schema';
  }
  if (key.endsWith(':payroll:state')) {
    const state = value as { employees?: unknown; transactions?: unknown } | null;
    return state && Array.isArray(state.employees) && Array.isArray(state.transactions) ? null : 'Payroll state has an incompatible schema';
  }
  if (key.startsWith('truck:')) {
    const cache = value as { trucks?: unknown; owners?: unknown; customers?: unknown; transactions?: unknown } | null;
    return cache && Array.isArray(cache.trucks) && Array.isArray(cache.owners) && (cache.customers === undefined || Array.isArray(cache.customers)) && Array.isArray(cache.transactions)
      ? null
      : 'Truck cache has an incompatible schema';
  }
  if (/^workspaces:.*:v1$/.test(key)) {
    const cache = value as { version?: unknown; memberships?: unknown } | null;
    return cache?.version === 1 && Array.isArray(cache.memberships) ? null : 'company cache has an incompatible schema';
  }
  return null;
}

export function isBusinessHealthKey(key: string) {
  return key === 'sync-queue-v1'
    || key.endsWith(':revision')
    || /:(cash_book|payroll):(books|transactions|employees)$/.test(key)
    || key.endsWith(':cash_book:state')
    || key.endsWith(':payroll:state')
    || key.startsWith('truck:')
    || /^workspaces:.*:v1$/.test(key);
}
