import { useEffect } from 'react';
import type { DependencyList } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Toast } from '@capacitor/toast';
import { useLocation, useNavigate } from 'react-router-dom';

const ANDROID_BACK_EVENT = 'mathan:android-back';
const DOUBLE_BACK_WINDOW_MS = 1800;

export function useAndroidBackButton() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;

    let active = true;
    let lastRootBackAt = 0;
    const listener = CapacitorApp.addListener('backButton', async () => {
      const event = new CustomEvent(ANDROID_BACK_EVENT, { cancelable: true });
      document.dispatchEvent(event);
      if (event.defaultPrevented || !active) return;

      if (location.pathname !== '/') {
        navigate('/');
        return;
      }

      const now = Date.now();
      if (now - lastRootBackAt > DOUBLE_BACK_WINDOW_MS) {
        lastRootBackAt = now;
        void Toast.show({ text: 'Press back again to exit Mathan ERP', duration: 'short' });
        return;
      }
      if (!window.confirm('Are you sure you want to exit Mathan ERP?')) {
        lastRootBackAt = 0;
        return;
      }
      await CapacitorApp.exitApp();
    });

    return () => {
      active = false;
      void listener.then((handle) => handle.remove());
    };
  }, [location.pathname, navigate]);
}

export function useAndroidBackHandler(handler: () => boolean, deps: DependencyList) {
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    const onBack = (event: Event) => {
      if (handler()) event.preventDefault();
    };
    document.addEventListener(ANDROID_BACK_EVENT, onBack);
    return () => document.removeEventListener(ANDROID_BACK_EVENT, onBack);
    // The caller owns the dependency list because handlers commonly close local state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
