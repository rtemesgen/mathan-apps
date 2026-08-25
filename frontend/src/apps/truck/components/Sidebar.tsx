import React from 'react';
import { 
  Users, 
  UserPlus, 
  ArrowDownLeft, 
  ArrowUpRight, 
  FileText, 
  History, 
  ChevronRight,
  X,
  DollarSign,
  LayoutDashboard,
} from 'lucide-react';
import { TruckFinancialSummary } from '../types';
import { formatCurrency } from '../utils/formatters';
import { AppSidebarFooter } from '../../../components/AppSidebarFooter';
import { AppBrand } from '../../../components/AppBrand';
import { useAuth } from '../../../auth/AuthProvider';
import { AppSidebar } from '../../../components/AppSidebar';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentView: string;
  setCurrentView: (view: string) => void;
  summary: TruckFinancialSummary;
  calculationDate: string;
  setCalculationDate: (date: string) => void;
  onResetDemoData: () => void;
  onOpenAddOwner: () => void;
  onOpenCustomers: () => void;
  onOpenIncome: () => void;
  onOpenExpenses: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  currentView,
  setCurrentView,
  summary,
  onResetDemoData,
  onOpenAddOwner,
  onOpenCustomers,
  onOpenIncome,
  onOpenExpenses,
  
}) => {
  const { workspace, signOut, isGuest } = useAuth();
  if (!isOpen) return null;

  const menuItems = [
    { 
      id: 'dashboard', 
      label: 'Dashboard(Trucks)', 
      icon: LayoutDashboard, 
      onClickView: 'dashboard',
      hasArrow: true
    },
    { 
      id: 'partners', 
      label: 'Partners & Loans', 
      icon: Users, 
      badge: summary.ownerSummaries.length,
      onClickView: 'partners',
      hasArrow: true
    },
    { id: 'customers', label: 'Customers', icon: Users, onClickView: 'customers', hasArrow: true },
    { 
      id: 'income', 
      label: 'Income (Trips)', 
      icon: ArrowDownLeft, 
      action: onOpenIncome 
    },
    { 
      id: 'expenses', 
      label: 'Expenses & Payouts', 
      icon: ArrowUpRight, 
      action: onOpenExpenses 
    },
    { 
      id: 'cash-report', 
      label: 'Cash Report (Flow)', 
      icon: DollarSign,
      onClickView: 'cash-report',
      hasArrow: true
    },
    { 
      id: 'reports', 
      label: 'Partner Financials', 
      icon: FileText,
      onClickView: 'reports',
      hasArrow: true
    },
    { 
      id: 'history', 
      label: 'Activity History', 
      icon: History,
      onClickView: 'history'
    },
  ];

  return (
    <>
      {/* Dimmed backdrop - clicking outside closes sidebar */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over Drawer Sidebar (Narrow width: w-64) */}
      <AppSidebar className="mobile-sidebar-drawer fixed left-0 top-0 z-50 flex h-[100dvh] max-h-[100dvh] w-60 flex-col overflow-y-auto overscroll-contain border-r border-[#e5dfd2] bg-[#f8f6f0] shadow-2xl select-none animate-in slide-in-from-left duration-200">
        {/* Header Branding Box */}
        <div className="p-2 border-b border-[#e5dfd2] bg-[#f8f6f0]">
          <div className="flex items-center justify-between mb-1">
            <AppBrand subtitle="TRUCK EQUITY" compact />

            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-[#eae4d5] text-[#787672] hover:text-[#1c1d1f] transition-colors"
              title="Close Menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* Live Balance Summary */}
        <div className="mx-2 my-1 bg-[#ffffff] border border-[#e5dfd2] rounded-xl p-1.5 shadow-2xs">
          <div className="mb-0 text-[8px] font-bold uppercase tracking-[0.08em] text-[#787672]">
            Total Money Owed
          </div>
          <div className="text-sm font-bold leading-tight tracking-tight text-[#1c1d1f]">
            {formatCurrency(summary.totalUnpaidDebtToOwners, false)}
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-[#f0ebd9] pt-1 text-[8px] font-medium text-[#787672]">
            <span>Cash: <strong className="text-[#3f4d34]">{formatCurrency(summary.cashOnHand, false)}</strong></span>
            <span>Paid: <strong className="text-[#2e7d32]">{formatCurrency(summary.totalOwnerRepayments + summary.totalProfitDistributed, false)}</strong></span>
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="px-2 py-1 space-y-0.5 flex-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id || currentView === item.onClickView;

            const handleClick = () => {
              if (item.action) {
                item.action();
              } else if (item.onClickView) {
                setCurrentView(item.onClickView);
              } else {
                setCurrentView(item.id);
              }
              onClose();
            };

            return (
              <button
                key={item.id}
                onClick={handleClick}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-[#1c1d1f] text-white shadow-2xs'
                    : 'text-[#383734] hover:bg-[#e8e2d4] hover:text-[#1c1d1f]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-[#6e6d6a]'}`} />
                  <span>{item.label}</span>
                </div>

                {item.badge !== undefined && (
                  <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-[#e2dbca] text-[#4a4843]'
                  }`}>
                    {item.badge}
                  </span>
                )}

                {item.hasArrow && (
                  <ChevronRight className={`w-3 h-3 ${isActive ? 'text-white' : 'text-[#8c8880]'}`} />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-1.5 border-t border-[#e5dfd2] bg-[#f8f6f0] mt-auto">
          <AppSidebarFooter workspaceName={workspace?.name} isGuest={isGuest} onSignOut={() => void signOut()} compact />
        </div>
      </AppSidebar>
    </>
  );
};
