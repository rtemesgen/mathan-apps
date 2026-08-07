import React from 'react';
import { Calendar } from 'lucide-react';

interface HeaderProps {
  activeBookName?: string;
  totalBooksCount: number;
  onGoToDashboard: () => void;
  onResetDemoData?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeBookName,
  totalBooksCount,
  onGoToDashboard,
  onResetDemoData,
}) => {
  const currentDateFormatted = new Date().toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  return (
    <header className="bg-[#FFFFFF] border-b border-[#E6E2D6] sticky top-0 z-30 shadow-2xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-2.5 flex items-center justify-between">
        {/* Left Side Branding - Matched to Image Spec */}
        <div className="flex items-center gap-2.5">
          <button 
            onClick={onGoToDashboard}
            className="flex items-center gap-2.5 group text-left focus:outline-none"
          >
            {/* Black Icon Box with Serif Italic 'M' */}
            <div className="w-8 h-8 rounded-lg bg-[#121212] text-[#FFFFFF] flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
              <span className="font-serif italic text-lg text-amber-200">M</span>
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                {/* Mathan ERP font serif italic */}
                <span className="font-serif italic font-bold text-sm sm:text-base tracking-tight text-[#121212]">
                  Mathan ERP
                </span>
              </div>

              {/* Subtitle: CASH BOOK in uppercase grey */}
              <p className="text-[10px] font-bold tracking-widest text-[#8E8E93] uppercase leading-none mt-0.5">
                CASH BOOK
              </p>
            </div>
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
    </header>
  );
};

