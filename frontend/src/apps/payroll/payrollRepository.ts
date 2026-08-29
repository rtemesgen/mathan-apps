import type { Employee, SalaryChange, Transaction } from './types';
import type { PersistenceState, RepositoryResult } from '../../lib/repositories/types';
import { useSnapshotRepository } from '../../lib/repositories/useSnapshotRepository';

type Persist<T> = (next: T) => Promise<PersistenceState>;
type PersistUpdate<T> = (update: (current: T) => T) => Promise<PersistenceState>;
export type PayrollState = { employees: Employee[]; transactions: Transaction[] };

export function combineLegacyPayrollSnapshots(values: Record<string, unknown>): PayrollState {
  return {
    employees: Array.isArray(values.employees) ? values.employees as Employee[] : [],
    transactions: Array.isArray(values.transactions) ? values.transactions as Transaction[] : [],
  };
}

export function mergePayrollStates(current: PayrollState, legacy: PayrollState): PayrollState {
  return {
    employees: [...current.employees, ...legacy.employees.filter((candidate) => !current.employees.some((employee) => employee.id === candidate.id))],
    transactions: [...current.transactions, ...legacy.transactions.filter((candidate) => !current.transactions.some((transaction) => transaction.id === candidate.id))],
  };
}

const emptyPayrollState: PayrollState = { employees: [], transactions: [] };
const payrollLegacy = { keys: ['employees', 'transactions'], combine: combineLegacyPayrollSnapshots, merge: mergePayrollStates };

