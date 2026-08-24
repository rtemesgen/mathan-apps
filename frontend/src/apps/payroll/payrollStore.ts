import { useSnapshotRepository } from '../../lib/repositories/useSnapshotRepository';
import type { Employee, Transaction } from './types';
import { saveEmployee, saveEmployeeRaise, savePayrollTransaction, saveRemovedEmployee, saveRemovedPayrollTransaction, saveRemovedRaise, saveUpdatedRaise } from './payrollRepository';

/** React adapter for Payroll persistence; storage and sync remain in shared infrastructure. */
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
