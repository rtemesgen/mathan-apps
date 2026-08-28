import assert from 'node:assert/strict';
import { calculateTruckFinancials } from '../src/apps/truck/utils/formatters';
import type { Owner, Transaction, Truck } from '../src/apps/truck/types';
import { customersForTruck } from '../src/apps/truck/utils/customerScope';
import { sortTruckActivityNewestFirst } from '../src/apps/truck/components/LedgerHistoryView';

const truck: Truck = { id: 't1', name: 'Unit 1', unitNumber: '1', makeModel: 'Test', vin: '', cashOnHand: 100, licensePlate: '' };
const owner: Owner = { id: 'o1', truckId: 't1', name: 'Partner', startDate: '2026-01-01', equityPercentage: 50, monthlyDrawRate: 0, avatarColor: '' };
assert.deepEqual(customersForTruck([
  { id: 'customer-1', truckId: 't1', name: 'Unit 1 customer' },
  { id: 'customer-2', truckId: 't2', name: 'Other unit customer' },
], 't1').map((customer) => customer.id), ['customer-1']);
const transactions: Transaction[] = [
  { id: 'i', truckId: 't1', date: '2026-01-01', type: 'INCOME', category: 'Trip', amount: 1000, description: '' },
  { id: 'e', truckId: 't1', date: '2026-01-02', type: 'EXPENSE', category: 'Fuel', amount: 200, description: '' },
  { id: 'c', truckId: 't1', date: '2026-01-03', type: 'CAPITAL_INJECTION', category: 'Loan', amount: 300, ownerId: 'o1', description: '' },
  { id: 'r', truckId: 't1', date: '2026-01-04', type: 'CAPITAL_REPAYMENT', category: 'Repay', amount: 50, ownerId: 'o1', description: '' },
];
const result = calculateTruckFinancials(truck, [owner], transactions, '2026-01-04');
assert.equal(result.totalIncome, 1000);
assert.equal(result.totalExpenses, 200);
assert.equal(result.netProfit, 800);
assert.equal(result.cashOnHand, 1150);
assert.equal(result.ownerSummaries[0].unpaidBalance, 250);
assert.equal(result.ownerSummaries[0].earnedProfitShare, 400);

const creditTransactions: Transaction[] = [
  { id: 'ar', truckId: 't1', date: '2026-01-01', type: 'RECEIVABLE', category: 'Freight', amount: 500, counterpartyType: 'CUSTOMER', counterpartyName: 'ABC Customer', description: '' },
  { id: 'ap', truckId: 't1', date: '2026-01-02', type: 'PAYABLE', category: 'Repair', amount: 120, counterpartyType: 'OWNER', counterpartyName: 'Partner', ownerId: 'o1', description: '' },
  { id: 'ars', truckId: 't1', date: '2026-01-03', type: 'RECEIVABLE_SETTLEMENT', category: 'Payment', amount: 200, counterpartyType: 'CUSTOMER', counterpartyName: 'ABC Customer', description: '' },
  { id: 'aps', truckId: 't1', date: '2026-01-04', type: 'PAYABLE_SETTLEMENT', category: 'Payment', amount: 20, counterpartyType: 'OWNER', counterpartyName: 'Partner', ownerId: 'o1', description: '' },
];
const creditResult = calculateTruckFinancials(truck, [owner], creditTransactions, '2026-01-04');
assert.equal(creditResult.totalReceivable, 300);
assert.equal(creditResult.totalPayable, 0);
assert.equal(creditResult.netProfit, 380);
assert.equal(creditResult.cashOnHand, 280);
assert.deepEqual(creditResult.counterpartyBalances.map(({ type, name, amount }) => ({ type, name, amount })), [
  { type: 'receivable', name: 'ABC Customer', amount: 300 },
  { type: 'payable', name: 'Partner', amount: 100 },
]);
const offsetResult = calculateTruckFinancials(truck, [owner], [
  { id: 'customer-ar', truckId: 't1', date: '2026-01-01', type: 'RECEIVABLE', category: 'Trip', amount: 6500, customerId: 'customer-1', counterpartyType: 'CUSTOMER', counterpartyName: 'Same Customer', description: '' },
  { id: 'customer-ap', truckId: 't1', date: '2026-01-02', type: 'PAYABLE', category: 'Repair', amount: 6000, customerId: 'customer-1', counterpartyType: 'CUSTOMER', counterpartyName: 'Same Customer', description: '' },
]);
assert.deepEqual(offsetResult.counterpartyBalances, [{ type: 'receivable', name: 'Same Customer', customerId: 'customer-1', amount: 500 }]);
assert.equal(offsetResult.totalCustomerReceivable, 500);
assert.equal(offsetResult.totalCustomerPayable, 0);
assert.equal(offsetResult.totalReceivable, 500);
assert.equal(offsetResult.totalPayable, 0);

