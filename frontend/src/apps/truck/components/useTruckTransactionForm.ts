import { FormEvent, useEffect, useState } from 'react';
import { CounterpartyType, Customer, Owner, Transaction, TransactionType, Truck } from '../types';
import { useAsyncAction } from '../../../hooks/useAsyncAction';

export type TruckTransactionInput = {
  truckId: string;
  date: string;
  type: TransactionType;
  category: string;
  amount: number;
  ownerId?: string;
  description: string;
  referenceNo?: string;
  counterpartyType?: CounterpartyType;
  customerId?: string;
  counterpartyName?: string;
};

type Options = {
  owners: Owner[];
  customers: Customer[];
  trucks: Truck[];
  currentTruckId: string;
  defaultOwnerId?: string;
  defaultType: TransactionType;
  editingTransaction?: Transaction | null;
  active: boolean;
  onSubmit: (input: TruckTransactionInput) => Promise<void>;
  onComplete: () => void;
};

const categoryForType = (type: TransactionType) => {
  if (type === 'INCOME') return 'Cross-Country Freight Load';
  if (type === 'EXPENSE') return 'Diesel Fuel';
  if (type === 'CAPITAL_INJECTION') return 'Owner Emergency Repair Loan';
  if (type === 'CAPITAL_REPAYMENT') return 'Owner Debt Clearance';
  if (type === 'RECEIVABLE') return 'Customer Receivable';
  if (type === 'PAYABLE') return 'Supplier / Owner Payable';
  if (type === 'RECEIVABLE_SETTLEMENT') return 'Receivable Payment Received';
  if (type === 'PAYABLE_SETTLEMENT') return 'Payable Settled';
  return 'Quarterly Profit Share Dividend';
};

export function useTruckTransactionForm({ owners, customers, trucks, currentTruckId, defaultOwnerId, defaultType, editingTransaction, active, onSubmit, onComplete }: Options) {
  const [truckId, setTruckId] = useState(currentTruckId || (trucks[0]?.id ?? ''));
  const [type, setType] = useState<TransactionType>(defaultType);
  const [ownerId, setOwnerId] = useState(defaultOwnerId || (owners[0]?.id ?? ''));
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Freight Load Revenue');
  const [description, setDescription] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [counterpartyType, setCounterpartyType] = useState<CounterpartyType>('CUSTOMER');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const { submitting, runAction } = useAsyncAction();
  const truckOptionsKey = trucks.map((truck) => truck.id).join(',');
  const ownerOptionsKey = owners.map((owner) => owner.id).join(',');
  const customerOptionsKey = customers.map((customer) => customer.id).join(',');

  useEffect(() => {
    if (!active) return;
    if (editingTransaction) {
      setTruckId(editingTransaction.truckId);
      setType(editingTransaction.type);
      setOwnerId(editingTransaction.ownerId ?? '');
      setAmount(String(editingTransaction.amount));
      setCategory(editingTransaction.category);
      setDescription(editingTransaction.description);
      setReferenceNo(editingTransaction.referenceNo ?? '');
      setCounterpartyType(editingTransaction.counterpartyType ?? 'CUSTOMER');
      setCounterpartyName(editingTransaction.counterpartyName ?? '');
      setCustomerId(editingTransaction.customerId ?? '');
      setDate(editingTransaction.date);
      return;
    }
    setTruckId(currentTruckId || (trucks[0]?.id ?? ''));
    setType(defaultType);
    setOwnerId(defaultOwnerId || (owners[0]?.id ?? ''));
    setAmount('');
    setCategory('Freight Load Revenue');
    setDescription('');
    setReferenceNo('');
    setCounterpartyType('CUSTOMER');
    setCounterpartyName('');
    setCustomerId('');
    setDate(new Date().toISOString().split('T')[0]);
  }, [active, editingTransaction?.id, currentTruckId, defaultOwnerId, defaultType, truckOptionsKey, ownerOptionsKey, customerOptionsKey]);

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    setCategory(categoryForType(newType));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const numAmount = parseFloat(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0 || submitting) return;
    const tracksCounterparty = ['RECEIVABLE', 'PAYABLE', 'RECEIVABLE_SETTLEMENT', 'PAYABLE_SETTLEMENT'].includes(type);
    if (tracksCounterparty && !counterpartyName.trim()) return;
    if (tracksCounterparty && counterpartyType === 'OWNER' && !ownerId) return;
    await runAction({
      operation: () => onSubmit({
        truckId,
        date,
        type,
        category,
        amount: numAmount,
        ownerId: (type === 'CAPITAL_INJECTION' || type === 'CAPITAL_REPAYMENT' || type === 'PROFIT_DISTRIBUTION' || counterpartyType === 'OWNER') ? ownerId : undefined,
        description: description.trim(),
        referenceNo,
        counterpartyType: ['RECEIVABLE', 'PAYABLE', 'RECEIVABLE_SETTLEMENT', 'PAYABLE_SETTLEMENT'].includes(type) ? counterpartyType : undefined,
        customerId: counterpartyType === 'CUSTOMER' ? customerId || undefined : undefined,
        counterpartyName: ['RECEIVABLE', 'PAYABLE', 'RECEIVABLE_SETTLEMENT', 'PAYABLE_SETTLEMENT'].includes(type) ? counterpartyName.trim() : undefined,
      }),
      successMessage: editingTransaction ? 'Truck transaction updated successfully.' : 'Truck transaction saved successfully.',
      errorMessage: 'Could not save the Truck transaction. Your form has been kept open.',
    });
    onComplete();
  };

  return { truckId, setTruckId, type, ownerId, setOwnerId, amount, setAmount, category, setCategory, description, setDescription, referenceNo, setReferenceNo, counterpartyType, setCounterpartyType, customerId, setCustomerId, counterpartyName, setCounterpartyName, date, setDate, submitting, handleTypeChange, handleSubmit };
}
