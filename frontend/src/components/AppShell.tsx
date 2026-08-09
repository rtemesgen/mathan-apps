import { Building2 } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { AppControls } from './AppControls';
import { ERP_APPS } from '../appRegistry';
import { useAuth } from '../auth/AuthProvider';

export function AppShell() {
  const location = useLocation();
  const { workspace } = useAuth();
  const currentApp = ERP_APPS.find((app) => location.pathname.startsWith(app.route));

  return (
    <div className="min-h-screen border-2 border-transparent bg-[#f6f5ef] text-zinc-900" style={workspace?.accent_color ? { borderColor: workspace.accent_color } : undefined}>
      {!currentApp && <header className="native-safe-top sticky top-0 z-40 border-b border-[#e8e6dc] bg-[#f6f5ef]/95 px-3 py-2.5 backdrop-blur sm:px-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5 rounded-xl p-1 hover:bg-white/60">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 font-serif text-lg font-bold italic text-white">M</span>
            <span className="leading-none">
              <span className="block font-serif text-sm font-bold italic tracking-tight">Mathan ERP</span>
              <span className="mt-1 block text-[8px] font-extrabold uppercase tracking-[0.2em] text-zinc-400">Business apps</span>
            </span>
          </Link>
          <AppControls />
        </div>
      </header>}
      <Outlet />
    </div>
  );
}

export function AppLoadingFallback() {
  return <div className="flex min-h-[60vh] items-center justify-center text-sm font-semibold text-zinc-500"><Building2 className="mr-2 h-4 w-4" /> Loading Mathan ERP…</div>;
}
