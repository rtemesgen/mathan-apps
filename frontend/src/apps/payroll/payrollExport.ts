import type { Employee, Transaction } from './types';
import { calculateEmployeeAccrual, getTodayString } from './utils/calc';
import type { ExportBuildOptions, ExportReportDefinition } from '../../lib/exports/exportTypes';

type PayrollExportData = { employees: Employee[]; transactions: Transaction[]; asOfDate?: string };
const money = (value: number) => value.toFixed(2);
const inRange = (date: string, options: ExportBuildOptions) => (!options.startDate || date >= options.startDate) && (!options.endDate || date <= options.endDate);

export function buildPayrollExportReports(data: PayrollExportData): ExportReportDefinition[] {
  const asOf = data.asOfDate ?? getTodayString();
  const employeeById = new Map(data.employees.map((employee) => [employee.id, employee]));
  const employees = (options: ExportBuildOptions) => data.employees.filter((employee) => !options.entityId || employee.id === options.entityId);
  const summaries = (options: ExportBuildOptions) => employees(options).map((employee) => { const summary = calculateEmployeeAccrual(employee, data.transactions, options.endDate ?? asOf); return [employee.name, employee.department ?? '', employee.status, employee.startDate, money(summary.currentMonthlySalary), money(summary.totalAccruedWages), money(summary.totalWithdrawn), money(summary.remainingBalance)]; });
  const transactionRows = (options: ExportBuildOptions) => data.transactions.filter((tx) => (!options.entityId || tx.employeeId === options.entityId) && inRange(tx.date, options)).sort((a, b) => b.date.localeCompare(a.date)).map((tx) => [tx.date, employeeById.get(tx.employeeId)?.name ?? tx.employeeName ?? 'Unknown employee', tx.type, money(tx.amount), tx.paymentMethod ?? '', tx.referenceNo ?? '', tx.notes ?? '']);
  const detailedEmployees = (options: ExportBuildOptions) => employees(options).flatMap((employee) => { const summary = calculateEmployeeAccrual(employee, data.transactions, options.endDate ?? asOf); const header = [[employee.name, employee.department ?? '', employee.status, employee.startDate, money(summary.currentMonthlySalary), money(summary.totalAccruedWages), money(summary.totalWithdrawn), money(summary.remainingBalance)]]; const details = data.transactions.filter((tx) => tx.employeeId === employee.id && inRange(tx.date, options)).map((tx) => [tx.date, employee.name, tx.type, money(tx.amount), tx.paymentMethod ?? '', tx.referenceNo ?? '', tx.notes ?? '']); return [...header, ...details]; });
  return [
    { id: 'employees-condensed', label: 'Employees condensed', description: 'Payroll totals per employee', build: (options) => ({ title: 'Payroll employees condensed', filename: 'payroll-employees-condensed', headers: ['Employee', 'Department', 'Status', 'Start date', 'Monthly salary', 'Earned', 'Paid', 'Balance'], rows: summaries(options) }) },
    { id: 'employees-detailed', label: 'Employees detailed', description: 'Each employee with transactions below', build: (options) => ({ title: 'Payroll employees detailed', filename: 'payroll-employees-detailed', headers: ['Employee', 'Department / Date', 'Status / Type', 'Start date / Amount', 'Monthly salary / Payment', 'Earned / Reference', 'Paid / Notes', 'Balance'], rows: detailedEmployees(options) }) },
    { id: 'salary-raises', label: 'Salary raises', description: 'Raise history and effective dates', build: (options) => ({ title: 'Payroll salary raises', filename: 'payroll-salary-raises', headers: ['Employee', 'Effective date', 'New monthly salary', 'Reason'], rows: employees(options).flatMap((employee) => employee.salaryHistory.map((raise) => [employee.name, raise.effectiveDate, money(raise.newMonthlySalary), raise.reason])) }) },
    { id: 'payments-withdrawals', label: 'Payments and withdrawals', description: 'Every payroll transaction', build: (options) => ({ title: 'Payroll payments and withdrawals', filename: 'payroll-payments-withdrawals', headers: ['Date', 'Employee', 'Type', 'Amount', 'Payment method', 'Reference', 'Notes'], rows: transactionRows(options) }) },
  ];
}
