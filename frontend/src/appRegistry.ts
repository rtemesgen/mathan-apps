import { BookOpen, WalletCards, Truck as TruckIcon, type LucideIcon } from 'lucide-react';

export interface ErpAppDefinition {
  id: 'book' | 'payroll' | 'truck';
  name: string;
  route: string;
  description: string;
  status: 'available';
  icon: LucideIcon;
  accent: string;
}

export const ERP_APPS: ErpAppDefinition[] = [
  {
    id: 'book',
    name: 'Cash Book',
    route: '/book',
    description: 'Track cash in, cash out, balances, and operational ledgers.',
    status: 'available',
    icon: BookOpen,
    accent: 'emerald',
  },
  {
    id: 'payroll',
    name: 'Payroll',
    route: '/payroll',
    description: 'Manage employees, salary earnings, payments, and reports.',
    status: 'available',
    icon: WalletCards,
    accent: 'indigo',
  },
  {
    id: 'truck',
    name: 'Truck Equity',
    route: '/truck',
    description: 'Manage fleet cash, partners, equity, trips, and payouts.',
    status: 'available',
    icon: TruckIcon,
    accent: 'amber',
  },
];
