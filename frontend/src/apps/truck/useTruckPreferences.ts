import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { localDateString } from '../../lib/localDate';

type StoredPreferences = { view?: string; truckId?: string; date?: string; sortBy?: string };

export function useTruckPreferences(workspaceId: string | undefined, currentTruckId: string, setCurrentTruckId: Dispatch<SetStateAction<string>>) {
  const [currentView, setCurrentView] = useState('dashboard');
  const [sortBy, setSortBy] = useState('balance');
  const [calculationDate, setCalculationDate] = useState(() => localDateString());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const ready = useRef(false);
  const readyKey = useRef('');
  const preferenceKey = workspaceId ? `mathan_truck_preferences_${workspaceId}` : '';

  useEffect(() => {
    if (!ready.current || readyKey.current !== preferenceKey || !preferenceKey) return;
    localStorage.setItem(preferenceKey, JSON.stringify({ view: currentView, truckId: currentTruckId, date: calculationDate, sortBy }));
  }, [preferenceKey, currentView, currentTruckId, calculationDate, sortBy]);

  useEffect(() => {
    ready.current = false;
    readyKey.current = '';
    if (!preferenceKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}') as StoredPreferences;
      if (saved.view) setCurrentView(saved.view);
      if (saved.truckId) setCurrentTruckId(saved.truckId);
      if (saved.date) setCalculationDate(saved.date);
      if (saved.sortBy) setSortBy(saved.sortBy);
    } catch { /* preferences are optional */ }
    readyKey.current = preferenceKey;
    ready.current = true;
  }, [preferenceKey, setCurrentTruckId]);

  return { currentView, setCurrentView, sortBy, setSortBy, calculationDate, setCalculationDate, isSidebarOpen, setIsSidebarOpen };
}
