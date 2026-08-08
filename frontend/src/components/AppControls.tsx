import { LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { standaloneMode } from '../auth/AuthProvider';

export function AppControls() {
  const { signOut } = useAuth();
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {!standaloneMode && <button onClick={() => void signOut()} className="inline-flex items-center gap-2 rounded-xl border border-[#e6e2d6] bg-white px-3 py-2 text-xs font-bold text-zinc-700 shadow-sm hover:bg-[#faf9f5]"><LogOut className="h-3.5 w-3.5" /> Log out</button>}
    </div>
  );
}
