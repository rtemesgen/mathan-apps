import React from 'react';
import { Calendar } from 'lucide-react';
import { AppBrand } from '../../../components/AppBrand';
import { AppHeader } from '../../../components/AppHeader';

interface HeaderProps {
  activeBookName?: string;
  totalBooksCount: number;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeBookName,
  totalBooksCount,
  isSidebarOpen,
  onToggleSidebar,
}) => {
  const currentDateFormatted = new Date().toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  return (
    <AppHeader bare className="z-30 shadow-2xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-2.5 flex items-center justify-between">
        {/* Left Side Branding - Matched to Image Spec */}
        <div className="flex items-center gap-2.5">
          <button 
            onClick={onToggleSidebar}
            title={isSidebarOpen ? 'Hide Cash Book menu' : 'Show Cash Book menu'}
            className="flex items-center gap-2.5 group text-left focus:outline-none"
          >
            <AppBrand subtitle="CASH BOOK" />
          </button>
        </div>

        {/* Right Side Controls & Status */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {activeBookName && (
            <span className="text-[11px] font-semibold text-[#4B5563] bg-[#F7F5EE] border border-[#E6E2D6] px-2 py-1 rounded-md hidden sm:inline-block">
              {activeBookName}
            </span>
          )}

          {/* Date Badge */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-[#F7F5EE] border border-[#E6E2D6] rounded-md text-[11px]">
            <Calendar className="w-3 h-3 text-[#6B7280]" />
            <span className="text-[9px] font-bold text-[#6B7280] uppercase tracking-wider">AS OF</span>
            <span className="font-mono font-semibold text-[#121212] text-[11px]">{currentDateFormatted}</span>
          </div>
        </div>
      </div>
    </AppHeader>
  );
};
