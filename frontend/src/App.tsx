import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AppLauncher } from './components/AppLauncher';
import { AppShell } from './components/AppShell';
import { BookApp } from './apps/book';
import { PayrollApp } from './apps/payroll';
import { TruckApp } from './apps/truck';
import { AuthProvider } from './auth/AuthProvider';
import { AuthGate } from './auth/AuthGate';
import { useAndroidBackButton } from './hooks/useAndroidBackButton';
import { AppUpdateNotice } from './components/AppUpdateNotice';
import { AppToast } from './components/AppToast';
import { SyncIssueSheet } from './components/SyncIssueSheet';
import { AppNotificationCenter } from './components/AppNotificationCenter';
import { AppConnectivityBanner } from './components/AppConnectivityBanner';
import { AppUpdateProvider } from './hooks/useAppUpdate';
import { GuestSettingsPage, InviteAcceptance, SettingsPage } from './components/SettingsPage';
import { CompanySelector } from './components/CompanySelector';
import { useAuth, type AppId } from './auth/AuthProvider';
import { AdminPage } from './admin/AdminPage';
import { AppDialog } from './components/AppDialog';
import { AppButton } from './components/AppButton';
import { LogOut } from 'lucide-react';
import { DataLayerGate } from './components/DataLayerGate';

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

function SystemAdminGate({ children }: { children: React.ReactNode }) {
  const { isSystemAdmin, adminLoading } = useAuth();
  if (adminLoading) return <div className="flex min-h-[70vh] items-center justify-center text-sm font-semibold text-zinc-500">Checking administrator access…</div>;
  if (!isSystemAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AndroidNavigationBridge() {
  const { exitConfirmationOpen, exitBusy, exitError, cancelExit, confirmExit } = useAndroidBackButton();
  return <AppDialog open={exitConfirmationOpen} title="Exit Mathan ERP?" onClose={cancelExit} footer={<><AppButton type="button" disabled={exitBusy} onClick={cancelExit}>Stay</AppButton><AppButton type="button" disabled={exitBusy} variant="primary" onClick={() => void confirmExit()}><LogOut className="h-4 w-4" />{exitBusy ? 'Finishing local saves…' : 'Exit app'}</AppButton></>}>
    <p className="text-sm leading-6 text-[#5f5d58]">Your saved records will stay on this device. Do you want to close the app?</p>
    {exitError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-semibold leading-5 text-red-800">{exitError}</p>}
  </AppDialog>;
}

function SettingsRoute() {
  const { isGuest } = useAuth();
  return isGuest ? <GuestSettingsPage /> : <SettingsPage />;
}

export default function App() {
  return (
    <DataLayerGate><AuthProvider>
      <BrowserRouter>
        <AppUpdateProvider>
          <AndroidNavigationBridge />
          <AppUpdateNotice />
          <AppToast />
          <SyncIssueSheet />
          <AppConnectivityBanner />
          <AppNotificationCenter />
          <AuthGate>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<AppLauncher />} />
                <Route path="/settings" element={<SettingsRoute />} />
                <Route path="/admin" element={<SystemAdminGate><AdminPage /></SystemAdminGate>} />
                <Route path="/companies" element={<CompanySelector />} />
                <Route path="/invite/:token" element={<InviteRoute />} />
                <Route path="/book" element={<AppAccessGate app="book"><BookApp /></AppAccessGate>} />
                <Route path="/payroll" element={<AppAccessGate app="payroll"><PayrollApp /></AppAccessGate>} />
                <Route path="/truck" element={<AppAccessGate app="truck"><TruckApp /></AppAccessGate>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </AuthGate>
        </AppUpdateProvider>
      </BrowserRouter>
    </AuthProvider></DataLayerGate>
  );
}
