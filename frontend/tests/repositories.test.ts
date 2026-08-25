import assert from 'node:assert/strict';
import { createBook, createTransaction, removeBook, saveImportedBooks, saveNewBook, saveNewTransaction, saveNewTransactionAndTouchBook, saveRemovedBook } from '../src/apps/book/cashBookRepository';
import { addEmployee, addRaise, removeEmployee, saveEmployee, savePayrollTransaction, saveRemovedEmployee } from '../src/apps/payroll/payrollRepository';
import type { Book, Transaction as BookTransaction } from '../src/apps/book/types';
import type { Employee, SalaryChange, Transaction as PayrollTransaction } from '../src/apps/payroll/types';
import { persistBeforeQueue } from '../src/lib/repositories/mutationLifecycle';
import { shouldApplyRemoteSnapshot } from '../src/lib/repositories/snapshotRepository';

const book: Book = { id: 'b1', name: 'Test', currency: 'USD', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
const bookTx: BookTransaction = { id: 'bt1', bookId: 'b1', type: 'in', amount: 10, remark: 'sale', createdAt: '2026-01-01', dateTime: '2026-01-01T00:00' };
const employee: Employee = { id: 'e1', name: 'Employee', startDate: '2026-01-01', initialSalary: 1000, salaryHistory: [], status: 'active', createdAt: '2026-01-01' };
const payrollTx: PayrollTransaction = { id: 'pt1', employeeId: 'e1', amount: 100, date: '2026-01-01', type: 'withdrawal', createdAt: '2026-01-01' };
const raise: SalaryChange = { id: 'r1', effectiveDate: '2026-02-01', newMonthlySalary: 1100, reason: 'review', createdAt: '2026-01-01' };

const lifecycleOrder: string[] = [];
await persistBeforeQueue(async () => { lifecycleOrder.push('local'); return 'stored'; }, async () => { lifecycleOrder.push('queue'); });
assert.deepEqual(lifecycleOrder, ['local', 'queue'], 'every repository mutation must persist locally before queueing');
let queuedAfterStorageFailure = false;
await assert.rejects(
  persistBeforeQueue(async () => { throw new Error('storage unavailable'); }, async () => { queuedAfterStorageFailure = true; }),
  /storage unavailable/,
);
assert.equal(queuedAfterStorageFailure, false, 'a storage failure must never enqueue a mutation');

const createdBook = createBook({ name: 'New', currency: 'USD' }, '2026-01-02T00:00:00.000Z').data;
assert.equal(createdBook.createdAt, '2026-01-02T00:00:00.000Z');
assert.equal(createTransaction('b1', 'out', { amount: 5, remark: 'fuel', dateTime: '2026-01-02T00:00' }).data.type, 'out');
assert.deepEqual(removeBook('b1', [book], [bookTx]).data, { books: [], transactions: [] });
assert.equal(addEmployee(employee, []).data[0].id, 'e1');
assert.equal(addRaise('e1', raise, [employee]).data[0].salaryHistory[0].newMonthlySalary, 1100);
assert.deepEqual(removeEmployee('e1', [employee], [payrollTx]).data, { employees: [], transactions: [] });
assert.equal(shouldApplyRemoteSnapshot(2, 1, false), true);
assert.equal(shouldApplyRemoteSnapshot(1, 1, false), false);
assert.equal(shouldApplyRemoteSnapshot(3, 1, true), false);

const persistedBooks: Book[][] = [];
const persistBooks = async (next: Book[]) => { persistedBooks.push(next); return 'saved locally' as const; };
const persistedBookTransactions: BookTransaction[][] = [];
const persistBookTransactions = async (next: BookTransaction[]) => { persistedBookTransactions.push(next); return 'offline saved' as const; };
const created = await saveNewBook({ name: 'Persisted', currency: 'USD' }, [book], persistBooks);
assert.equal(created.data.name, 'Persisted');
assert.equal(created.persistence, 'saved locally');
assert.equal(persistedBooks[0][0].id, created.data.id);
let latestBooks = [book];
const updateBooks = async (update: (current: Book[]) => Book[]) => { latestBooks = update(latestBooks); return 'saved locally' as const; };
const rapidBookA = await saveNewBook({ name: 'Rapid A', currency: 'USD' }, latestBooks, persistBooks, updateBooks);
const rapidBookB = await saveNewBook({ name: 'Rapid B', currency: 'USD' }, latestBooks, persistBooks, updateBooks);
assert.deepEqual(latestBooks.map((item) => item.name), ['Rapid B', 'Rapid A', 'Test'], 'snapshot updater must derive each save from the latest state');
assert.equal(rapidBookA.persistence, 'saved locally');
assert.equal(rapidBookB.persistence, 'saved locally');
await saveNewTransaction('b1', 'in', { amount: 25, remark: 'invoice', dateTime: '2026-01-02T00:00' }, [bookTx], persistBookTransactions);
assert.equal(persistedBookTransactions[0][0].remark, 'invoice');
const persistedOrder: string[] = [];
await saveNewTransactionAndTouchBook('b1', 'in', { amount: 30, remark: 'ordered', dateTime: '2026-01-03T00:00' }, [bookTx], [book], async (next) => { persistedOrder.push(`transactions:${next[0].remark}`); return 'saved locally'; }, async () => { persistedOrder.push('books'); return 'saved locally'; });
assert.deepEqual(persistedOrder, ['transactions:ordered', 'books']);
const imported = await saveImportedBooks([{ book: { name: 'Imported', currency: 'USD' }, transactions: [{ amount: 9, remark: 'opening', dateTime: '2026-01-03T00:00', type: 'in' }] }], [book], [bookTx], persistBooks, persistBookTransactions);
assert.equal(imported.data.books.length, 2);
assert.equal(imported.data.transactions.length, 2);
assert.equal(imported.data.transactions[0].bookId, imported.data.books[0].id);
await saveRemovedBook('b1', [book], [bookTx], persistBooks, persistBookTransactions);
assert.deepEqual(persistedBooks.at(-1), []);
assert.deepEqual(persistedBookTransactions.at(-1), []);

const persistedEmployees: Employee[][] = [];
const persistEmployees = async (next: Employee[]) => { persistedEmployees.push(next); return 'saved locally' as const; };
const persistedPayrollTransactions: PayrollTransaction[][] = [];
const persistPayrollTransactions = async (next: PayrollTransaction[]) => { persistedPayrollTransactions.push(next); return 'offline saved' as const; };
await saveEmployee(employee, [], persistEmployees);
assert.equal(persistedEmployees[0][0].id, employee.id);
await savePayrollTransaction(payrollTx, [], persistPayrollTransactions);
assert.equal(persistedPayrollTransactions[0][0].id, payrollTx.id);
let latestEmployees: Employee[] = [];
const updateEmployees = async (update: (current: Employee[]) => Employee[]) => { latestEmployees = update(latestEmployees); return 'saved locally' as const; };
await saveEmployee({ ...employee, id: 'e2', name: 'Second employee' }, latestEmployees, persistEmployees, updateEmployees);
await saveEmployee({ ...employee, id: 'e3', name: 'Third employee' }, latestEmployees, persistEmployees, updateEmployees);
assert.deepEqual(latestEmployees.map((item) => item.id), ['e3', 'e2'], 'payroll snapshot updater must retain consecutive employee saves');
await saveRemovedEmployee('e1', [employee], [payrollTx], persistEmployees, persistPayrollTransactions);
assert.deepEqual(persistedEmployees.at(-1), []);
assert.deepEqual(persistedPayrollTransactions.at(-1), []);
console.log('Repository transformation tests passed.');
