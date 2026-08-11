import { ChevronDown, Grid2X2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { ERP_APPS } from '../appRegistry';
import { useAuth } from '../auth/AuthProvider';

interface AppSwitcherProps { label?: string; fullWidth?: boolean; }

export function AppSwitcher({ label, fullWidth = false }: AppSwitcherProps) {
  const location = useLocation();
  const currentApp = ERP_APPS.find((app) => location.pathname.startsWith(app.route));
  const { canViewApp } = useAuth();

  return (
    <details className={`relative ${fullWidth ? 'w-full' : ''}`}>
      <summary className={`flex cursor-pointer list-none items-center gap-2 rounded-xl border border-[#e6e2d6] bg-white px-3 py-2 text-xs font-bold text-zinc-800 shadow-sm hover:bg-[#faf9f5] ${fullWidth ? 'w-full justify-center' : ''}`}>
        <Grid2X2 className="h-3.5 w-3.5 text-emerald-700" />
        <span className={label ? '' : 'hidden sm:inline'}>{label ?? currentApp?.name ?? 'Apps'}</span>
        <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
      </summary>
      <div className={`absolute z-50 w-56 rounded-2xl border border-[#e6e2d6] bg-white p-2 shadow-xl ${fullWidth ? 'right-[-16px] bottom-full mb-2' : 'right-0 mt-2'}`}>
        <Link to="/" className="mb-1 block rounded-xl px-3 py-2 text-xs font-bold text-zinc-600 hover:bg-[#f6f5ef]">
          All Apps
        </Link>
        {ERP_APPS.filter((app) => canViewApp(app.id)).map((app) => {
          const Icon = app.icon;
          return (
            <Link key={app.id} to={app.route} className="flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-[#f6f5ef]">
              <Icon className="h-4 w-4 text-emerald-700" />
              <span className="text-xs font-bold text-zinc-900">{app.name}</span>
            </Link>
          );
        })}
      </div>
    </details>
  );
}
