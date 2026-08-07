export type TransactionType = 'in' | 'out';

export interface Transaction {
  id: string;
  bookId: string;
  type: TransactionType;
  amount: number;
  remark: string;
  category?: string;
  paymentMode?: 'Cash' | 'Bank Transfer' | 'UPI / Online' | 'Cheque';
  dateTime: string; // ISO format YYYY-MM-DDTHH:mm
  attachmentUrl?: string; // base64 or blob/file URL
  attachmentName?: string; // file name
  createdAt: string;
}

export interface Book {
  id: string;
  name: string;
  description?: string;
  currency: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookStats {
  totalIn: number;
  totalOut: number;
  netBalance: number;
  transactionCount: number;
}
