import { useEffect, useRef, useState } from 'react';
import type { DependencyList } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useLocation, useNavigate } from 'react-router-dom';
import { executePreparedExit, prepareForAndroidExit } from '../lib/androidExit';
import { diagnostic } from '../lib/diagnostics';

const ANDROID_BACK_EVENT = 'mathan:android-back';

export function useAndroidBackButton() {
  const location = useLocation();
  const navigate = useNavigate();
  const [exitConfirmationOpen, setExitConfirmationOpen] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [exitError, setExitError] = useState('');
  const exitOpenRef = useRef(false);

  const setExitOpen = (open: boolean) => {
    exitOpenRef.current = open;
    setExitConfirmationOpen(open);
    if (open) setExitError('');
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
    exitBusy,
    exitError,
    cancelExit: () => { if (!exitBusy) setExitOpen(false); },
    confirmExit: async () => {
      if (exitBusy) return;
      setExitBusy(true);
      setExitError('');
      try {
        const result = await executePreparedExit(prepareForAndroidExit, () => CapacitorApp.exitApp());
        diagnostic('android-exit-prepared', result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Local data could not be verified. The app was kept open.';
        diagnostic('android-exit-blocked', { error: message });
        setExitError(message);
      } finally {
        setExitBusy(false);
      }
    },
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
