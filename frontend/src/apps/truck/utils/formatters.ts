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

/** Returns only the user-entered transaction detail, not the category label. */
export const transactionDetails = (transaction: Pick<Transaction, 'description' | 'category'>): string => {
  const description = transaction.description?.trim() ?? '';
  const category = transaction.category?.trim() ?? '';
  if (!description || description === category || (category && description === `${category} entry`)) return '';
  const categorySuffix = category ? ` - ${category}` : '';
  return categorySuffix && description.endsWith(categorySuffix)
    ? description.slice(0, -categorySuffix.length).trim()
    : description;
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
  let cashIncome = 0;
  let cashExpenses = 0;

  filteredTx.forEach((tx) => {
    switch (tx.type) {
      case 'INCOME':
        totalIncome += tx.amount;
        cashIncome += tx.amount;
        break;
      case 'EXPENSE':
        totalExpenses += tx.amount;
        cashExpenses += tx.amount;
        break;
      case 'RECEIVABLE':
        totalIncome += tx.amount;
        break;
      case 'PAYABLE':
        totalExpenses += tx.amount;
        break;
      case 'RECEIVABLE_SETTLEMENT':
        cashIncome += tx.amount;
        break;
      case 'PAYABLE_SETTLEMENT':
        cashExpenses += tx.amount;
        break;
      case 'CAPITAL_INJECTION':
        totalOwnerInjections += tx.amount;
        cashIncome += tx.amount;
        break;
      case 'CAPITAL_REPAYMENT':
        totalOwnerRepayments += tx.amount;
        cashExpenses += tx.amount;
        break;
      case 'PROFIT_DISTRIBUTION':
        totalProfitDistributed += tx.amount;
        cashExpenses += tx.amount;
        break;
    }
  });

  const netProfit = totalIncome - totalExpenses;
  
  // Cash on hand = Initial cash + Income - Expenses + Injections - Repayments - Profit Distributed
  const computedCashOnHand = truck.cashOnHand + cashIncome - cashExpenses;

  const outstanding = new Map<string, { type: 'receivable' | 'payable'; amount: number; name: string; ownerId?: string }>();
  filteredTx.forEach((tx) => {
    if (tx.type === 'RECEIVABLE' || tx.type === 'PAYABLE') {
      outstanding.set(tx.id, { type: tx.type === 'RECEIVABLE' ? 'receivable' : 'payable', amount: tx.amount, name: tx.counterpartyName || 'Unassigned', ownerId: tx.ownerId });
    }
  });
  filteredTx.forEach((tx) => {
    if ((tx.type === 'RECEIVABLE_SETTLEMENT' || tx.type === 'PAYABLE_SETTLEMENT') && tx.settlesTransactionId) {
      const item = outstanding.get(tx.settlesTransactionId);
      if (item) item.amount = Math.max(0, item.amount - tx.amount);
    } else if (tx.type === 'RECEIVABLE_SETTLEMENT' || tx.type === 'PAYABLE_SETTLEMENT') {
      const expectedType = tx.type === 'RECEIVABLE_SETTLEMENT' ? 'receivable' : 'payable';
      let remaining = tx.amount;
      for (const item of outstanding.values()) {
        if (remaining <= 0) break;
        if (item.type === expectedType && item.name.toLowerCase() === (tx.counterpartyName || '').trim().toLowerCase()) {
          const applied = Math.min(item.amount, remaining);
          item.amount -= applied;
          remaining -= applied;
        }
      }
    }
  });
  const counterpartyBalances = [...outstanding.values()].filter((item) => item.amount > 0).map((item) => ({ type: item.type, name: item.name, ownerId: item.ownerId, amount: item.amount }));
  const totalReceivable = counterpartyBalances.filter((item) => item.type === 'receivable').reduce((sum, item) => sum + item.amount, 0);
  const totalPayable = counterpartyBalances.filter((item) => item.type === 'payable').reduce((sum, item) => sum + item.amount, 0);

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
    totalReceivable,
    totalPayable,
    counterpartyBalances,
  };
};
