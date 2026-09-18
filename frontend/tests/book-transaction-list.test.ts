import assert from 'node:assert/strict';
import {
  calculateRunningBalances,
  filterAndSortTransactions,
} from '../src/apps/book/utils/transactionList';
import type { Transaction } from '../src/apps/book/types';

const transactions: Transaction[] = [
  { id: 'oldest', bookId: 'book-1', type: 'in', amount: 100, remark: 'Opening cash', dateTime: '2026-09-17T23:59', createdAt: '2026-09-17T23:59:01.000Z' },
  { id: 'middle', bookId: 'book-1', type: 'out', amount: 10, remark: 'Small expense', dateTime: '2026-09-18T12:10', createdAt: '2026-09-18T12:10:01.000Z' },
  { id: 'latest', bookId: 'book-1', type: 'in', amount: 30, remark: 'New income', dateTime: '2026-09-18T12:10', createdAt: '2026-09-18T12:10:02.000Z' },
];

assert.deepEqual(
  filterAndSortTransactions(transactions, { typeFilter: 'all', searchQuery: '', sortBy: 'newest' }).map((transaction) => transaction.id),
  ['latest', 'middle', 'oldest'],
);

assert.deepEqual([...calculateRunningBalances(transactions, 0).entries()], [
  ['oldest', 100],
  ['middle', 90],
  ['latest', 120],
]);

assert.deepEqual(
  filterAndSortTransactions(transactions, { typeFilter: 'all', searchQuery: '', sortBy: 'newest', startDate: '2026-09-18', endDate: '2026-09-18' }).map((transaction) => transaction.id),
  ['latest', 'middle'],
);

console.log('Cash Book transaction list tests passed.');
