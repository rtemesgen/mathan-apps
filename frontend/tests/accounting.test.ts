import assert from 'node:assert/strict';
import { calculateBookStats } from '../src/apps/book/utils/formatters';
import { calculateCompanyStats, calculateEmployeeAccrual } from '../src/apps/payroll/utils/calc';
import type { Employee, Transaction as PayrollTransaction } from '../src/apps/payroll/types';
import type { Transaction as CashTransaction } from '../src/apps/book/types';

const cash: CashTransaction[] = [
  { id: '1', bookId: 'book-a', type: 'in', amount: 1000, remark: 'Sale', dateTime: '2026-01-01T09:00', createdAt: '2026-01-01T09:00' },
  { id: '2', bookId: 'book-a', type: 'out', amount: 250.5, remark: 'Stock', dateTime: '2026-01-02T09:00', createdAt: '2026-01-02T09:00' },
  { id: '3', bookId: 'book-b', type: 'in', amount: 50, remark: 'Other', dateTime: '2026-01-02T09:00', createdAt: '2026-01-02T09:00' },
];
const cashStats = calculateBookStats(cash, 'book-a');
assert.deepEqual(cashStats, { totalIn: 1000, totalOut: 250.5, netBalance: 749.5, transactionCount: 2 });
assert.equal(calculateBookStats(cash).netBalance, 799.5);

const employee: Employee = { id: 'emp-a', name: 'Accounting Test', startDate: '2026-01-01', initialSalary: 3652.5, status: 'active', createdAt: '2026-01-01T00:00:00Z', salaryHistory: [{ id: 'raise-1', effectiveDate: '2026-01-06', newMonthlySalary: 7305, reason: 'Test raise', createdAt: '2026-01-06T00:00:00Z' }] };
const withdrawals: PayrollTransaction[] = [{ id: 'pay-1', employeeId: 'emp-a', amount: 100, date: '2026-01-08', type: 'withdrawal', createdAt: '2026-01-08T00:00:00Z' }];
const accrual = calculateEmployeeAccrual(employee, withdrawals, '2026-01-10');
assert.equal(accrual.intervals.length, 2);
assert.equal(accrual.intervals[0].days, 5);
assert.equal(accrual.intervals[1].days, 5);
assert.equal(accrual.totalAccruedWages, 1800);
assert.equal(accrual.totalWithdrawn, 100);
assert.equal(accrual.remainingBalance, 1700);

const beforeStart = calculateEmployeeAccrual(employee, withdrawals, '2025-12-31');
assert.equal(beforeStart.totalAccruedWages, 0);
assert.equal(beforeStart.remainingBalance, 0);

const company = calculateCompanyStats([employee], withdrawals, '2026-01-10');
assert.equal(company.totalEmployees, 1);
assert.equal(company.totalCompanyAccrued, 1800);
assert.equal(company.totalCompanyPaidOut, 100);
assert.equal(company.totalCompanyLiability, 1700);

console.log('Accounting tests passed: cash totals, running net, raise boundary accrual, withdrawals, pre-start dates, and company totals.');
