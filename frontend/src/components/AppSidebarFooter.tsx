import { LogIn, LogOut } from 'lucide-react';
import { AppSwitcher } from './AppSwitcher';

export function AppSidebarFooter({ workspaceName, isGuest, onSignOut, onClose, compact = false }: { workspaceName?: string; isGuest: boolean; onSignOut: () => void; onClose?: () => void; compact?: boolean }) {
  const content = <div className="erp-card space-y-1.5 p-2">
      <span className="block truncate px-1 text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#9A978F]" title={workspaceName}>{workspaceName || 'Workspace'}</span>
      <AppSwitcher label="Apps" fullWidth />
      <button type="button" onClick={onSignOut} className={`flex min-h-10 w-full items-center justify-center gap-1.5 rounded-[11px] px-2 py-2 text-xs font-semibold ${isGuest ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'border border-red-100 bg-red-50 text-red-700 hover:bg-red-100'}`} title={isGuest ? 'Log in' : 'Log out'}>{isGuest ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}{isGuest ? 'Log in' : 'Log out'}</button>
    </div>;
  if (compact) return content;
  return <div className="mt-auto border-t border-[#E5DFD2] bg-white/60 p-3">{content}</div>;
}
