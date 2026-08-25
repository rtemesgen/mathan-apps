import assert from 'node:assert/strict';
import { buildCashBookExportReports } from '../src/apps/book/cashBookExport';
import { buildPayrollExportReports } from '../src/apps/payroll/payrollExport';
import { buildTruckExportReports } from '../src/apps/truck/truckExport';
import { getDatePresetRange } from '../src/lib/exports/datePresets';
import { formatExportNumber } from '../src/lib/exports/numberFormatting';

assert.equal(formatExportNumber(1000), '1,000.00');
assert.equal(formatExportNumber(20000.5), '20,000.50');

const book = { id: 'book-1', name: 'Main Cash', currency: 'USD', openingBalance: 500, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
const bookReports = buildCashBookExportReports({ books: [book], transactions: [
  { id: 'in-1', bookId: 'book-1', type: 'in', amount: 100, remark: 'Sale', dateTime: '2026-08-01T09:00', createdAt: '2026-08-01' },
  { id: 'out-1', bookId: 'book-1', type: 'out', amount: 40, remark: 'Fuel', dateTime: '2026-08-02T09:00', createdAt: '2026-08-02' },
] });
assert.equal(bookReports.find((report) => report.id === 'complete-statement')?.build({ detail: 'full', entityId: 'book-1', transactionType: 'in' }).rows.length, 3);
assert.equal(bookReports.find((report) => report.id === 'complete-statement')?.build({ detail: 'full', entityId: 'book-1', transactionType: 'in' }).rows[1][4], '100.00');
const cashStatement = bookReports.find((report) => report.id === 'complete-statement')?.build({ detail: 'full', entityId: 'book-1', startDate: '2026-08-01', endDate: '2026-08-31' });
assert.deepEqual(cashStatement?.summary?.map((item) => item.label), ['Opening balance', 'Total cash in', 'Total cash out', 'Final balance']);
assert.equal(cashStatement?.rows[0][0], 'Opening balance');
assert.equal(cashStatement?.rows[0][6], '500.00');
assert.equal(cashStatement?.rows.at(-1)?.[6], '560.00');
assert.equal(cashStatement?.rows.at(-1)?.[0], 'Final balance');

const employee = { id: 'emp-1', name: 'Amina', startDate: '2026-01-01', initialSalary: 1000, salaryHistory: [], status: 'active' as const, createdAt: '2026-01-01' };
const payrollReports = buildPayrollExportReports({ employees: [employee], transactions: [{ id: 'pay-1', employeeId: 'emp-1', employeeName: 'Amina', amount: 200, date: '2026-08-03', type: 'withdrawal', createdAt: '2026-08-03' }], asOfDate: '2026-08-31' });
assert.equal(payrollReports.find((report) => report.id === 'payments-withdrawals')?.build({ detail: 'full', entityId: 'emp-1' }).rows[0][1], 'Amina');
const payrollDetailed = payrollReports.find((report) => report.id === 'employees-detailed')?.build({ detail: 'detailed', entityId: 'emp-1' });
assert.deepEqual(payrollDetailed?.headers, ['Name', 'Date', 'Type', 'Amount', 'Earned', 'Paid', 'Notes']);
assert.equal(payrollDetailed?.rows[1][0], 'Amina');
assert.equal(payrollDetailed?.dateRange?.endDate, '2026-08-31');
assert.equal(payrollDetailed?.title, 'Payroll Details');
const payrollCondensed = payrollReports.find((report) => report.id === 'employees-detailed')?.build({ detail: 'condensed', entityId: 'emp-1' });
const payrollFull = payrollReports.find((report) => report.id === 'employees-detailed')?.build({ detail: 'full', entityId: 'emp-1' });
assert.equal(payrollCondensed?.headers[3], 'Rate');
assert.equal(payrollCondensed?.title, 'Payroll Summary');
assert.equal(payrollFull?.headers.at(-1), 'Amount');
assert.equal(payrollFull?.headers.includes('Method'), false);
assert.equal(payrollFull?.title, 'Payroll Payments');
assert.deepEqual(payrollReports.find((report) => report.id === 'payments-withdrawals')?.build({ detail: 'condensed', entityId: 'emp-1' }).headers, ['Name', 'Payments', 'Total']);
assert.equal(payrollReports.find((report) => report.id === 'payments-withdrawals')?.build({ detail: 'full', entityId: 'emp-1' }).headers.at(-1), 'Amount');
assert.equal(payrollReports.find((report) => report.id === 'payments-withdrawals')?.build({ detail: 'full', entityId: 'emp-1' }).headers.includes('Method'), false);
assert.deepEqual(payrollReports.find((report) => report.id === 'employees-condensed')?.build({ detail: 'condensed', entityId: 'emp-1' }).summary?.map((item) => item.label), ['Monthly pay', 'Earned', 'Paid', 'Owed']);

const truck = { id: 'truck-1', name: 'Truck A', unitNumber: 'A1', makeModel: 'Model', vin: 'VIN', cashOnHand: 0, licensePlate: 'PLATE' };
const owner = { id: 'owner-1', truckId: 'truck-1', name: 'John', startDate: '2026-01-01', equityPercentage: 50, monthlyDrawRate: 0, avatarColor: '#000' };
const truckReports = buildTruckExportReports({ trucks: [truck], owners: [owner], transactions: [
  { id: 'income-1', truckId: 'truck-1', date: '2026-08-01', type: 'INCOME', category: 'Trip', amount: 500, description: 'Haul' },
  { id: 'loan-1', truckId: 'truck-1', date: '2026-08-02', type: 'CAPITAL_INJECTION', category: 'Loan', amount: 100, ownerId: 'owner-1', description: 'Loan from John' },
] });
const cashFlow = truckReports.find((report) => report.id === 'income-expenses')?.build({ detail: 'full', entityId: 'truck-1', transactionType: 'INFLOW' });
assert.equal(cashFlow?.rows.length, 2);
assert.equal(cashFlow?.headers.at(-1), 'Amount');
assert.deepEqual(truckReports.find((report) => report.id === 'complete-statement')?.build({ detail: 'condensed', entityId: 'truck-1' }).summary?.map((item) => item.label), ['Cash on hand', 'Total income', 'Total expenses', 'Net profit', 'Receivable', 'Payable']);
const partners = truckReports.find((report) => report.id === 'owner-shares-loans')?.build({ detail: 'detailed', entityId: 'truck-1', ownerId: 'owner-1' });
assert.equal(partners?.rows[0][1], 'John');
assert.equal(truckReports.find((report) => report.id === 'owner-shares-loans')?.build({ detail: 'detailed', entityId: 'truck-1', query: 'John' }).rows.length, 1);
assert.equal(truckReports.find((report) => report.id === 'owner-shares-loans')?.build({ detail: 'detailed', entityId: 'truck-1', ownerId: 'owner-1', category: 'Loan' }).rows.length, 1);
const activity = truckReports.find((report) => report.id === 'transactions-by-truck-owner')?.build({ detail: 'full', entityId: 'truck-1', ownerId: 'owner-1' });
assert.equal(activity?.rows.length, 1);
assert.equal(activity?.headers.includes('Details'), true);
assert.equal(activity?.rows[0][6], 'Loan from John');

assert.deepEqual(getDatePresetRange('daily', new Date(2026, 7, 25)), { startDate: '2026-08-25', endDate: '2026-08-25' });
assert.deepEqual(getDatePresetRange('weekly', new Date(2026, 7, 25)), { startDate: '2026-08-24', endDate: '2026-08-30' });
assert.deepEqual(getDatePresetRange('monthly', new Date(2026, 7, 25)), { startDate: '2026-08-01', endDate: '2026-08-31' });
assert.deepEqual(getDatePresetRange('all', new Date(2026, 7, 25)), {});

console.log('Context-aware export tests passed.');