// Stable customer ids keep separate customer records separate even when their
// display names happen to match.
const sameNameDifferentCustomers = calculateTruckFinancials(truck, [owner], [
  { id: 'customer-a-ar', truckId: 't1', date: '2026-01-01', type: 'RECEIVABLE', category: 'Trip', amount: 125, customerId: 'customer-a', counterpartyType: 'CUSTOMER', counterpartyName: 'Same Name', description: '' },
  { id: 'customer-b-ar', truckId: 't1', date: '2026-01-02', type: 'RECEIVABLE', category: 'Trip', amount: 75, customerId: 'customer-b', counterpartyType: 'CUSTOMER', counterpartyName: 'Same Name', description: '' },
]);
assert.deepEqual(sameNameDifferentCustomers.counterpartyBalances, [
  { type: 'receivable', name: 'Same Name', customerId: 'customer-a', amount: 125 },
  { type: 'receivable', name: 'Same Name', customerId: 'customer-b', amount: 75 },
]);
const ownerOnlyResult = calculateTruckFinancials(truck, [owner], [
  { id: 'owner-ap', truckId: 't1', date: '2026-01-01', type: 'PAYABLE', category: 'Owner balance', amount: 900, ownerId: 'o1', counterpartyType: 'OWNER', counterpartyName: 'Partner', description: '' },
]);
assert.equal(ownerOnlyResult.totalReceivable, 0);
assert.equal(ownerOnlyResult.totalPayable, 0);
assert.deepEqual(ownerOnlyResult.counterpartyBalances, [{ type: 'payable', name: 'Partner', ownerId: 'o1', counterpartyType: 'OWNER', amount: 900 }]);

// Compatibility with APKs that attached a customer to INCOME/EXPENSE before
// the explicit RECEIVABLE/PAYABLE transaction types were introduced.
const legacyCustomerResult = calculateTruckFinancials(truck, [owner], [
  { id: 'legacy-trip', truckId: 't1', date: '2026-01-01', type: 'INCOME', category: 'Trip Pay', amount: 6500, customerId: 'customer-1', counterpartyType: 'CUSTOMER', counterpartyName: 'Wow', description: '' },
]);
assert.equal(legacyCustomerResult.totalIncome, 6500);
assert.equal(legacyCustomerResult.cashOnHand, 100, 'unpaid legacy trip credit is not counted as cash');
assert.deepEqual(legacyCustomerResult.counterpartyBalances, [{ type: 'receivable', name: 'Wow', customerId: 'customer-1', amount: 6500 }]);

const activityOrder = sortTruckActivityNewestFirst([
  { id: 'older-recorded', truckId: 't1', date: '2026-08-28', type: 'INCOME', category: 'Trip', amount: 1, description: '', createdAt: '2026-08-28T09:00:00.000Z' },
  { id: 'newer-recorded', truckId: 't1', date: '2026-08-01', type: 'INCOME', category: 'Trip', amount: 1, description: '', createdAt: '2026-08-28T10:00:00.000Z' },
  { id: 'latest-edited', truckId: 't1', date: '2026-07-01', type: 'INCOME', category: 'Trip', amount: 1, description: '', createdAt: '2026-08-01T10:00:00.000Z', updatedAt: '2026-08-28T11:00:00.000Z' },
]);
assert.deepEqual(activityOrder.map((item) => item.id), ['latest-edited', 'newer-recorded', 'older-recorded'], 'Activity History is newest recorded or edited activity first, not random UUID order');
console.log('Truck financial tests passed.');
