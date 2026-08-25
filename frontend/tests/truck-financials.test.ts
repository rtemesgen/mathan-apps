import assert from 'node:assert/strict';
import { calculateTruckFinancials } from '../src/apps/truck/utils/formatters';
import type { Owner, Transaction, Truck } from '../src/apps/truck/types';

const truck: Truck = { id: 't1', name: 'Unit 1', unitNumber: '1', makeModel: 'Test', vin: '', cashOnHand: 100, licensePlate: '' };
const owner: Owner = { id: 'o1', truckId: 't1', name: 'Partner', startDate: '2026-01-01', equityPercentage: 50, monthlyDrawRate: 0, avatarColor: '' };
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
assert.equal(creditResult.totalPayable, 100);
assert.equal(creditResult.netProfit, 380);
assert.equal(creditResult.cashOnHand, 280);
assert.deepEqual(creditResult.counterpartyBalances.map(({ type, name, amount }) => ({ type, name, amount })), [
  { type: 'receivable', name: 'ABC Customer', amount: 300 },
  { type: 'payable', name: 'Partner', amount: 100 },
]);
console.log('Truck financial tests passed.');
