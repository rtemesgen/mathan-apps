import React, { useMemo } from 'react';
import { 
  Truck as TruckIcon, 
  DollarSign, 
  Users, 
  Plus, 
  CheckCircle2, 
  TrendingUp, 
  TrendingDown, 
  Wallet
} from 'lucide-react';
import { Truck, Owner, Transaction } from '../../types';
import { calculateTruckFinancials, formatCurrency } from '../../utils/formatters';

interface DashboardViewProps {
  trucks: Truck[];
  currentTruckId: string;
  onSelectTruck: (truckId: string) => void;
  allOwners: Owner[];
  allTransactions: Transaction[];
  onOpenManageTrucks: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  trucks,
  currentTruckId,
  onSelectTruck,
  allOwners,
  allTransactions,
  onOpenManageTrucks,
}) => {
  // Calculate high-level stats for ALL trucks across the fleet
  const fleetTotals = useMemo(() => {
    let totalCash = 0;
    let totalRevenue = 0;
    let totalExpenses = 0;
    let totalLoansOwed = 0;
    let totalReceivable = 0;
    let totalPayable = 0;

    trucks.forEach(truck => {
      const truckTx = allTransactions.filter(t => t.truckId === truck.id);
      const summary = calculateTruckFinancials(truck, allOwners.filter((owner) => owner.truckId === truck.id || (!owner.truckId && truck.id === 'truck-1')), truckTx);
      totalCash += summary.cashOnHand;
      totalRevenue += summary.grossIncome;
      totalExpenses += summary.operatingExpenses;
      totalLoansOwed += summary.totalUnpaidDebtToOwners;
      totalReceivable += summary.totalCustomerReceivable;
      totalPayable += summary.totalCustomerPayable;
    });

    const totalNetProfit = totalRevenue - totalExpenses;

    return {
      totalCash,
      totalRevenue,
      totalExpenses,
      totalNetProfit,
      totalLoansOwed,
      totalReceivable,
      totalPayable,
      truckCount: trucks.length
    };
  }, [trucks, allOwners, allTransactions]);

  // Per-truck summary data for the small switcher cards
  const trucksSummaryList = useMemo(() => {
    return trucks.map(truck => {
      const truckTx = allTransactions.filter(t => t.truckId === truck.id);
      const truckOwners = allOwners.filter(o => o.truckId === truck.id || (!o.truckId && truck.id === 'truck-1'));
      
      const summary = calculateTruckFinancials(truck, truckOwners, truckTx);
      const totalEquity = truckOwners.reduce((sum, o) => sum + o.equityPercentage, 0);

      return {
        truck,
        cash: summary.cashOnHand,
        revenue: summary.grossIncome,
        expenses: summary.operatingExpenses,
        netProfit: summary.netProfit,
        debtOwed: summary.totalUnpaidDebtToOwners,
        receivable: summary.totalCustomerReceivable,
        payable: summary.totalCustomerPayable,
        partnerCount: truckOwners.length,
        totalEquity,
      };
    });
  }, [trucks, allTransactions, allOwners]);

  return (
    <div className="p-3 sm:p-4 max-w-5xl mx-auto space-y-3">
      {/* Header Banner: Fleet Title & Action */}
      <div className="flex items-center justify-between pb-1.5 border-b border-[#e5dfd2] flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#1c1d1f] text-white flex items-center justify-center shadow-2xs">
            <TruckIcon className="w-3.5 h-3.5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-[#1c1d1f] uppercase tracking-tight">
              Fleet Overview ({trucks.length} Units)
            </h1>
            <p className="text-[10px] text-[#787672]">
              Select a truck to set active unit across ledger
            </p>
          </div>
        </div>

        <button
          onClick={onOpenManageTrucks}
          className="bg-white hover:bg-[#f3efe6] border border-[#d8d0be] text-[#383734] text-[10px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
        >
          <Plus className="w-3 h-3 text-[#3f4d34]" />
          <span>Manage Fleet</span>
        </button>
      </div>

      {/* Fleet Totals Metric Banner - Single Row, Very Compact */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border border-[#e5dfd2] rounded-lg px-2 py-1.5 shadow-2xs">
          <div className="text-[7.5px] sm:text-[8px] font-bold uppercase tracking-wider text-[#787672] flex items-center justify-between">
            <span className="truncate">Fleet Cash</span>
            <Wallet className="w-2.5 h-2.5 text-[#787672] shrink-0" />
          </div>
          <div className="text-xs sm:text-sm font-bold text-[#1c1d1f] tracking-tight mt-0.5 truncate">
            {formatCurrency(fleetTotals.totalCash, false)}
          </div>
          <div className="text-[7.5px] text-[#8c8880] truncate">
            {fleetTotals.truckCount} Units
          </div>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 shadow-2xs">
          <div className="flex items-center justify-between text-[7.5px] font-bold uppercase tracking-wider text-blue-700"><span className="truncate">Receivable</span><TrendingUp className="h-2.5 w-2.5" /></div>
          <div className="mt-0.5 truncate text-xs font-bold tracking-tight text-blue-950 sm:text-sm">{formatCurrency(fleetTotals.totalReceivable, false)}</div>
          <div className="truncate text-[7.5px] text-blue-700">Customers owe</div>
        </div>

        <div className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 shadow-2xs">
          <div className="flex items-center justify-between text-[7.5px] font-bold uppercase tracking-wider text-rose-700"><span className="truncate">Payable</span><TrendingDown className="h-2.5 w-2.5" /></div>
          <div className="mt-0.5 truncate text-xs font-bold tracking-tight text-rose-950 sm:text-sm">{formatCurrency(fleetTotals.totalPayable, false)}</div>
          <div className="truncate text-[7.5px] text-rose-700">Truck owes</div>
        </div>

        <div className="bg-white border border-[#e5dfd2] rounded-lg px-2 py-1.5 shadow-2xs">
          <div className="text-[7.5px] sm:text-[8px] font-bold uppercase tracking-wider text-[#787672] flex items-center justify-between">
            <span className="truncate">Gross Rev</span>
            <TrendingUp className="w-2.5 h-2.5 text-[#2e7d32] shrink-0" />
          </div>
          <div className="text-xs sm:text-sm font-bold text-[#2e7d32] tracking-tight mt-0.5 truncate">
            {formatCurrency(fleetTotals.totalRevenue, false)}
          </div>
          <div className="text-[7.5px] text-[#8c8880] truncate">
            Loads
          </div>
        </div>

        <div className="bg-white border border-[#e5dfd2] rounded-lg px-2 py-1.5 shadow-2xs">
          <div className="text-[7.5px] sm:text-[8px] font-bold uppercase tracking-wider text-[#787672] flex items-center justify-between">
            <span className="truncate">Expenses</span>
            <TrendingDown className="w-2.5 h-2.5 text-[#c62828] shrink-0" />
          </div>
          <div className="text-xs sm:text-sm font-bold text-[#c62828] tracking-tight mt-0.5 truncate">
            {formatCurrency(fleetTotals.totalExpenses, false)}
          </div>
          <div className="text-[7.5px] text-[#8c8880] truncate">
            Fuel & Rep.
          </div>
        </div>

        <div className="bg-white border border-[#e5dfd2] rounded-lg px-2 py-1.5 shadow-2xs">
          <div className="text-[7.5px] sm:text-[8px] font-bold uppercase tracking-wider text-[#787672] flex items-center justify-between">
            <span className="truncate">Net Profit</span>
            <DollarSign className="w-2.5 h-2.5 text-[#00695c] shrink-0" />
          </div>
          <div className={`text-xs sm:text-sm font-bold tracking-tight mt-0.5 truncate ${fleetTotals.totalNetProfit >= 0 ? 'text-[#004d40]' : 'text-[#c62828]'}`}>
            {formatCurrency(fleetTotals.totalNetProfit, false)}
          </div>
          <div className="text-[7.5px] text-[#a3683a] font-bold truncate">
            Owner owed: {formatCurrency(fleetTotals.totalLoansOwed, false)}
          </div>
        </div>
      </div>

      {/* SECTION: TRUCKS IN A VERTICAL COLUMN (Stacked Above and Below) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#787672]">
          <span>Fleet Units ({trucks.length})</span>
          <span className="text-[9px] text-[#8c8880] normal-case">Click card to switch active unit</span>
        </div>

        {/* Vertical Column of Small Cards */}
        <div className="flex flex-col gap-2">
          {trucksSummaryList.map((item) => {
            const isSelected = item.truck.id === currentTruckId;

            return (
              <div
                key={item.truck.id}
                onClick={() => onSelectTruck(item.truck.id)}
                className={`p-2.5 rounded-xl transition-all cursor-pointer text-left relative ${
                  isSelected
                    ? 'bg-white border-2 border-[#3f4d34] shadow-md ring-2 ring-[#3f4d34]/25'
                    : 'bg-[#faf7f2] hover:bg-white text-[#52504b] border border-[#d8d0be] hover:border-[#3f4d34]/40 shadow-2xs'
                }`}
              >
                {/* Top Badge Row */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded shrink-0 bg-[#1c1d1f] text-white">
                      {item.truck.unitNumber}
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-[#1c1d1f] truncate">
                      {item.truck.name}
                    </span>
                  </div>

                  {isSelected ? (
                    <span className="bg-[#e8f5e9] text-[#2e7d32] border border-[#a5d6a7] text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs shrink-0">
                      <CheckCircle2 className="w-3 h-3 text-[#2e7d32]" />
                      Active
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-[#8c8880] hover:text-[#1c1d1f] shrink-0">
                      Select →
                    </span>
                  )}
                </div>

                {/* Main Stats in a clean horizontal strip */}
                <div className="grid grid-cols-3 gap-1.5">
                  {/* Cash */}
                  <div className={`px-2 py-1 rounded text-[11px] ${
                    isSelected ? 'bg-[#ebe4d5] text-[#1c1d1f]' : 'bg-[#eee8db] text-[#1c1d1f]'
                  }`}>
                    <span className="text-[8px] uppercase font-bold text-[#787672] block leading-tight">Cash</span>
                    <span className="font-mono font-bold text-xs sm:text-sm text-[#1c1d1f]">
                      {formatCurrency(item.cash, false)}
                    </span>
                  </div>

                  {/* Receivable */}
                  <div className={`rounded px-2 py-1 text-[11px] ${isSelected ? 'bg-blue-50' : 'bg-[#f7f4ed]'}`}>
                    <span className="block text-[8px] font-bold uppercase leading-tight text-blue-700">Receivable</span>
                    <span className="font-mono text-xs font-bold text-blue-950 sm:text-sm">{formatCurrency(item.receivable, false)}</span>
                  </div>

                  {/* Payable */}
                  <div className={`rounded px-2 py-1 text-[11px] ${isSelected ? 'bg-rose-50' : 'bg-[#f7f4ed]'}`}>
                    <span className="block text-[8px] font-bold uppercase leading-tight text-rose-700">Payable</span>
                    <span className="font-mono text-xs font-bold text-rose-950 sm:text-sm">{formatCurrency(item.payable, false)}</span>
                  </div>

                  {/* Revenue */}
                  <div className={`px-2 py-1 rounded text-[11px] ${
                    isSelected ? 'bg-[#f1f8e9]' : 'bg-[#f7f4ed]'
                  }`}>
                    <span className="text-[8px] uppercase font-bold text-[#787672] block leading-tight">Revenue</span>
                    <span className="font-mono font-bold text-xs sm:text-sm text-[#2e7d32]">
                      {formatCurrency(item.revenue, false)}
                    </span>
                  </div>

                  {/* Expense */}
                  <div className={`px-2 py-1 rounded text-[11px] ${
                    isSelected ? 'bg-[#fbe9e7]' : 'bg-[#f7f4ed]'
                  }`}>
                    <span className="text-[8px] uppercase font-bold text-[#787672] block leading-tight">Expenses</span>
                    <span className="font-mono font-bold text-xs sm:text-sm text-[#c62828]">
                      {formatCurrency(item.expenses, false)}
                    </span>
                  </div>

                  {/* Debt */}
                  <div className={`px-2 py-1 rounded text-[11px] ${
                    isSelected ? 'bg-[#fff8e1]' : 'bg-[#f7f4ed]'
                  }`}>
                    <span className="text-[8px] uppercase font-bold text-[#787672] block leading-tight">Owner owed</span>
                    <span className="font-mono font-bold text-xs sm:text-sm text-[#a3683a]">
                      {formatCurrency(item.debtOwed, false)}
                    </span>
                  </div>
                </div>

                {/* Footer: Partner count & license */}
                <div className="mt-1.5 pt-1 border-t border-[#ede8dd] flex items-center justify-between text-[9px] text-[#787672]">
                  <span className="flex items-center gap-1">
                    <Users className="w-2.5 h-2.5 text-[#3f4d34]" />
                    <span>{item.partnerCount} Partner{item.partnerCount !== 1 ? 's' : ''} ({item.totalEquity}%)</span>
                  </span>
                  <span className="font-mono text-[8px] opacity-75">
                    Plate: {item.truck.licensePlate}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
