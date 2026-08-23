import React from 'react';
import { useAuth } from '../../../auth/AuthProvider';
import { AppSidebar } from '../../../components/AppSidebar';
import { AppSidebarFooter } from '../../../components/AppSidebarFooter';
import { AppBrand } from '../../../components/AppBrand';

interface CashBookSidebarProps { bookCount: number; onClose: () => void; }

export const CashBookSidebar: React.FC<CashBookSidebarProps> = ({ bookCount, onClose }) => {
  const { workspace, signOut, isGuest } = useAuth();
  return (
    <AppSidebar className="flex min-h-full w-60 flex-col border-r border-[#E5DFD2] bg-[#F8F6F0] text-[#1C1D1F]">
      <div className="border-b border-[#E6E2D6] bg-white/60 p-3">
        <div className="flex items-center justify-between gap-2"><AppBrand subtitle="CASH BOOK" compact /><span className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#9A978F]">{bookCount} {bookCount === 1 ? 'book' : 'books'}</span></div>
      </div>
      <div className="flex-1 p-3"><p className="text-[10px] leading-5 text-[#6B7280]">Manage books, cash-in and cash-out records from one secure workspace.</p></div>
      <AppSidebarFooter workspaceName={workspace?.name} isGuest={isGuest} onSignOut={() => void signOut()} onClose={onClose} />
    </AppSidebar>
  );
};
