import React from 'react';
import { Truck } from '../types';
import { TruckSelect } from './TruckSelect';
import { AppBrand } from '../../../components/AppBrand';
import { AppHeader } from '../../../components/AppHeader';

interface TopHeaderProps {
  currentView: string;
  setCurrentView?: (view: string) => void;
  trucks: Truck[];
  currentTruckId: string;
  onSelectTruck: (truckId: string) => void;
  onToggleSidebar: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  currentView,
  trucks,
  currentTruckId,
  onSelectTruck,
  onToggleSidebar,
}) => {
  const getTitle = () => {
    switch (currentView) {
      case 'dashboard':
        return 'DASHBOARD';
      case 'partners':
        return 'PARTNERS & LOANS';
      case 'add-owner':
        return 'ADD PARTNER';
      case 'income':
        return 'INCOME (TRIPS)';
      case 'expenses':
        return 'EXPENSES';
      case 'cash-report':
        return 'CASH REPORT';
      case 'reports':
        return 'FINANCIALS';
      case 'history':
        return 'HISTORY';
      case 'manage-trucks':
        return 'TRUCKS';
      case 'export':
        return 'EXPORT';
      default:
        return 'LEDGER';
    }
  };

  return (
    <AppHeader bare className="z-30 px-3 sm:px-4 py-1.5 backdrop-blur-md bg-opacity-95">
      <div className="flex items-center justify-between gap-2 max-w-7xl mx-auto">
        {/* Left: Menu button + Branding + Current View Title */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleSidebar}
            className="flex items-center gap-1 p-0.5 rounded-lg hover:bg-[#eae4d5] transition-colors group cursor-pointer focus:outline-none"
            title="Open side menu"
          >
            <AppBrand subtitle="TRUCK EQUITY" compact />
          </button>

          <div className="h-4 w-px bg-[#e5dfd2]" />

          {/* Display ONLY the current view title */}
          <span className="text-[11px] font-bold tracking-wider text-[#787672] uppercase font-sans">
            {getTitle()}
          </span>
        </div>

        {/* Right: Active Truck Selector */}
        <TruckSelect value={currentTruckId} onChange={onSelectTruck} options={trucks.map((truck) => ({ value: truck.id, label: `${truck.name} (${truck.unitNumber})` }))} placeholder="No trucks yet" className="w-44 sm:w-56" />
      </div>
    </AppHeader>
  );
};