/** Payroll repository adapter: domain operations and their snapshot-backed persistence stay together. */
export function usePayrollRepository() {
  const state = useSnapshotRepository<PayrollState>('payroll', 'state', emptyPayrollState, payrollLegacy);
  const [current, , ready, status, , updateState] = state;
  const updateEmployees = (update: (employees: Employee[]) => Employee[]) => updateState((value) => ({ ...value, employees: update(value.employees) }));
  const updateTransactions = (update: (transactions: Transaction[]) => Transaction[]) => updateState((value) => ({ ...value, transactions: update(value.transactions) }));
  const employees = [current.employees, undefined, ready, status] as const;
  const transactions = [current.transactions, undefined, ready, status] as const;
  return {
    employees,
    transactions,
    actions: {
      saveEmployee: async (employee: Employee) => { const result = current.employees.some((item) => item.id === employee.id) ? updateEmployee(employee, current.employees) : addEmployee(employee, current.employees); const persistence = await updateEmployees((items) => items.some((item) => item.id === employee.id) ? items.map((item) => item.id === employee.id ? employee : item) : [employee, ...items]); return { ...result, persistence }; },
      deleteEmployee: async (employeeId: string) => { const result = removeEmployee(employeeId, current.employees, current.transactions); const persistence = await updateState((value) => ({ employees: value.employees.filter((employee) => employee.id !== employeeId), transactions: value.transactions.filter((transaction) => transaction.employeeId !== employeeId) })); return { ...result, persistence }; },
      saveRaise: (employeeId: string, raise: Parameters<typeof saveEmployeeRaise>[1]) => updateEmployees((items) => addRaise(employeeId, raise, items).data),
      saveTransaction: async (transaction: Transaction) => { if (!current.employees.some((employee) => employee.id === transaction.employeeId)) throw new Error('The employee for this payment is not available locally.'); const result = current.transactions.some((item) => item.id === transaction.id) ? updateTransaction(transaction, current.transactions) : addTransaction(transaction, current.transactions); const persistence = await updateTransactions((items) => items.some((item) => item.id === transaction.id) ? items.map((item) => item.id === transaction.id ? transaction : item) : [transaction, ...items]); return { ...result, persistence }; },
      deleteTransaction: (transactionId: string) => updateTransactions((items) => items.filter((item) => item.id !== transactionId)),
      updateRaise: (employeeId: string, raise: Parameters<typeof saveUpdatedRaise>[1]) => updateEmployees((items) => updateRaise(employeeId, raise, items).data),
      deleteRaise: (employeeId: string, raiseId: string) => updateEmployees((items) => removeRaise(employeeId, raiseId, items).data),
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
export async function saveEmployee(employee: Employee, employees: Employee[], persistEmployees: Persist<Employee[]>, updateEmployees?: PersistUpdate<Employee[]>) {
  const result = employees.some((item) => item.id === employee.id) ? updateEmployee(employee, employees) : addEmployee(employee, employees);
  const persistence = updateEmployees
    ? await updateEmployees((current) => current.some((item) => item.id === employee.id) ? current.map((item) => item.id === employee.id ? employee : item) : [employee, ...current])
    : await persistEmployees(result.data);
  return { ...result, persistence };
}

export async function saveRemovedEmployee(employeeId: string, employees: Employee[], transactions: Transaction[], persistEmployees: Persist<Employee[]>, persistTransactions: Persist<Transaction[]>, updateEmployees?: PersistUpdate<Employee[]>, updateTransactions?: PersistUpdate<Transaction[]>) {
  const result = removeEmployee(employeeId, employees, transactions);
  if (updateEmployees) await updateEmployees((current) => current.filter((employee) => employee.id !== employeeId));
  else await persistEmployees(result.data.employees);
  const persistence = updateTransactions
    ? await updateTransactions((current) => current.filter((transaction) => transaction.employeeId !== employeeId))
    : await persistTransactions(result.data.transactions);
  return { ...result, persistence };
}

export async function saveEmployeeRaise(employeeId: string, raise: SalaryChange, employees: Employee[], persistEmployees: Persist<Employee[]>, updateEmployees?: PersistUpdate<Employee[]>) {
  const result = addRaise(employeeId, raise, employees);
  const persistence = updateEmployees
    ? await updateEmployees((current) => current.map((employee) => employee.id === employeeId ? { ...employee, salaryHistory: [...(employee.salaryHistory || []), raise].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)) } : employee))
    : await persistEmployees(result.data);
  return { ...result, persistence };
}

export async function savePayrollTransaction(transaction: Transaction, transactions: Transaction[], persistTransactions: Persist<Transaction[]>, updateTransactions?: PersistUpdate<Transaction[]>) {
  const result = transactions.some((item) => item.id === transaction.id) ? updateTransaction(transaction, transactions) : addTransaction(transaction, transactions);
  const persistence = updateTransactions
    ? await updateTransactions((current) => current.some((item) => item.id === transaction.id) ? current.map((item) => item.id === transaction.id ? transaction : item) : [transaction, ...current])
    : await persistTransactions(result.data);
  return { ...result, persistence };
}

export async function saveRemovedPayrollTransaction(transactionId: string, transactions: Transaction[], persistTransactions: Persist<Transaction[]>, updateTransactions?: PersistUpdate<Transaction[]>) {
  const result = removeTransaction(transactionId, transactions);
  const persistence = updateTransactions
    ? await updateTransactions((current) => current.filter((item) => item.id !== transactionId))
    : await persistTransactions(result.data);
  return { ...result, persistence };
}

export async function saveUpdatedRaise(employeeId: string, raise: SalaryChange, employees: Employee[], persistEmployees: Persist<Employee[]>, updateEmployees?: PersistUpdate<Employee[]>) {
  const result = updateRaise(employeeId, raise, employees);
  const persistence = updateEmployees
    ? await updateEmployees((current) => current.map((employee) => employee.id === employeeId ? { ...employee, salaryHistory: employee.salaryHistory.map((item) => item.id === raise.id ? raise : item) } : employee))
    : await persistEmployees(result.data);
  return { ...result, persistence };
}

export async function saveRemovedRaise(employeeId: string, raiseId: string, employees: Employee[], persistEmployees: Persist<Employee[]>, updateEmployees?: PersistUpdate<Employee[]>) {
  const result = removeRaise(employeeId, raiseId, employees);
  const persistence = updateEmployees
    ? await updateEmployees((current) => current.map((employee) => employee.id === employeeId ? { ...employee, salaryHistory: employee.salaryHistory.filter((item) => item.id !== raiseId) } : employee))
    : await persistEmployees(result.data);
  return { ...result, persistence };
}
