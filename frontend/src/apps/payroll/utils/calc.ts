import { Employee, Transaction, EmployeeAccrualSummary, AccrualInterval, CompanyStats } from '../types';
import { createCsv, downloadTextFile } from '../../../lib/fileExport';
import { formatExportNumber } from '../../../lib/exports/numberFormatting';

/**
 * Format currency to USD or standard localized format
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format date string YYYY-MM-DD to readable format e.g. "Jan 15, 2025"
 */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const date = new Date(year, month, day);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get current date in YYYY-MM-DD format
 */
export function getTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate days between two YYYY-MM-DD dates (inclusive)
 */
export function calculateDaysBetween(startDateStr: string, endDateStr: string): number {
  const [sYear, sMonth, sDay] = startDateStr.split('-').map(Number);
  const [eYear, eMonth, eDay] = endDateStr.split('-').map(Number);

  const startUtc = Date.UTC(sYear, sMonth - 1, sDay);
  const endUtc = Date.UTC(eYear, eMonth - 1, eDay);

  if (endUtc < startUtc) return 0;

  const diffMs = endUtc - startUtc;
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor(diffMs / msPerDay) + 1; // Inclusive count
}

/**
 * Add days to YYYY-MM-DD date string
 */
export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function anniversaryDate(year: number, month: number, dayOfMonth: number): string {
  const day = Math.min(dayOfMonth, daysInMonth(year, month));
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Return the salary cycle containing a date. A cycle starts on the employee's
 * start day each month and ends the day before the next anniversary. Month-end
 * start dates are clamped to the last day of shorter months.
 */
function salaryCycleForDate(startDateStr: string, dateStr: string): { start: string; end: string; days: number } {
  const startDay = Number(startDateStr.split('-')[2]);
  const [year, month] = dateStr.split('-').map(Number);
  let cycleYear = year;
  let cycleMonth = month - 1;
  let cycleStart = anniversaryDate(cycleYear, cycleMonth, startDay);

  if (cycleStart > dateStr) {
    cycleMonth -= 1;
    if (cycleMonth < 0) {
      cycleMonth = 11;
      cycleYear -= 1;
    }
    cycleStart = anniversaryDate(cycleYear, cycleMonth, startDay);
  }

  const nextMonth = cycleMonth === 11 ? 0 : cycleMonth + 1;
  const nextYear = cycleMonth === 11 ? cycleYear + 1 : cycleYear;
  const nextStart = anniversaryDate(nextYear, nextMonth, startDay);
  const cycleEnd = addDays(nextStart, -1);

  return { start: cycleStart, end: cycleEnd, days: calculateDaysBetween(cycleStart, cycleEnd) };
}

export function getSalaryCycleDailyRate(startDateStr: string, dateStr: string, monthlySalary: number): number {
  return (Number(monthlySalary) || 0) / salaryCycleForDate(startDateStr, dateStr).days;
}

/**
 * Core Calculation Engine for Employee Salary Accrual
 * Calculates cumulative earnings from employee start date up to asOfDate
 * taking into account all backdated/historical or future salary rate changes.
 */
export function calculateEmployeeAccrual(
  employee: Employee,
  transactions: Transaction[],
  asOfDateStr: string = getTodayString()
): EmployeeAccrualSummary {
  const { startDate, salaryHistory } = employee;
  const initialSalary = Number(employee.initialSalary) || 0;
  const salaryChanges = (salaryHistory ?? []).map((change) => ({ ...change, newMonthlySalary: Number(change.newMonthlySalary) || 0 }));

  // Filter transactions for this employee up to asOfDate
  const empTransactions = transactions.filter(
    (t) => t.employeeId === employee.id && t.date <= asOfDateStr
  );

  const totalWithdrawn = empTransactions.reduce((sum, t) => sum + t.amount, 0);

  // Find last payout date
  const sortedTx = [...empTransactions].sort((a, b) => b.date.localeCompare(a.date));
  const lastPayoutDate = sortedTx.length > 0 ? sortedTx[0].date : undefined;

  // If asOfDate is before start date, earnings are zero
  const terminationDate = employee.terminationDate || '';
  const earningsEndDate = terminationDate && terminationDate < asOfDateStr ? terminationDate : asOfDateStr;
  if (asOfDateStr < startDate || earningsEndDate < startDate) {
    return {
      employee,
      asOfDate: asOfDateStr,
      currentMonthlySalary: initialSalary,
      totalAccruedWages: 0,
      totalWithdrawn,
      remainingBalance: totalWithdrawn === 0 ? 0 : -totalWithdrawn,
      intervals: [],
      lastPayoutDate,
    };
  }

  // Treat an anniversary date as the completed-cycle boundary. The new cycle
  // starts the following day for accrual purposes, so Jan 17 → Feb 17 is
  // exactly one monthly salary rather than one salary plus a new-cycle day.
  const calculationEndDate = asOfDateStr > startDate && salaryCycleForDate(startDate, asOfDateStr).start === asOfDateStr
    ? addDays(earningsEndDate, -1)
    : earningsEndDate;

  // Sort salary history changes chronologically by effective date
  const sortedSalaryHistory = [...salaryChanges].sort((a, b) =>
    a.effectiveDate.localeCompare(b.effectiveDate)
  );

  // Determine current effective rate as of asOfDate
  let currentMonthlySalary = initialSalary;
  for (const change of sortedSalaryHistory) {
    if (change.effectiveDate <= earningsEndDate) {
      currentMonthlySalary = change.newMonthlySalary;
    }
  }

  // Build timeline intervals. Anniversary boundaries ensure every completed
  // salary cycle is exactly one monthly salary, regardless of month length.
  interface RateMilestone {
    date: string;
    rate: number;
    reasonNote?: string;
  }

  // Determine base rate at startDate
  // If there are raise entries effective before or on startDate, use the latest one
  let baseRateAtStart = initialSalary;
  let startNote = 'Initial Base Salary';

  const priorChanges = sortedSalaryHistory.filter((c) => c.effectiveDate <= startDate);
  if (priorChanges.length > 0) {
    const lastPrior = priorChanges[priorChanges.length - 1];
    baseRateAtStart = lastPrior.newMonthlySalary;
    startNote = `Base Rate set by ${lastPrior.reason}`;
  }

  const milestoneDates = new Set<string>([startDate]);

  // Add changes that happen after startDate and on or before asOfDate
  for (const change of sortedSalaryHistory) {
    if (change.effectiveDate > startDate && change.effectiveDate <= calculationEndDate) {
      milestoneDates.add(change.effectiveDate);
    }
  }

  // Add each monthly anniversary through the requested date. The next cycle
  // boundary is not needed because the last interval is capped at asOfDate.
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth] = calculationEndDate.split('-').map(Number);
  let cursorYear = startYear;
  let cursorMonth = startMonth - 1;
  while (cursorYear < endYear || (cursorYear === endYear && cursorMonth <= endMonth)) {
    const cycleStart = anniversaryDate(cursorYear, cursorMonth, startDay);
    if (cycleStart > startDate && cycleStart <= calculationEndDate) milestoneDates.add(cycleStart);
    cursorMonth += 1;
    if (cursorMonth === 12) {
      cursorMonth = 0;
      cursorYear += 1;
    }
  }

  const milestones: RateMilestone[] = [...milestoneDates].map((date) => {
    let rate = baseRateAtStart;
    let reasonNote = startNote;
    for (const change of sortedSalaryHistory) {
      if (change.effectiveDate <= date) {
        rate = change.newMonthlySalary;
        reasonNote = change.effectiveDate === date ? change.reason : reasonNote;
      }
    }
    return { date, rate, reasonNote };
  });

  // Sort milestones chronologically
  milestones.sort((a, b) => a.date.localeCompare(b.date));

  const intervals: AccrualInterval[] = [];
  let totalAccruedWages = 0;

  for (let i = 0; i < milestones.length; i++) {
    const currentMs = milestones[i];
    const intervalStart = currentMs.date;

    // Interval ends day before next milestone, or asOfDate for last milestone
    let intervalEnd: string;
    if (i < milestones.length - 1) {
      const nextDate = milestones[i + 1].date;
      intervalEnd = addDays(nextDate, -1);
    } else {
      intervalEnd = calculationEndDate;
    }

    if (intervalEnd >= intervalStart) {
      const daysInInterval = calculateDaysBetween(intervalStart, intervalEnd);
      const leaveStart = employee.leaveStartDate || '';
      const leaveEnd = employee.leaveEndDate || calculationEndDate;
      const leaveDays = leaveStart && leaveStart <= intervalEnd && leaveEnd >= intervalStart
        ? calculateDaysBetween(leaveStart > intervalStart ? leaveStart : intervalStart, leaveEnd < intervalEnd ? leaveEnd : intervalEnd)
        : 0;
      const days = Math.max(0, daysInInterval - leaveDays);
      if (days === 0) continue;
      const dailyRate = getSalaryCycleDailyRate(startDate, intervalStart, currentMs.rate);
      // A partial cycle is prorated; the cap prevents rounding or unusual
      // month-end calendars from ever exceeding its monthly salary.
      const accruedAmount = Math.min(currentMs.rate, days * dailyRate);

      totalAccruedWages += accruedAmount;

      intervals.push({
        startDate: intervalStart,
        endDate: intervalEnd,
        days,
        monthlySalary: currentMs.rate,
        dailyRate,
        accruedAmount,
        reasonNote: currentMs.reasonNote,
      });
    }
  }

  const remainingBalance = totalAccruedWages - totalWithdrawn;

  return {
    employee,
    asOfDate: asOfDateStr,
    currentMonthlySalary,
    totalAccruedWages,
    totalWithdrawn,
    remainingBalance,
    intervals,
    lastPayoutDate,
  };
}

