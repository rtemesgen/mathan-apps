import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLauncher } from './components/AppLauncher';
import { AppShell } from './components/AppShell';
import { BookApp } from './apps/book';
import { PayrollApp } from './apps/payroll';
import { AuthProvider } from './auth/AuthProvider';
import { AuthGate } from './auth/AuthGate';
import { useAndroidBackButton } from './hooks/useAndroidBackButton';
import { AppUpdateNotice } from './components/AppUpdateNotice';

function AndroidNavigationBridge() {
  useAndroidBackButton();
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AndroidNavigationBridge />
        <AppUpdateNotice />
        <AuthGate>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<AppLauncher />} />
              <Route path="/book" element={<BookApp />} />
              <Route path="/payroll" element={<PayrollApp />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AuthGate>
      </BrowserRouter>
    </AuthProvider>
  );
}
