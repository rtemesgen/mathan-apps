import React from 'react';
import { ActiveTab } from './Sidebar';
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

interface TopNavbarProps {
  activeTab: ActiveTab;
  asOfDate: string;
  onAsOfDateChange: (date: string) => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  toggleButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  activeTab,
  asOfDate,
  onAsOfDateChange,
  isSidebarOpen,
  onToggleSidebar,
  toggleButtonRef,
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
          title: 'Reports & Export',
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
  const Icon = currentInfo.icon;

  return (
    <header className="native-safe-top bg-[#f6f5ef] border-b border-[#e8e6dc] sticky top-0 z-40 px-2.5 sm:px-4 py-1.5 flex items-center justify-between shadow-2xs">
      {/* Title & Menu Toggle Logo Button */}
      <div className="flex items-center space-x-2.5 sm:space-x-3.5">
        {isSidebarOpen ? (
          /* Mobile Logo Button (only when sidebar is open on mobile) */
          <button
            ref={toggleButtonRef}
            onClick={onToggleSidebar}
            className="flex md:hidden items-center space-x-2 p-1 hover:opacity-85 rounded-xl transition cursor-pointer group shrink-0 select-none border border-transparent hover:border-zinc-200 hover:bg-white/60"
            title="Close Navigation Menu"
          >
            <div className="w-8 h-8 rounded-xl bg-zinc-900 text-white flex items-center justify-center font-serif-title font-bold text-base italic shadow-2xs shrink-0">
              <span className="bg-gradient-to-tr from-amber-200 via-white to-sky-200 bg-clip-text text-transparent">M</span>
            </div>
            <div className="text-left leading-none">
              <div className="font-serif-title text-sm font-bold tracking-tight text-zinc-900 italic">
                Mathan ERP
              </div>
              <div className="text-[8px] font-extrabold uppercase tracking-[0.18em] text-zinc-400 mt-0.5">
                Payroll Tracker
              </div>
            </div>
          </button>
        ) : (
          /* When sidebar is closed/collapsed, show Mathan ERP logo button on all screens */
          <button
            ref={toggleButtonRef}
            onClick={onToggleSidebar}
            className="flex items-center space-x-2 p-1 hover:opacity-85 rounded-xl transition cursor-pointer group shrink-0 select-none border border-transparent hover:border-zinc-200 hover:bg-white/60"
            title="Open Navigation Menu"
          >
            <div className="w-8 h-8 rounded-xl bg-zinc-900 text-white flex items-center justify-center font-serif-title font-bold text-base italic shadow-2xs shrink-0 group-hover:scale-105 transition-transform">
              <span className="bg-gradient-to-tr from-amber-200 via-white to-sky-200 bg-clip-text text-transparent">M</span>
            </div>
            <div className="text-left hidden sm:block leading-none">
              <div className="font-serif-title text-sm font-bold tracking-tight text-zinc-900 italic">
                Mathan ERP
              </div>
              <div className="text-[8px] font-extrabold uppercase tracking-[0.18em] text-zinc-400 mt-0.5">
                Payroll Tracker
              </div>
            </div>
          </button>
        )}

        <div className="h-5 w-px bg-zinc-300 hidden sm:block"></div>

        <div className="p-1.5 bg-white text-zinc-800 rounded-lg border border-[#e8e6dc] shadow-2xs flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-zinc-800" />
        </div>

        <div>
          <h1 className="font-sans text-xs sm:text-sm font-bold text-zinc-900 tracking-tight leading-none uppercase">
            {currentInfo.title}
          </h1>
        </div>
      </div>

      {/* Right side evaluation date badge & LIVE badge */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Live Pill Badge */}
        <div className="hidden sm:flex items-center gap-1 bg-white border border-zinc-200 px-2 py-0.5 rounded-full text-[9px] font-extrabold text-zinc-700 uppercase tracking-widest shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>LIVE</span>
        </div>

        {/* Date Selector */}
        <div className="flex items-center bg-white border border-[#e8e6dc] rounded-xl px-2 sm:px-2.5 py-1 text-xs shadow-2xs">
          <Calendar className="w-3 h-3 text-zinc-600 mr-1.5 shrink-0" />
          <span className="text-zinc-400 text-[9px] uppercase font-bold tracking-wider mr-1.5 hidden md:inline">
            EVAL DATE:
          </span>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => onAsOfDateChange(e.target.value)}
            className="bg-[#f2f0e6] border border-zinc-200 text-zinc-900 font-mono text-[11px] font-bold rounded-lg px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-zinc-800 cursor-pointer"
          />
        </div>
      </div>
    </header>
  );
};
