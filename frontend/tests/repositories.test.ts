import assert from 'node:assert/strict';
import { createBook, createTransaction, removeBook } from '../src/apps/book/cashBookRepository';
import { addEmployee, addRaise, removeEmployee } from '../src/apps/payroll/payrollRepository';
import type { Book, Transaction as BookTransaction } from '../src/apps/book/types';
import type { Employee, SalaryChange, Transaction as PayrollTransaction } from '../src/apps/payroll/types';

const book: Book = { id: 'b1', name: 'Test', currency: 'USD', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
const bookTx: BookTransaction = { id: 'bt1', bookId: 'b1', type: 'in', amount: 10, remark: 'sale', createdAt: '2026-01-01', dateTime: '2026-01-01T00:00' };
const employee: Employee = { id: 'e1', name: 'Employee', startDate: '2026-01-01', initialSalary: 1000, salaryHistory: [], status: 'active', createdAt: '2026-01-01' };
const payrollTx: PayrollTransaction = { id: 'pt1', employeeId: 'e1', amount: 100, date: '2026-01-01', type: 'withdrawal', createdAt: '2026-01-01' };
const raise: SalaryChange = { id: 'r1', effectiveDate: '2026-02-01', newMonthlySalary: 1100, reason: 'review', createdAt: '2026-01-01' };

const createdBook = createBook({ name: 'New', currency: 'USD' }, '2026-01-02T00:00:00.000Z').data;
assert.equal(createdBook.createdAt, '2026-01-02T00:00:00.000Z');
assert.equal(createTransaction('b1', 'out', { amount: 5, remark: 'fuel', dateTime: '2026-01-02T00:00' }).data.type, 'out');
assert.deepEqual(removeBook('b1', [book], [bookTx]).data, { books: [], transactions: [] });
assert.equal(addEmployee(employee, []).data[0].id, 'e1');
assert.equal(addRaise('e1', raise, [employee]).data[0].salaryHistory[0].newMonthlySalary, 1100);
assert.deepEqual(removeEmployee('e1', [employee], [payrollTx]).data, { employees: [], transactions: [] });
console.log('Repository transformation tests passed.');
