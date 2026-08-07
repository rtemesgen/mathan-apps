import { BookStats, Transaction } from '../types';

export function formatCurrency(amount: number, _currencySymbol?: string): string {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const isInteger = Number.isInteger(absAmount) || Math.abs(absAmount % 1) < 0.0001;

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: isInteger ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(absAmount);

  return isNegative ? `-${formatted}` : formatted;
}

export function formatDateTime(isoString: string): { dateStr: string; timeStr: string; fullStr: string } {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      return { dateStr: isoString, timeStr: '', fullStr: isoString };
    }
    
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    
    return {
      dateStr,
      timeStr,
      fullStr: `${dateStr} at ${timeStr}`,
    };
  } catch {
    return { dateStr: isoString, timeStr: '', fullStr: isoString };
  }
}

export function getCurrentLocalDateTimeString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function formatTimeAgo(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Recently';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'Just now';
    
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return 'Recently';
  }
}

export function calculateBookStats(transactions: Transaction[], bookId?: string): BookStats {
  const filtered = bookId ? transactions.filter(t => t.bookId === bookId) : transactions;
  
  let totalIn = 0;
  let totalOut = 0;
  
  for (const t of filtered) {
    if (t.type === 'in') {
      totalIn += t.amount;
    } else {
      totalOut += t.amount;
    }
  }
  
  return {
    totalIn,
    totalOut,
    netBalance: totalIn - totalOut,
    transactionCount: filtered.length,
  };
}
