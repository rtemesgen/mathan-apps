import { LogOut, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { standaloneMode } from '../auth/AuthProvider';

export function AppControls() {
  const { signOut, workspace } = useAuth();
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {workspace && <Link to="/companies" className="inline-flex max-w-[180px] items-center gap-1.5 rounded-lg border border-[#e6e2d6] bg-white px-2 py-1.5 text-[11px] font-bold text-zinc-700 shadow-sm hover:bg-[#faf9f5]"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: workspace.accent_color }} /><span className="truncate">Switch company · {workspace.name}</span></Link>}
      <Link to="/settings" className="inline-flex items-center gap-1.5 rounded-lg border border-[#e6e2d6] bg-white px-2 py-1.5 text-[11px] font-bold text-zinc-700 shadow-sm hover:bg-[#faf9f5]"><Settings className="h-3 w-3" /> Settings</Link>
      {!standaloneMode && <button onClick={() => void signOut()} className="relative inline-flex items-center gap-1.5 rounded-lg border border-[#e6e2d6] bg-white px-2 py-1.5 text-[11px] font-bold text-zinc-700 shadow-sm hover:bg-[#faf9f5]"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /><LogOut className="h-3 w-3" /> Log out</button>}
    </div>
  );
}
