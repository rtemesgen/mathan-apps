import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { enableGuestMode } from './auth/guestMode';
import { Capacitor } from '@capacitor/core';
import { getOfflineDiagnosticSnapshot, type OfflineDiagnosticSnapshot } from './lib/offlineDiagnostics';

declare global {
  interface Window {
    __mathanOfflineDiagnostics?: { snapshot: () => Promise<OfflineDiagnosticSnapshot> };
  }
}

if (import.meta.env.VITE_ENABLE_OFFLINE_DIAGNOSTICS === 'true') {
  Object.defineProperty(window, '__mathanOfflineDiagnostics', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({ snapshot: getOfflineDiagnosticSnapshot }),
  });
}

if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js'); });
}

class StartupErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f5ef] p-5 text-zinc-900">
        <section className="w-full max-w-sm rounded-3xl border border-[#e6e2d6] bg-white p-6 text-center shadow-xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900 text-lg font-bold text-white">M</div>
          <h1 className="mt-4 font-serif text-2xl font-bold">Mathan ERP could not start</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">The app encountered a startup problem. You can continue offline, or try opening it again.</p>
          <button type="button" onClick={() => { enableGuestMode(); window.location.reload(); }} className="mt-5 w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white">Continue offline</button>
          <button type="button" onClick={() => window.location.reload()} className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm font-bold text-zinc-700">Try again</button>
          <p className="mt-4 break-words text-[10px] text-zinc-400">{this.state.error.message || 'Unknown startup error'}</p>
        </section>
      </main>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StartupErrorBoundary>
      <App />
    </StartupErrorBoundary>
  </React.StrictMode>,
);
