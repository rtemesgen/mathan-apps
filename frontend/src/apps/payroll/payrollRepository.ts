import type { Employee, SalaryChange, Transaction } from './types';
import type { PersistenceState, RepositoryResult } from '../../lib/repositories/types';
import { useSnapshotRepository } from '../../lib/repositories/useSnapshotRepository';

type Persist<T> = (next: T) => Promise<PersistenceState>;

/** Payroll repository adapter: domain operations and their snapshot-backed persistence stay together. */
export function usePayrollRepository() {
  const employees = useSnapshotRepository<Employee[]>('payroll', 'employees', []);
  const transactions = useSnapshotRepository<Transaction[]>('payroll', 'transactions', []);
  const persistEmployees = employees[4];
  const persistTransactions = transactions[4];
  return {
    employees,
    transactions,
    actions: {
      saveEmployee: (employee: Employee) => saveEmployee(employee, employees[0], persistEmployees),
      deleteEmployee: (employeeId: string) => saveRemovedEmployee(employeeId, employees[0], transactions[0], persistEmployees, persistTransactions),
      saveRaise: (employeeId: string, raise: Parameters<typeof saveEmployeeRaise>[1]) => saveEmployeeRaise(employeeId, raise, employees[0], persistEmployees),
      saveTransaction: (transaction: Transaction) => savePayrollTransaction(transaction, transactions[0], persistTransactions),
      deleteTransaction: (transactionId: string) => saveRemovedPayrollTransaction(transactionId, transactions[0], persistTransactions),
      updateRaise: (employeeId: string, raise: Parameters<typeof saveUpdatedRaise>[1]) => saveUpdatedRaise(employeeId, raise, employees[0], persistEmployees),
      deleteRaise: (employeeId: string, raiseId: string) => saveRemovedRaise(employeeId, raiseId, employees[0], persistEmployees),
    },
  };
}

export function addEmployee(employee: Employee, employees: Employee[]): RepositoryResult<Employee[]> {
  return { data: [employee, ...employees], persistence: 'saving' };
}

export function updateEmployee(employee: Employee, employees: Employee[]): RepositoryResult<Employee[]> {
  return { data: employees.map((item) => item.id === employee.id ? employee : item), persistence: 'saving' };
}

export function removeEmployee(employeeId: string, employees: Employee[], transactions: Transaction[]): RepositoryResult<{ employees: Employee[]; transactions: Transaction[] }> {
  return { data: { employees: employees.filter((employee) => employee.id !== employeeId), transactions: transactions.filter((transaction) => transaction.employeeId !== employeeId) }, persistence: 'saving' };
}

export function addRaise(employeeId: string, raise: SalaryChange, employees: Employee[]): RepositoryResult<Employee[]> {
  return { data: employees.map((employee) => employee.id === employeeId
    ? { ...employee, salaryHistory: [...(employee.salaryHistory || []), raise].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)) }
    : employee), persistence: 'saving' };
}

export function addTransaction(transaction: Transaction, transactions: Transaction[]): RepositoryResult<Transaction[]> {
  return { data: [transaction, ...transactions], persistence: 'saving' };
}

export function updateTransaction(transaction: Transaction, transactions: Transaction[]): RepositoryResult<Transaction[]> {
  return { data: transactions.map((item) => item.id === transaction.id ? transaction : item), persistence: 'saving' };
}

export function removeTransaction(transactionId: string, transactions: Transaction[]): RepositoryResult<Transaction[]> {
  return { data: transactions.filter((item) => item.id !== transactionId), persistence: 'saving' };
}

export function updateRaise(employeeId: string, raise: SalaryChange, employees: Employee[]): RepositoryResult<Employee[]> {
  return { data: employees.map((employee) => employee.id === employeeId
    ? { ...employee, salaryHistory: employee.salaryHistory.map((item) => item.id === raise.id ? raise : item) }
    : employee), persistence: 'saving' };
}

export function removeRaise(employeeId: string, raiseId: string, employees: Employee[]): RepositoryResult<Employee[]> {
  return { data: employees.map((employee) => employee.id === employeeId
    ? { ...employee, salaryHistory: employee.salaryHistory.filter((item) => item.id !== raiseId) }
    : employee), persistence: 'saving' };
}

/** Payroll mutations own their next-state calculation; shared storage owns durability and synchronization. */
export async function saveEmployee(employee: Employee, employees: Employee[], persistEmployees: Persist<Employee[]>) {
  const result = employees.some((item) => item.id === employee.id) ? updateEmployee(employee, employees) : addEmployee(employee, employees);
  return { ...result, persistence: await persistEmployees(result.data) };
}

export async function saveRemovedEmployee(employeeId: string, employees: Employee[], transactions: Transaction[], persistEmployees: Persist<Employee[]>, persistTransactions: Persist<Transaction[]>) {
  const result = removeEmployee(employeeId, employees, transactions);
  await persistEmployees(result.data.employees);
  const persistence = await persistTransactions(result.data.transactions);
  return { ...result, persistence };
}

export async function saveEmployeeRaise(employeeId: string, raise: SalaryChange, employees: Employee[], persistEmployees: Persist<Employee[]>) {
  const result = addRaise(employeeId, raise, employees);
  return { ...result, persistence: await persistEmployees(result.data) };
}

export async function savePayrollTransaction(transaction: Transaction, transactions: Transaction[], persistTransactions: Persist<Transaction[]>) {
  const result = transactions.some((item) => item.id === transaction.id) ? updateTransaction(transaction, transactions) : addTransaction(transaction, transactions);
  return { ...result, persistence: await persistTransactions(result.data) };
}

export async function saveRemovedPayrollTransaction(transactionId: string, transactions: Transaction[], persistTransactions: Persist<Transaction[]>) {
  const result = removeTransaction(transactionId, transactions);
  return { ...result, persistence: await persistTransactions(result.data) };
}

export async function saveUpdatedRaise(employeeId: string, raise: SalaryChange, employees: Employee[], persistEmployees: Persist<Employee[]>) {
  const result = updateRaise(employeeId, raise, employees);
  return { ...result, persistence: await persistEmployees(result.data) };
}

export async function saveRemovedRaise(employeeId: string, raiseId: string, employees: Employee[], persistEmployees: Persist<Employee[]>) {
  const result = removeRaise(employeeId, raiseId, employees);
  return { ...result, persistence: await persistEmployees(result.data) };
}
