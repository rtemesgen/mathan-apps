import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { disableGuestMode, enableGuestMode, isGuestMode } from './guestMode';
import { readOffline, writeOffline } from '../lib/localStore';

export interface Workspace { id: string; name: string; }
interface AuthState { configured: boolean; loading: boolean; workspaceLoading: boolean; session: Session | null; user: User | null; workspace: Workspace | null; workspaceError: string | null; isGuest: boolean; continueAsGuest: () => void; refreshWorkspace: () => Promise<Workspace | null>; signOut: () => Promise<void>; }
const AuthContext = createContext<AuthState | null>(null);
export const standaloneMode = import.meta.env.VITE_STANDALONE === 'true';
const workspaceCacheKey = (userId: string) => `mathan_workspace_cache_${userId}`;
function readWorkspaceCache(userId: string): Workspace | null {
  try { const value = localStorage.getItem(workspaceCacheKey(userId)); return value ? JSON.parse(value) as Workspace : null; } catch { return null; }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState(() => isGuestMode());
  const [workspaceLoading, setWorkspaceLoading] = useState(() => !standaloneMode && !isGuestMode() && isSupabaseConfigured);
  const refreshWorkspace = async () => {
    if (!session) { setWorkspace(null); setWorkspaceError(null); setWorkspaceLoading(false); return null; }
    setWorkspaceLoading(true);
    const cacheKey = `workspace:${session.user.id}`;
    const cached = await readOffline<Workspace>(cacheKey);
    if (!navigator.onLine && cached) { setWorkspace(cached); setWorkspaceError(null); setWorkspaceLoading(false); return cached; }
    const { data, error } = await supabase.from('workspace_members').select('workspaces(id,name)').eq('user_id', session.user.id).limit(1).maybeSingle();
    if (error) {
      if (cached) { setWorkspace(cached); setWorkspaceError(null); setWorkspaceLoading(false); return cached; }
      setWorkspace(null); setWorkspaceError(error.message); setWorkspaceLoading(false); return null;
    }
    const row = data as unknown as { workspaces: Workspace | Workspace[] | null } | null;
    const nextWorkspace = Array.isArray(row?.workspaces) ? row?.workspaces[0] ?? null : row?.workspaces ?? null;
    setWorkspace(nextWorkspace); setWorkspaceError(null); setWorkspaceLoading(false);
    if (nextWorkspace) { localStorage.setItem(workspaceCacheKey(session.user.id), JSON.stringify(nextWorkspace)); await writeOffline(cacheKey, nextWorkspace); }
    return nextWorkspace;
  };
  useEffect(() => {
    if (standaloneMode || guest || !isSupabaseConfigured) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        const cached = readWorkspaceCache(data.session.user.id);
        if (cached) { setWorkspace(cached); setWorkspaceLoading(false); }
      }
      setLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.subscription.unsubscribe();
  }, [guest]);
  useEffect(() => { if (!loading) void refreshWorkspace(); }, [session, loading]);
  useEffect(() => {
    if (standaloneMode || guest || !isSupabaseConfigured || !Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
      try {
        const callback = new URL(url);
        const code = callback.searchParams.get('code');
        if (code) { await supabase.auth.exchangeCodeForSession(code); await Browser.close().catch(() => undefined); }
      } catch {
        setWorkspaceError('Google sign-in could not be completed. Please try again.');
      }
    });
    return () => { void listener.then((handle) => handle.remove()); };
  }, [guest]);
  const value = useMemo(() => ({ configured: isSupabaseConfigured && !standaloneMode, loading, workspaceLoading, session, user: session?.user ?? null, workspace, workspaceError, isGuest: guest, continueAsGuest: () => { enableGuestMode(); setGuest(true); setLoading(false); setWorkspaceLoading(false); }, refreshWorkspace, signOut: async () => { if (guest) { disableGuestMode(); setGuest(false); } else if (!standaloneMode) { await supabase.auth.signOut(); setSession(null); } setWorkspace(null); setWorkspaceError(null); setWorkspaceLoading(false); } }), [guest, loading, workspaceLoading, session, workspace, workspaceError]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used inside AuthProvider'); return value; }
