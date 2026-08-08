import { LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { standaloneMode } from '../auth/AuthProvider';

export function AppControls() {
  const { signOut } = useAuth();
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {!standaloneMode && <button onClick={() => void signOut()} className="relative inline-flex items-center gap-1.5 rounded-lg border border-[#e6e2d6] bg-white px-2 py-1.5 text-[11px] font-bold text-zinc-700 shadow-sm hover:bg-[#faf9f5]"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /><LogOut className="h-3 w-3" /> Log out</button>}
    </div>
  );
}
