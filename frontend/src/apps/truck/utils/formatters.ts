import { Owner, Transaction, Truck, TruckFinancialSummary, OwnerFinancialSummary } from '../types';

export const formatCurrency = (amount: number, showCents: boolean = true): string => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });
  return formatter.format(amount);
};

export const formatDate = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Calculates complete financial metrics for a truck given its owners and transactions
 */
export const calculateTruckFinancials = (
  truck: Truck,
  owners: Owner[],
  transactions: Transaction[],
  calculationDate?: string
): TruckFinancialSummary => {
  // Filter transactions up to calculation date if specified
  const filteredTx = calculationDate
    ? transactions.filter((t) => !calculationDate || t.date <= calculationDate)
    : transactions;

  let totalIncome = 0;
  let totalExpenses = 0;
  let totalOwnerInjections = 0;
  let totalOwnerRepayments = 0;
  let totalProfitDistributed = 0;

  filteredTx.forEach((tx) => {
    switch (tx.type) {
      case 'INCOME':
        totalIncome += tx.amount;
        break;
      case 'EXPENSE':
        totalExpenses += tx.amount;
        break;
      case 'CAPITAL_INJECTION':
        totalOwnerInjections += tx.amount;
        break;
      case 'CAPITAL_REPAYMENT':
        totalOwnerRepayments += tx.amount;
        break;
      case 'PROFIT_DISTRIBUTION':
        totalProfitDistributed += tx.amount;
        break;
    }
  });

  const netProfit = totalIncome - totalExpenses;
  
  // Cash on hand = Initial cash + Income - Expenses + Injections - Repayments - Profit Distributed
  const computedCashOnHand = truck.cashOnHand + totalIncome - totalExpenses + totalOwnerInjections - totalOwnerRepayments - totalProfitDistributed;

  // Calculate per-owner metrics
  const ownerSummaries: OwnerFinancialSummary[] = owners.map((owner) => {
    const ownerTx = filteredTx.filter((t) => t.ownerId === owner.id);

    // Capital injections & repayments for this owner
    const ownerInjected = ownerTx
      .filter((t) => t.type === 'CAPITAL_INJECTION')
      .reduce((sum, t) => sum + t.amount, 0);

    const ownerRepaid = ownerTx
      .filter((t) => t.type === 'CAPITAL_REPAYMENT')
      .reduce((sum, t) => sum + t.amount, 0);

    const unpaidBalance = Math.max(0, ownerInjected - ownerRepaid);

    // Profit share earned by equity %
    const earnedProfitShare = (Math.max(0, netProfit) * (owner.equityPercentage / 100));

    // Profit distributed to this owner
    const paidOutProfit = ownerTx
      .filter((t) => t.type === 'PROFIT_DISTRIBUTION')
      .reduce((sum, t) => sum + t.amount, 0);

    // Total money owed = Unpaid Capital Injections + Unpaid Profit Dividends
    const unpaidProfit = Math.max(0, earnedProfitShare - paidOutProfit);
    const totalUnpaidMoneyOwed = unpaidBalance + unpaidProfit;

    return {
      owner,
      totalInjected: ownerInjected,
      totalRepaid: ownerRepaid,
      unpaidBalance,
      earnedProfitShare,
      paidOutProfit,
      totalUnpaidMoneyOwed,
    };
  });

  const totalUnpaidDebtToOwners = ownerSummaries.reduce(
    (sum, o) => sum + o.totalUnpaidMoneyOwed,
    0
  );

  return {
    truckId: truck.id,
    truckName: truck.name,
    cashOnHand: computedCashOnHand,
    totalIncome,
    totalExpenses,
    netProfit,
    totalOwnerInjections,
    totalOwnerRepayments,
    totalProfitDistributed,
    totalUnpaidDebtToOwners,
    ownerSummaries,
    grossIncome: totalIncome,
    operatingExpenses: totalExpenses,
  };
};
