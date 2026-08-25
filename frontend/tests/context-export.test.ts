import assert from 'node:assert/strict';
import { buildCashBookExportReports } from '../src/apps/book/cashBookExport';
import { buildPayrollExportReports } from '../src/apps/payroll/payrollExport';
import { buildTruckExportReports } from '../src/apps/truck/truckExport';

const book = { id: 'book-1', name: 'Main Cash', currency: 'USD', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
const bookReports = buildCashBookExportReports({ books: [book], transactions: [
  { id: 'in-1', bookId: 'book-1', type: 'in', amount: 100, remark: 'Sale', dateTime: '2026-08-01T09:00', createdAt: '2026-08-01' },
  { id: 'out-1', bookId: 'book-1', type: 'out', amount: 40, remark: 'Fuel', dateTime: '2026-08-02T09:00', createdAt: '2026-08-02' },
] });
assert.equal(bookReports.find((report) => report.id === 'complete-statement')?.build({ detail: 'full', entityId: 'book-1', transactionType: 'in' }).rows.length, 1);
assert.equal(bookReports.find((report) => report.id === 'complete-statement')?.build({ detail: 'full', entityId: 'book-1', transactionType: 'in' }).rows[0][2], 'Cash in');

const employee = { id: 'emp-1', name: 'Amina', startDate: '2026-01-01', initialSalary: 1000, salaryHistory: [], status: 'active' as const, createdAt: '2026-01-01' };
const payrollReports = buildPayrollExportReports({ employees: [employee], transactions: [{ id: 'pay-1', employeeId: 'emp-1', employeeName: 'Amina', amount: 200, date: '2026-08-03', type: 'withdrawal', createdAt: '2026-08-03' }], asOfDate: '2026-08-31' });
assert.equal(payrollReports.find((report) => report.id === 'payments-withdrawals')?.build({ detail: 'full', entityId: 'emp-1' }).rows[0][1], 'Amina');
assert.match(payrollReports.find((report) => report.id === 'employees-detailed')?.build({ detail: 'detailed', entityId: 'emp-1' }).rows[1][1] as string, /Amina/);

const truck = { id: 'truck-1', name: 'Truck A', unitNumber: 'A1', makeModel: 'Model', vin: 'VIN', cashOnHand: 0, licensePlate: 'PLATE' };
const owner = { id: 'owner-1', truckId: 'truck-1', name: 'John', startDate: '2026-01-01', equityPercentage: 50, monthlyDrawRate: 0, avatarColor: '#000' };
const truckReports = buildTruckExportReports({ trucks: [truck], owners: [owner], transactions: [
  { id: 'income-1', truckId: 'truck-1', date: '2026-08-01', type: 'INCOME', category: 'Trip', amount: 500, description: 'Haul' },
  { id: 'loan-1', truckId: 'truck-1', date: '2026-08-02', type: 'CAPITAL_INJECTION', category: 'Loan', amount: 100, ownerId: 'owner-1', description: 'Loan' },
] });
const cashFlow = truckReports.find((report) => report.id === 'income-expenses')?.build({ detail: 'full', entityId: 'truck-1', transactionType: 'INFLOW' });
assert.equal(cashFlow?.rows.length, 2);
const partners = truckReports.find((report) => report.id === 'owner-shares-loans')?.build({ detail: 'detailed', entityId: 'truck-1', ownerId: 'owner-1' });
assert.equal(partners?.rows[0][1], 'John');
assert.equal(truckReports.find((report) => report.id === 'owner-shares-loans')?.build({ detail: 'detailed', entityId: 'truck-1', query: 'John' }).rows.length, 1);
assert.equal(truckReports.find((report) => report.id === 'owner-shares-loans')?.build({ detail: 'detailed', entityId: 'truck-1', ownerId: 'owner-1', category: 'Loan' }).rows.length, 1);
const activity = truckReports.find((report) => report.id === 'transactions-by-truck-owner')?.build({ detail: 'full', entityId: 'truck-1', ownerId: 'owner-1' });
assert.equal(activity?.rows.length, 1);

console.log('Context-aware export tests passed.');
