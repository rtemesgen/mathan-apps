import { Cloud, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { AppSwitcher } from './AppSwitcher';

export function AppControls() {
  const { workspace, signOut } = useAuth();
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <span className="hidden items-center gap-1 text-[10px] font-bold text-emerald-800 lg:flex"><Cloud className="h-3.5 w-3.5" /> {workspace?.name}</span>
      <AppSwitcher label="Apps" />
      <button onClick={() => void signOut()} title="Sign out" className="rounded-xl p-2 text-zinc-500 hover:bg-white"><LogOut className="h-4 w-4" /></button>
    </div>
  );
}
