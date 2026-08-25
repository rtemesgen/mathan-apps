import { useEffect, useRef, useState } from 'react';
import type { DependencyList } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useLocation, useNavigate } from 'react-router-dom';

const ANDROID_BACK_EVENT = 'mathan:android-back';

export function useAndroidBackButton() {
  const location = useLocation();
  const navigate = useNavigate();
  const [exitConfirmationOpen, setExitConfirmationOpen] = useState(false);
  const exitOpenRef = useRef(false);

  const setExitOpen = (open: boolean) => {
    exitOpenRef.current = open;
    setExitConfirmationOpen(open);
  };

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;

    let active = true;
    const listener = CapacitorApp.addListener('backButton', async () => {
      if (exitOpenRef.current) {
        setExitOpen(false);
        return;
      }
      const event = new CustomEvent(ANDROID_BACK_EVENT, { cancelable: true });
      document.dispatchEvent(event);
      if (event.defaultPrevented || !active) return;

      if (location.pathname !== '/') {
        navigate('/');
        return;
      }

      setExitOpen(true);
    });

    return () => {
      active = false;
      void listener.then((handle) => handle.remove());
    };
  }, [location.pathname, navigate]);

  return {
    exitConfirmationOpen,
    cancelExit: () => setExitOpen(false),
    confirmExit: async () => { setExitOpen(false); await CapacitorApp.exitApp(); },
  };
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
