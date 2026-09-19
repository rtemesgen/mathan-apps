import assert from 'node:assert/strict';
import {
  DEFAULT_TRANSACTION_CATEGORIES,
  formatTransactionAmount,
  parseTransactionAmount,
} from '../src/apps/book/utils/transactionInput';

assert.equal(formatTransactionAmount('5554338'), '5,554,338');
assert.equal(formatTransactionAmount('1234567.89'), '1,234,567.89');
assert.equal(formatTransactionAmount('1,234.'), '1,234.');
assert.equal(parseTransactionAmount('5,554,338.50'), 5554338.5);
assert.deepEqual(DEFAULT_TRANSACTION_CATEGORIES, {
  in: 'Other Income',
  out: 'Other Expenses',
});

console.log('Cash Book transaction input tests passed.');
