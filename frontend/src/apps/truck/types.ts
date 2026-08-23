export type TransactionType = 
  | 'INCOME'             // Freight revenue, haul pay, detention
  | 'EXPENSE'            // Diesel, maintenance, repairs, insurance, driver
  | 'CAPITAL_INJECTION'  // Owner gave cash to truck (Truck owes owner)
  | 'CAPITAL_REPAYMENT'  // Truck repaid cash back to owner
  | 'PROFIT_DISTRIBUTION'; // Truck paid net profit dividend to owner

export interface Owner {
  id: string;
  truckId: string;
  name: string;
  startDate: string;
  equityPercentage: number; // e.g. 50 = 50%
  monthlyDrawRate: number;  // Base monthly draw/rate e.g. 4800
  avatarColor: string;
}

export interface Truck {
  id: string;
  name: string;
  unitNumber: string;
  makeModel: string;
  vin: string;
  cashOnHand: number; // Current cash held in truck account
  licensePlate: string;
}

export interface Transaction {
  id: string;
  truckId: string;
  date: string;
  type: TransactionType;
  category: string; // e.g., "Freight Haul", "Maintenance & Repairs", "Diesel Fuel", "Owner Loan", "Debt Repayment", "Profit Share"
  amount: number;
  ownerId?: string; // Target owner if injection, repayment, or profit payout
  description: string;
  referenceNo?: string; // Check #, Invoice #, Receipt #
}

export interface OwnerFinancialSummary {
  owner: Owner;
  totalInjected: number;     // Cash owner lent to truck
  totalRepaid: number;       // Cash truck returned to owner
  unpaidBalance: number;     // totalInjected - totalRepaid (What truck owes owner for capital)
  earnedProfitShare: number; // Cumulative net profit allocated by equity %
  paidOutProfit: number;     // Profit distributions actually paid out
  totalUnpaidMoneyOwed: number; // unpaidBalance + (earnedProfitShare - paidOutProfit)
}

export interface TruckFinancialSummary {
  truckId: string;
  truckName: string;
  cashOnHand: number;
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  totalOwnerInjections: number;
  totalOwnerRepayments: number;
  totalProfitDistributed: number;
  totalUnpaidDebtToOwners: number;
  ownerSummaries: OwnerFinancialSummary[];
  grossIncome: number;
  operatingExpenses: number;
}
