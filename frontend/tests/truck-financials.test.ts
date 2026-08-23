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
console.log('Truck financial tests passed.');
