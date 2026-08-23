import { Bell, LogIn, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { standaloneMode } from '../auth/AuthProvider';
import { useEffect, useState } from 'react';

export function AppControls() {
  const { signOut, workspace, isGuest, user } = useAuth();
  const [unread, setUnread] = useState(0);
  useEffect(() => { const update = (event: Event) => setUnread(Number((event as CustomEvent<{ unread: number }>).detail.unread ?? 0)); window.addEventListener('mathan:notification-count', update); return () => window.removeEventListener('mathan:notification-count', update); }, []);
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
      {workspace && <Link to="/companies" className="app-control-company inline-flex min-w-0 w-auto max-w-[48vw] items-center gap-1.5 rounded-lg border border-[#e6e2d6] bg-white px-2 py-1.5 text-[11px] font-bold text-zinc-700 shadow-sm hover:bg-[#faf9f5] sm:max-w-[220px]"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: workspace.accent_color }} /><span className="truncate">Switch · {workspace.name}</span></Link>}
      {!standaloneMode && user && <button type="button" aria-label="Notifications" onClick={() => window.dispatchEvent(new Event('mathan:toggle-notifications'))} className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e6e2d6] bg-white text-zinc-700 shadow-sm hover:bg-[#faf9f5]"><Bell className="h-4 w-4" />{unread > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-extrabold text-white">{unread > 9 ? '9+' : unread}</span>}</button>}
      {!standaloneMode && <button onClick={() => void signOut()} aria-label={isGuest ? 'Log in' : 'Log out'} className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center gap-1 rounded-lg p-0 text-[10px] font-bold shadow-sm sm:h-auto sm:w-auto sm:px-2 sm:py-1.5 ${isGuest ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'border border-[#e6e2d6] bg-white text-zinc-700 hover:bg-[#faf9f5]'}`}><span className={`h-1.5 w-1.5 rounded-full ${isGuest ? 'bg-emerald-500' : 'bg-red-500'}`} />{isGuest ? <LogIn className="h-3 w-3" /> : <LogOut className="h-3 w-3" />}<span className="hidden sm:inline">{isGuest ? 'Log in' : 'Log out'}</span></button>}
    </div>
  );
}
