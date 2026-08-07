import { Employee, Transaction, EmployeeAccrualSummary, AccrualInterval, CompanyStats } from '../types';

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
  const { startDate, initialSalary, salaryHistory } = employee;

  // Filter transactions for this employee up to asOfDate
  const empTransactions = transactions.filter(
    (t) => t.employeeId === employee.id && t.date <= asOfDateStr
  );

  const totalWithdrawn = empTransactions.reduce((sum, t) => sum + t.amount, 0);

  // Find last payout date
  const sortedTx = [...empTransactions].sort((a, b) => b.date.localeCompare(a.date));
  const lastPayoutDate = sortedTx.length > 0 ? sortedTx[0].date : undefined;

  // If asOfDate is before start date, earnings are zero
  if (asOfDateStr < startDate) {
    return {
      employee,
      asOfDate: asOfDateStr,
      currentMonthlySalary: initialSalary,
      totalAccruedWages: 0,
      totalWithdrawn,
      remainingBalance: -totalWithdrawn,
      intervals: [],
      lastPayoutDate,
    };
  }

  // Sort salary history changes chronologically by effective date
  const sortedSalaryHistory = [...salaryHistory].sort((a, b) =>
    a.effectiveDate.localeCompare(b.effectiveDate)
  );

  // Determine current effective rate as of asOfDate
  let currentMonthlySalary = initialSalary;
  for (const change of sortedSalaryHistory) {
    if (change.effectiveDate <= asOfDateStr) {
      currentMonthlySalary = change.newMonthlySalary;
    }
  }

  // Build timeline intervals
  // We identify key rate change dates that fall between startDate and asOfDate
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

  const milestones: RateMilestone[] = [
    { date: startDate, rate: baseRateAtStart, reasonNote: startNote },
  ];

  // Add changes that happen after startDate and on or before asOfDate
  for (const change of sortedSalaryHistory) {
    if (change.effectiveDate > startDate && change.effectiveDate <= asOfDateStr) {
      milestones.push({
        date: change.effectiveDate,
        rate: change.newMonthlySalary,
        reasonNote: change.reason,
      });
    }
  }

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
      intervalEnd = asOfDateStr;
    }

    if (intervalEnd >= intervalStart) {
      const days = calculateDaysBetween(intervalStart, intervalEnd);
      // Daily rate based on 365.25 days per year (standard financial daily rate = monthly * 12 / 365.25)
      const dailyRate = (currentMs.rate * 12) / 365.25;
      const accruedAmount = days * dailyRate;

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
    'Total Accrued Earnings ($)',
    'Total Paid / Withdrawn ($)',
    'Remaining Balance ($)',
    'Status',
    'Last Payout Date',
  ];

  const rows = employees.map((emp) => {
    const summary = calculateEmployeeAccrual(emp, transactions, asOfDateStr);
    return [
      `"${emp.id}"`,
      `"${emp.name}"`,
      `"${emp.startDate}"`,
      summary.currentMonthlySalary.toFixed(2),
      summary.totalAccruedWages.toFixed(2),
      summary.totalWithdrawn.toFixed(2),
      summary.remainingBalance.toFixed(2),
      `"${emp.status}"`,
      `"${summary.lastPayoutDate || 'None'}"`,
    ];
  });

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
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
      `"${t.id}"`,
      `"${t.date}"`,
      `"${empName}"`,
      `"${t.employeeId}"`,
      `"${t.type}"`,
      t.amount.toFixed(2),
      `"${t.paymentMethod}"`,
      `"${t.referenceNo || ''}"`,
      `"${(t.notes || '').replace(/"/g, '""')}"`,
    ];
  });

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Trigger browser file download for a text string (CSV, JSON, etc.)
 */
export function downloadFile(filename: string, content: string, type = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
