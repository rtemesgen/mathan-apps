import type { Employee, SalaryChange, Transaction } from './types';
import type { RepositoryResult } from '../../lib/repositories/types';

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
