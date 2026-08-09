import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AppLauncher } from './components/AppLauncher';
import { AppShell } from './components/AppShell';
import { BookApp } from './apps/book';
import { PayrollApp } from './apps/payroll';
import { AuthProvider } from './auth/AuthProvider';
import { AuthGate } from './auth/AuthGate';
import { useAndroidBackButton } from './hooks/useAndroidBackButton';
import { AppUpdateNotice } from './components/AppUpdateNotice';
import { AppToast } from './components/AppToast';
import { AppUpdateProvider } from './hooks/useAppUpdate';
import { InviteAcceptance, SettingsPage } from './components/SettingsPage';
import { CompanySelector } from './components/CompanySelector';
import { useAuth, type AppId } from './auth/AuthProvider';

function InviteRoute() {
  const { token = '' } = useParams();
  return <InviteAcceptance token={token} />;
}

function AppAccessGate({ app, children }: { app: AppId; children: React.ReactNode }) {
  const { canViewApp, workspaceLoading } = useAuth();
  if (workspaceLoading) return <div className="flex min-h-[70vh] items-center justify-center text-sm font-semibold text-zinc-500">Checking app access…</div>;
  if (!canViewApp(app)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AndroidNavigationBridge() {
  useAndroidBackButton();
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppUpdateProvider>
          <AndroidNavigationBridge />
          <AppUpdateNotice />
          <AppToast />
          <AuthGate>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<AppLauncher />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/companies" element={<CompanySelector />} />
                <Route path="/invite/:token" element={<InviteRoute />} />
                <Route path="/book" element={<AppAccessGate app="book"><BookApp /></AppAccessGate>} />
                <Route path="/payroll" element={<AppAccessGate app="payroll"><PayrollApp /></AppAccessGate>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </AuthGate>
        </AppUpdateProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
