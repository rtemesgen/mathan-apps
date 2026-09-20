import type { Transaction, TransactionType } from '../types';

export type TransactionListSort = 'newest' | 'oldest' | 'highest';
export type TransactionTypeFilter = 'all' | TransactionType;

export interface TransactionListFilters {
  typeFilter: TransactionTypeFilter;
  searchQuery: string;
  sortBy: TransactionListSort;
  startDate?: string;
  endDate?: string;
}

function timestamp(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function compareTransactionsChronologically(a: Transaction, b: Transaction): number {
  return timestamp(a.dateTime) - timestamp(b.dateTime)
    || timestamp(a.createdAt) - timestamp(b.createdAt)
    || a.id.localeCompare(b.id);
}

export function calculateRunningBalances(transactions: Transaction[], openingBalance = 0): Map<string, number> {
  const chronological = [...transactions].sort(compareTransactionsChronologically);
  const balances = new Map<string, number>();
  let currentBalance = openingBalance;

  for (const transaction of chronological) {
    currentBalance += transaction.type === 'in' ? transaction.amount : -transaction.amount;
    balances.set(transaction.id, currentBalance);
  }

  return balances;
}

export function filterAndSortTransactions(transactions: Transaction[], filters: TransactionListFilters): Transaction[] {
  const query = filters.searchQuery.trim().toLowerCase();
  const filtered = transactions.filter((transaction) => {
    if (filters.typeFilter !== 'all' && transaction.type !== filters.typeFilter) return false;

    const transactionDate = transaction.dateTime.slice(0, 10);
    if (filters.startDate && transactionDate < filters.startDate) return false;
    if (filters.endDate && transactionDate > filters.endDate) return false;

    if (!query) return true;
    return transaction.remark.toLowerCase().includes(query)
      || transaction.category?.toLowerCase().includes(query)
      || transaction.paymentMode?.toLowerCase().includes(query)
      || transaction.amount.toString().includes(query);
  });

  return filtered.sort((a, b) => {
    if (filters.sortBy === 'newest') return compareTransactionsChronologically(b, a);
    if (filters.sortBy === 'oldest') return compareTransactionsChronologically(a, b);
    return b.amount - a.amount || compareTransactionsChronologically(b, a);
  });
}
