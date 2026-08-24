import { useCloudSnapshot } from '../../hooks/useCloudSnapshot';
import type { Employee, Transaction } from './types';

/** React adapter for Payroll persistence; storage and sync remain in shared infrastructure. */
export function usePayrollRepository() {
  const employees = useCloudSnapshot<Employee[]>('payroll', 'employees', []);
  const transactions = useCloudSnapshot<Transaction[]>('payroll', 'transactions', []);
  return { employees, transactions };
}
