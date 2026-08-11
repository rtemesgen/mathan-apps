import React from 'react';
import { BookOpen, LogIn, LogOut } from 'lucide-react';
import { AppSwitcher } from '../../../components/AppSwitcher';
import { useAuth } from '../../../auth/AuthProvider';

interface CashBookSidebarProps { bookCount: number; onClose: () => void; }

export const CashBookSidebar: React.FC<CashBookSidebarProps> = ({ bookCount, onClose }) => {
  const { workspace, signOut, isGuest } = useAuth();
  return (
    <aside className="flex min-h-full w-56 flex-col border-r border-[#E6E2D6] bg-[#FBFAF6] text-[#121212]">
      <div className="border-b border-[#E6E2D6] bg-white/60 p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#121212] text-white"><BookOpen className="h-4 w-4" /></div>
          <div><h2 className="font-serif text-sm font-bold italic">Cash Book</h2><p className="text-[9px] font-bold uppercase tracking-widest text-[#8E8E93]">{bookCount} {bookCount === 1 ? 'book' : 'books'}</p></div>
        </div>
      </div>
      <div className="flex-1 p-3"><p className="text-[10px] leading-5 text-[#6B7280]">Manage books, cash-in and cash-out records from one secure workspace.</p></div>
      <div className="space-y-2 border-t border-[#E6E2D6] bg-white/60 p-3">
        <div className="rounded-xl border border-[#E6E2D6] bg-white p-2 space-y-1.5">
          <span className="block truncate text-[9px] font-extrabold uppercase tracking-widest text-[#8E8E93]" title={workspace?.name}>{workspace?.name || 'Workspace'}</span>
          <AppSwitcher label="Apps" fullWidth />
          <button onClick={() => void signOut()} className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[10px] font-bold ${isGuest ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'border border-red-100 bg-red-50 text-red-700 hover:bg-red-100'}`}>{isGuest ? <LogIn className="h-3.5 w-3.5" /> : <LogOut className="h-3.5 w-3.5" />} {isGuest ? 'Log in' : 'Log out'}</button>
        </div>
        <button onClick={onClose} className="w-full rounded-lg px-2 py-1.5 text-[10px] font-bold text-[#6B7280] hover:bg-[#F7F5EE]">Hide menu</button>
      </div>
    </aside>
  );
};
