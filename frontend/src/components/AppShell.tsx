import { Building2 } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { AppControls } from './AppControls';
import { AppBrand } from './AppBrand';
import { AppHeader } from './AppHeader';
import { ERP_APPS } from '../appRegistry';
import { useAuth } from '../auth/AuthProvider';

export function AppShell() {
  const location = useLocation();
  const { workspace } = useAuth();
  const currentApp = ERP_APPS.find((app) => location.pathname.startsWith(app.route));

  return (
    <div className="erp-app min-h-screen border-2 border-transparent bg-[#F8F6F0] text-[#1C1D1F]" style={workspace?.accent_color ? { borderColor: workspace.accent_color } : undefined}>
      {!currentApp && <AppHeader><Link to="/" className="rounded-xl p-1 hover:bg-white/60"><AppBrand subtitle="BUSINESS APPS" /></Link><AppControls /></AppHeader>}
      <Outlet />
    </div>
  );
}

export function AppLoadingFallback() {
  return <div className="flex min-h-[60vh] items-center justify-center text-sm font-semibold text-zinc-500"><Building2 className="mr-2 h-4 w-4" /> Loading Mathan ERP…</div>;
}
