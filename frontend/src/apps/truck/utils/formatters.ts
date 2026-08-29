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

/** One shared transaction scope for every Truck projection shown "as of" a
 * selected date. Keeping this separate prevents one screen from calculating
 * all-time totals while another silently hides the same rows. */
export const transactionsAsOf = (transactions: Transaction[], calculationDate?: string) => (
  calculationDate ? transactions.filter((transaction) => transaction.date <= calculationDate) : transactions
);

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
  const filteredTx = transactionsAsOf(transactions, calculationDate);

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
        // Older APKs stored customer trip credit as INCOME plus customer_id.
        // Preserve that business meaning when rebuilding the ledger.
        if (!tx.customerId && tx.counterpartyType !== 'CUSTOMER') cashIncome += tx.amount;
        break;
      case 'EXPENSE':
        totalExpenses += tx.amount;
        if (!tx.customerId && tx.counterpartyType !== 'CUSTOMER') cashExpenses += tx.amount;
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

  const outstanding = new Map<string, { type: 'receivable' | 'payable'; amount: number; name: string; customerId?: string; ownerId?: string; counterpartyType?: Transaction['counterpartyType'] }>();
  filteredTx.forEach((tx) => {
    const legacyCustomerCredit = (tx.type === 'INCOME' || tx.type === 'EXPENSE') && (Boolean(tx.customerId) || tx.counterpartyType === 'CUSTOMER');
    if (tx.type === 'RECEIVABLE' || tx.type === 'PAYABLE' || legacyCustomerCredit) {
      const receivable = tx.type === 'RECEIVABLE' || tx.type === 'INCOME';
      outstanding.set(tx.id, {
        type: receivable ? 'receivable' : 'payable',
        amount: tx.amount,
        name: tx.counterpartyName || 'Unassigned',
        customerId: tx.customerId,
        ownerId: tx.ownerId,
        counterpartyType: tx.counterpartyType,
      });
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
  // A customer can be both a receivable and a payable. Collapse those open
  // rows by customer before reporting so the user sees only the net balance.
  // Use the stable customer id when available; the name fallback preserves
  // compatibility with older imported rows that predate customer_id.
  const grouped = new Map<string, { name: string; customerId?: string; ownerId?: string; isOwner: boolean; receivable: number; payable: number }>();
  for (const item of outstanding.values()) {
    if (item.amount <= 0) continue;
    const isOwner = item.counterpartyType === 'OWNER' || Boolean(item.ownerId);
    const identity = item.customerId && !isOwner ? `customer:${item.customerId}` : isOwner ? `owner:${item.ownerId ?? item.name.trim().toLowerCase()}` : `name:${item.name.trim().toLowerCase()}`;
    const current = grouped.get(identity) ?? { name: item.name, customerId: isOwner ? undefined : item.customerId, ownerId: item.ownerId, isOwner, receivable: 0, payable: 0 };
    if (item.type === 'receivable') current.receivable += item.amount;
    else current.payable += item.amount;
    grouped.set(identity, current);
  }
  const counterpartyBalances = [...grouped.values()].flatMap((item) => {
    const net = item.receivable - item.payable;
    if (net === 0) return [];
    return [{ type: net > 0 ? 'receivable' as const : 'payable' as const, name: item.name, ...(item.customerId ? { customerId: item.customerId } : {}), ...(item.ownerId ? { ownerId: item.ownerId } : {}), ...(item.isOwner ? { counterpartyType: 'OWNER' as const } : {}), amount: Math.abs(net) }];
  });
  const totalCustomerReceivable = counterpartyBalances.filter((item) => item.type === 'receivable' && !item.ownerId && item.counterpartyType !== 'OWNER').reduce((sum, item) => sum + item.amount, 0);
  const totalCustomerPayable = counterpartyBalances.filter((item) => item.type === 'payable' && !item.ownerId && item.counterpartyType !== 'OWNER').reduce((sum, item) => sum + item.amount, 0);
  // Public receivable/payable totals are customer/other-party balances. Owner
  // loans and owner obligations are reported through ownerSummaries instead.
  const totalReceivable = totalCustomerReceivable;
  const totalPayable = totalCustomerPayable;

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
    totalCustomerReceivable,
    totalCustomerPayable,
    counterpartyBalances,
  };
};
