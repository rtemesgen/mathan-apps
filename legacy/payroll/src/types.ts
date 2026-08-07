export interface SalaryChange {
  id: string;
  effectiveDate: string; // YYYY-MM-DD
  newMonthlySalary: number;
  reason: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  employeeId: string;
  employeeName?: string;
  amount: number;
  date: string; // YYYY-MM-DD
  type: 'withdrawal' | 'advance' | 'monthly_payout' | 'adjustment';
  paymentMethod?: string;
  referenceNo?: string;
  notes?: string;
  createdAt: string;
}

export interface Employee {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  initialSalary: number; // Initial monthly rate
  salaryHistory: SalaryChange[];
  status: 'active' | 'on_leave' | 'terminated';
  createdAt: string;
}

export interface AccrualInterval {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  days: number;
  monthlySalary: number;
  dailyRate: number;
  accruedAmount: number;
  reasonNote?: string;
}

export interface EmployeeAccrualSummary {
  employee: Employee;
  asOfDate: string; // YYYY-MM-DD
  currentMonthlySalary: number;
  totalAccruedWages: number;
  totalWithdrawn: number;
  remainingBalance: number;
  intervals: AccrualInterval[];
  lastPayoutDate?: string;
}

export interface CompanyStats {
  totalEmployees: number;
  activeEmployees: number;
  totalMonthlyPayrollRate: number;
  totalCompanyAccrued: number;
  totalCompanyPaidOut: number;
  totalCompanyLiability: number; // Sum of remaining balances
}

export interface SystemApp {
  id: string;
  name: string;
  category: string;
  description: string;
  iconName: string;
  badgeColor: string;
  status: 'active' | 'installed' | 'ready';
  itemCount?: string;
  lastUsed?: string;
}

