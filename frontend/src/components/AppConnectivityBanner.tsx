import { CloudOff } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function AppConnectivityBanner() {
  const online = useOnlineStatus();
  const { pathname } = useLocation();
  const isBusinessApp = pathname.startsWith('/book') || pathname.startsWith('/payroll') || pathname.startsWith('/truck');
  if (online || !isBusinessApp) return null;
  // Cash Book and Truck expose fixed bottom action bars. Keep the status
  // notice above those controls so offline users can still open Cash In/Out
  // and transaction forms.
  return <div role="status" className="native-safe-bottom fixed bottom-20 left-3 z-[215] flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-900 shadow-lg"><CloudOff className="h-4 w-4 shrink-0" />Offline · changes save on this device and sync when connected.</div>;
}
