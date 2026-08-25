import React from 'react';
import { ArrowUpDown, Plus, UserPlus, Users } from 'lucide-react';
import { Owner, OwnerFinancialSummary, Transaction, Truck } from '../../types';
import { OwnerCard } from '../OwnerCard';
import { TruckSelect } from '../TruckSelect';

type SortBy = 'balance' | 'rate' | 'equity' | 'name' | string;

interface PartnersPageProps {
  activeTruck: Truck;
  transactions: Transaction[];
  sortedOwnerSummaries: OwnerFinancialSummary[];
  sortBy: SortBy;
  onSortByChange: (value: string) => void;
  onAddPartner: () => void;
  onPayOwner: (ownerId: string) => void;
  onInjectCapital: (ownerId: string) => void;
  onEditOwner: (owner: Owner) => void;
  onDeleteOwner: (ownerId: string) => void;
  onDeleteTransaction: (transactionId: string) => void;
  onEditTransaction: (transaction: Transaction) => void;
}

export const PartnersPage: React.FC<PartnersPageProps> = ({
  activeTruck,
  transactions,
  sortedOwnerSummaries,
  sortBy,
  onSortByChange,
  onAddPartner,
  onPayOwner,
  onInjectCapital,
  onEditOwner,
  onDeleteOwner,
  onDeleteTransaction,
  onEditTransaction,
}) => (
  <div className="p-3 sm:p-5 max-w-3xl mx-auto space-y-3">
    <div className="flex items-center justify-between pb-1.5 border-b border-[#e5dfd2] flex-wrap gap-2">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-[#1c1d1f] text-white flex items-center justify-center shadow-2xs"><Users className="w-4 h-4" /></div>
        <div>
          <h1 className="text-sm sm:text-base font-bold text-[#1c1d1f] uppercase tracking-tight">Partners & Loans • {activeTruck.name}</h1>
          <p className="text-[10px] text-[#787672]">Unit {activeTruck.unitNumber} • Equity percentages, draw rates & loan balances</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-white border border-[#d8d0be] rounded-lg px-2 py-1 text-xs">
          <ArrowUpDown className="w-3 h-3 text-[#787672]" />
          <span className="text-[10px] uppercase font-bold text-[#787672]">Sort:</span>
          <TruckSelect value={sortBy} onChange={onSortByChange} options={[{ value: 'balance', label: 'Highest Debt' }, { value: 'rate', label: 'Draw Rate' }, { value: 'equity', label: 'Equity %' }, { value: 'name', label: 'Name A-Z' }]} className="min-w-32" />
        </div>
        <button onClick={onAddPartner} className="bg-[#3f4d34] hover:bg-[#323e29] text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"><Plus className="w-3.5 h-3.5" /><span>Add Partner</span></button>
      </div>
    </div>

    {sortedOwnerSummaries.length === 0 ? (
      <div className="bg-white border border-[#e5dfd2] rounded-2xl p-8 text-center shadow-xs space-y-3">
        <div className="w-12 h-12 rounded-full bg-[#f3efe6] flex items-center justify-center mx-auto text-[#787672]"><UserPlus className="w-6 h-6" /></div>
        <div>
          <h3 className="text-base font-bold text-[#1c1d1f]">No partners added for {activeTruck.name}</h3>
          <p className="text-xs text-[#787672] max-w-sm mx-auto mt-1">Partners and loans are tracked separately for each truck. Add partners to configure equity percentages and track capital loans.</p>
        </div>
        <button onClick={onAddPartner} className="inline-flex items-center gap-1.5 bg-[#3f4d34] hover:bg-[#323e29] text-white text-xs font-bold px-4 py-2 rounded-lg shadow-2xs transition-colors cursor-pointer"><Plus className="w-4 h-4" /><span>Add Partner to Unit {activeTruck.unitNumber}</span></button>
      </div>
    ) : (
      <div className="space-y-2.5">
        {sortedOwnerSummaries.map((summary) => (
          <OwnerCard
            key={summary.owner.id}
            summary={summary}
            transactions={transactions.filter((transaction) => transaction.truckId === activeTruck.id)}
            onPayOwner={onPayOwner}
            onInjectCapital={onInjectCapital}
            onEditOwner={onEditOwner}
            onDeleteOwner={onDeleteOwner}
            onDeleteTransaction={onDeleteTransaction}
            onEditTransaction={onEditTransaction}
          />
        ))}
      </div>
    )}
  </div>
);
