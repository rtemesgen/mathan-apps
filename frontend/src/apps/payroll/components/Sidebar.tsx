import React from 'react';
import {
  LayoutDashboard,
  UserPlus,
  UserCog,
  Banknote,
  TrendingUp,
  FileSpreadsheet,
  Receipt,
  Calendar,
  ChevronRight,
  ShieldCheck,
  CreditCard,
  Building,
  PanelLeftClose,
  X,
  Grid,
  AppWindow
} from 'lucide-react';
import { CompanyStats } from '../types';
import { AppSidebarFooter } from '../../../components/AppSidebarFooter';
import { AppBrand } from '../../../components/AppBrand';
import { useAuth } from '../../../auth/AuthProvider';
import { AppDatePicker } from '../../../components/AppDatePicker';
import { AppSidebar } from '../../../components/AppSidebar';

export type ActiveTab =
  | 'dashboard'
  | 'add-employee'
  | 'manage-employees'
  | 'pay-salary'
  | 'add-raise'
  | 'reports'
  | 'transactions';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  stats: CompanyStats;
  asOfDate: string;
  onAsOfDateChange: (date: string) => void;
  employeeCount: number;
  onClose?: () => void;
  currentAppName?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  stats,
  asOfDate,
  onAsOfDateChange,
  employeeCount,
  onClose,
  currentAppName = 'Payroll Tracker',
}) => {
  const { workspace, signOut, isGuest } = useAuth();
  const navItems = [
    {
      id: 'dashboard' as ActiveTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: employeeCount > 0 ? `${employeeCount}` : undefined,
    },
    {
      id: 'add-employee' as ActiveTab,
      label: 'Add Employee',
      icon: UserPlus,
    },
    {
      id: 'manage-employees' as ActiveTab,
      label: 'Manage Employees',
      icon: UserCog,
    },
    {
      id: 'pay-salary' as ActiveTab,
      label: 'Pay',
      icon: Banknote,
    },
    {
      id: 'add-raise' as ActiveTab,
      label: 'Raise',
      icon: TrendingUp,
    },
    {
      id: 'reports' as ActiveTab,
      label: 'Payroll Reports',
      icon: FileSpreadsheet,
    },
    {
      id: 'transactions' as ActiveTab,
      label: 'Payment History',
      icon: Receipt,
    },
  ];

  const formatMoney = (val: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(val);

  return (
    <AppSidebar className="w-full md:w-60 bg-[#f8f6f0] text-zinc-900 flex flex-col shrink-0 border-r border-[#e5dfd2] select-none min-h-screen">
      {/* Brand & Header */}
      <div className="p-2.5 border-b border-[#e8e6dc] bg-white/60">
        <div className="flex items-center justify-between">
          <AppBrand subtitle={currentAppName} compact />

          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-[#f2f0e6] rounded-lg transition cursor-pointer shrink-0"
              title="Hide Navigation Menu"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Total Accrued Balance Widget */}
        <div className="mt-2 p-2 bg-white rounded-xl border border-[#e8e6dc] shadow-2xs">
          <div className="flex items-center justify-between text-[8px] font-extrabold uppercase tracking-widest text-zinc-400 mb-0.5">
            <span>Total Money Owed</span>
            <span className="text-emerald-700 font-bold flex items-center gap-1 bg-emerald-50 px-1 py-0.2 rounded-full border border-emerald-200 text-[8px]">
              <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span> LIVE
            </span>
          </div>
          <div className="text-sm font-black text-zinc-900 font-mono tracking-tight mt-0.5">
            {formatMoney(stats.totalCompanyLiability)}
          </div>
          <div className="mt-1 pt-1 border-t border-zinc-100 flex items-center justify-between text-[8px] text-zinc-500 font-medium">
            <span>Earned: {formatMoney(stats.totalCompanyAccrued)}</span>
            <span>Paid: {formatMoney(stats.totalCompanyPaidOut)}</span>
          </div>
        </div>
      </div>

      {/* Navigation List */}
      <div className="flex-1 px-1.5 py-2 space-y-0.5 overflow-y-auto">
        <div className="px-1.5 pb-0.5 text-[8px] font-extrabold text-zinc-400 uppercase tracking-[0.18em]">
          Menu Options
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition-all duration-150 group text-left cursor-pointer ${
                isActive
                  ? 'bg-[#1c1d1b] text-white shadow-2xs font-semibold'
                  : 'text-zinc-700 hover:bg-[#f2f0e6] hover:text-zinc-900'
              }`}
            >
              <div className="flex items-center space-x-2 min-w-0">
                <div
                  className={`p-1 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-white/15 text-white'
                      : 'bg-zinc-200/60 text-zinc-600 group-hover:bg-zinc-200 group-hover:text-zinc-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="text-[11px] font-bold leading-tight truncate">{item.label}</div>
              </div>

              {item.badge ? (
                <span
                  className={`ml-1.5 px-1.5 py-0.2 text-[9px] font-extrabold rounded-full ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-zinc-200/80 text-zinc-700 border border-zinc-300/50'
                  }`}
                >
                  {item.badge}
                </span>
              ) : (
                <ChevronRight
                  className={`w-3 h-3 transition-opacity ${
                    isActive ? 'opacity-100 text-white' : 'opacity-0 group-hover:opacity-100 text-zinc-400'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Footer / Evaluation Date Controls */}
      <div className="p-2.5 border-t border-[#e8e6dc] bg-white/60 space-y-2">
        <AppSidebarFooter workspaceName={workspace?.name} isGuest={isGuest} onSignOut={() => void signOut()} compact />
        <div>
          <label className="block text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-zinc-600" /> Calculation Date
            </span>
            <span className="text-[8px] text-zinc-600 bg-zinc-200/80 px-1 py-0.2 rounded font-bold">
              AS OF
            </span>
          </label>
          <AppDatePicker value={asOfDate} onChange={onAsOfDateChange} className="w-full" />
        </div>

      </div>
    </AppSidebar>
  );
};
