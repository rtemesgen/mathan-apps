import React from 'react';
import { ActiveTab } from './Sidebar';
import { AppDatePicker } from '../../../components/AppDatePicker';
import { AppBrand } from '../../../components/AppBrand';
import { AppHeader } from '../../../components/AppHeader';
import {
  Menu,
  X,
  Calendar,
  Building2,
  DollarSign,
  UserPlus,
  Banknote,
  TrendingUp,
  FileSpreadsheet,
  Receipt,
  LayoutDashboard,
  PanelLeft,
  PanelLeftClose
} from 'lucide-react';
import { ExportButton } from '../../../components/ExportButton';

interface TopNavbarProps {
  activeTab: ActiveTab;
  asOfDate: string;
  onAsOfDateChange: (date: string) => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  toggleButtonRef?: React.RefObject<HTMLButtonElement | null>;
  onOpenExport: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  activeTab,
  asOfDate,
  onAsOfDateChange,
  isSidebarOpen,
  onToggleSidebar,
  toggleButtonRef,
  onOpenExport,
}) => {
  const getPageTitle = (tab: ActiveTab) => {
    switch (tab) {
      case 'dashboard':
        return {
          title: 'Dashboard',
          icon: LayoutDashboard,
        };
      case 'add-employee':
        return {
          title: 'Add Employee',
          icon: UserPlus,
        };
      case 'manage-employees':
        return {
          title: 'Manage Employees',
          icon: UserPlus,
        };
      case 'pay-salary':
        return {
          title: 'Pay',
          icon: Banknote,
        };
      case 'add-raise':
        return {
          title: 'Raise',
          icon: TrendingUp,
        };
      case 'reports':
        return {
          title: 'Payroll Reports',
          icon: FileSpreadsheet,
        };
      case 'transactions':
        return {
          title: 'Payment History',
          icon: Receipt,
        };
      default:
        return {
          title: 'Mathan ERP',
          icon: Building2,
        };
    }
  };

  const currentInfo = getPageTitle(activeTab);

  return (
    <AppHeader bare className="z-40 px-3 sm:px-4 py-1.5 flex items-center justify-between shadow-2xs">
      {/* Title & Menu Toggle Logo Button */}
      <div className="flex min-w-0 flex-none items-center gap-2">
        {isSidebarOpen ? (
          /* Mobile Logo Button (only when sidebar is open on mobile) */
          <button
            ref={toggleButtonRef}
            onClick={onToggleSidebar}
            className="flex w-fit md:hidden items-center space-x-1.5 p-0.5 hover:opacity-85 rounded-xl transition cursor-pointer group shrink-0 select-none border border-transparent hover:border-zinc-200 hover:bg-white/60"
            title="Close Navigation Menu"
          >
            <AppBrand subtitle="PAYROLL TRACKER" compact />
          </button>
        ) : (
          /* When sidebar is closed/collapsed, show Mathan ERP logo button on all screens */
          <button
            ref={toggleButtonRef}
            onClick={onToggleSidebar}
            className="flex w-fit items-center space-x-1.5 p-0.5 hover:opacity-85 rounded-xl transition cursor-pointer group shrink-0 select-none border border-transparent hover:border-zinc-200 hover:bg-white/60"
            title="Open Navigation Menu"
          >
            <AppBrand subtitle="PAYROLL TRACKER" compact />
          </button>
        )}

        <div className="hidden h-4 w-px bg-zinc-300 sm:block"></div>

        <div className="min-w-0 max-w-[108px] flex-none sm:max-w-[180px]">
          <h1 className="truncate font-sans text-[10px] font-bold uppercase leading-none tracking-tight text-zinc-900 sm:text-xs">
            {currentInfo.title}
          </h1>
        </div>
      </div>

      {/* Right side evaluation date badge & LIVE badge */}
      <div className="ml-2 flex shrink-0 items-center gap-1 sm:ml-3 sm:gap-3">
        <ExportButton onClick={onOpenExport} />
        {/* Live Pill Badge */}
        <div className="hidden sm:flex items-center gap-1 bg-white border border-zinc-200 px-2 py-0.5 rounded-full text-[9px] font-extrabold text-zinc-700 uppercase tracking-widest shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>LIVE</span>
        </div>

        {/* Date Selector */}
        <div className="payroll-header-date flex min-w-0 items-center rounded-xl border border-[#e8e6dc] bg-white px-0.5 py-0.5 text-xs shadow-2xs sm:px-2.5 sm:py-1">
          <Calendar className="mr-1 h-3 w-3 shrink-0 text-zinc-600 sm:mr-1.5" />
          <span className="text-zinc-400 text-[9px] uppercase font-bold tracking-wider mr-1.5 hidden md:inline">
            EVAL DATE:
          </span>
          <AppDatePicker value={asOfDate} onChange={onAsOfDateChange} className="w-[84px] sm:w-32" />
        </div>
      </div>
    </AppHeader>
  );
};