/**
 * Calculate overall stats across all employees
 */
export function calculateCompanyStats(
  employees: Employee[],
  transactions: Transaction[],
  asOfDateStr: string = getTodayString()
): CompanyStats {
  let totalMonthlyPayrollRate = 0;
  let totalCompanyAccrued = 0;
  let totalCompanyPaidOut = 0;
  let totalCompanyLiability = 0;
  let activeEmployees = 0;

  for (const emp of employees) {
    const summary = calculateEmployeeAccrual(emp, transactions, asOfDateStr);

    if (emp.status === 'active') {
      activeEmployees++;
      totalMonthlyPayrollRate += summary.currentMonthlySalary;
    }

    totalCompanyAccrued += summary.totalAccruedWages;
    totalCompanyPaidOut += summary.totalWithdrawn;
    totalCompanyLiability += summary.remainingBalance;
  }

  return {
    totalEmployees: employees.length,
    activeEmployees,
    totalMonthlyPayrollRate,
    totalCompanyAccrued,
    totalCompanyPaidOut,
    totalCompanyLiability,
  };
}

/**
 * Generate CSV data string for Payroll Summary
 */
export function exportPayrollCSV(
  employees: Employee[],
  transactions: Transaction[],
  asOfDateStr: string = getTodayString()
): string {
  const headers = [
    'Employee ID',
    'Full Name',
    'Start Date',
    'Current Monthly Salary',
    'Total Earned ($)',
    'Total Paid ($)',
    'Remaining Balance ($)',
    'Status',
    'Last Payout Date',
  ];

  const rows = employees.map((emp) => {
    const summary = calculateEmployeeAccrual(emp, transactions, asOfDateStr);
    return [
      emp.id,
      emp.name,
      emp.startDate,
      formatExportNumber(summary.currentMonthlySalary),
      formatExportNumber(summary.totalAccruedWages),
      formatExportNumber(summary.totalWithdrawn),
      formatExportNumber(summary.remainingBalance),
      emp.status,
      summary.lastPayoutDate || 'None',
    ];
  });

  return createCsv(headers, rows);
}

/**
 * Export Transactions Register CSV
 */
export function exportTransactionsCSV(
  transactions: Transaction[],
  employeesMap: Record<string, Employee>
): string {
  const headers = [
    'Transaction ID',
    'Date',
    'Employee Name',
    'Employee ID',
    'Type',
    'Amount ($)',
    'Payment Method',
    'Reference No',
    'Notes',
  ];

  const rows = transactions.map((t) => {
    const empName = employeesMap[t.employeeId]?.name || t.employeeName || 'Unknown';
    return [
      t.id,
      t.date,
      empName,
      t.employeeId,
      t.type,
      formatExportNumber(t.amount),
      t.paymentMethod,
      t.referenceNo || '',
      t.notes || '',
    ];
  });

  return createCsv(headers, rows);
}

/**
 * Trigger browser file download for a text string (CSV, JSON, etc.)
 */
export function downloadFile(filename: string, content: string, type = 'text/csv;charset=utf-8;') {
  void downloadTextFile(filename, content, type);
}
