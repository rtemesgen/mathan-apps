import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { disableGuestMode, enableGuestMode, isGuestMode } from './guestMode';
import { readOffline, writeOffline } from '../lib/localStore';
import { prefetchWorkspaceData } from '../lib/offlinePrefetch';

export type AppId = 'book' | 'payroll' | 'truck';
export type AppPermission = 'none' | 'view' | 'edit';
export interface Workspace { id: string; name: string; accent_color: string; }
export interface WorkspaceAppAccess { app_id: AppId; enabled: boolean; permission: AppPermission; }
export interface WorkspaceMembership extends Workspace { role: 'owner' | 'member'; appAccess: Record<AppId, WorkspaceAppAccess>; deletionStatus?: 'active' | 'scheduled'; deletionScheduledFor?: string | null; }
interface AuthState { configured: boolean; loading: boolean; workspaceLoading: boolean; adminLoading: boolean; passwordRecovery: boolean; session: Session | null; user: User | null; workspace: Workspace | null; workspaces: WorkspaceMembership[]; workspaceError: string | null; isOwner: boolean; isSystemAdmin: boolean; appAccess: Record<AppId, WorkspaceAppAccess>; continueAsGuest: () => void; refreshWorkspace: (preferredWorkspaceId?: string) => Promise<Workspace | null>; refreshAccess: () => Promise<void>; refreshAdmin: () => Promise<void>; switchWorkspace: (workspaceId: string) => void; finishPasswordRecovery: () => void; signOut: () => Promise<void>; canViewApp: (app: AppId) => boolean; canEditApp: (app: AppId) => boolean; isGuest: boolean; }
const AuthContext = createContext<AuthState | null>(null);
export const standaloneMode = import.meta.env.VITE_STANDALONE === 'true';
const workspaceCacheKey = (userId: string) => `mathan_workspace_cache_${userId}`;
const adminCacheKey = (userId: string) => `mathan_system_admin_${userId}`;
const defaultAppAccess = (): Record<AppId, WorkspaceAppAccess> => ({ book: { app_id: 'book', enabled: true, permission: 'edit' }, payroll: { app_id: 'payroll', enabled: true, permission: 'edit' }, truck: { app_id: 'truck', enabled: true, permission: 'edit' } });
function readWorkspaceCache(userId: string): Workspace | null {
  try { const value = localStorage.getItem(workspaceCacheKey(userId)); return value ? JSON.parse(value) as Workspace : null; } catch { return null; }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceMembership[]>([]);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState(() => isGuestMode());
  const [workspaceLoading, setWorkspaceLoading] = useState(() => !standaloneMode && !isGuestMode() && isSupabaseConfigured);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [appAccess, setAppAccess] = useState<Record<AppId, WorkspaceAppAccess>>(defaultAppAccess);
  const applyWorkspace = (membership: WorkspaceMembership | null) => {
    setWorkspace(membership ? { id: membership.id, name: membership.name, accent_color: membership.accent_color } : null);
    setIsOwner(membership?.role === 'owner');
    setAppAccess(membership?.appAccess ?? defaultAppAccess());
  };
  const refreshAccess = async () => {
    if (!session || standaloneMode || guest) {
      setIsOwner(true);
      setAppAccess(defaultAppAccess());
      return;
    }
    await refreshWorkspace();
  };
  const refreshAdmin = async () => {
    if (!session || standaloneMode || guest || !isSupabaseConfigured) { setIsSystemAdmin(false); setAdminLoading(false); return; }
    setAdminLoading(true);
    const cacheKey = adminCacheKey(session.user.id);
    let cached = false;
    try { cached = localStorage.getItem(cacheKey) === 'true'; if (cached) setIsSystemAdmin(true); } catch { /* storage may be unavailable */ }
    let confirmed = false;
    for (let attempt = 0; attempt < 3 && !confirmed; attempt += 1) {
      const { data, error } = await supabase.functions.invoke('system-admin', { body: { action: 'status' } });
      if (!error) {
        confirmed = true;
        const admin = data?.is_admin === true;
        setIsSystemAdmin(admin);
        try { if (admin) localStorage.setItem(cacheKey, 'true'); else localStorage.removeItem(cacheKey); } catch { /* storage may be unavailable */ }
      } else if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 300 * (attempt + 1)));
    }
    if (!confirmed && !cached) setIsSystemAdmin(false);
    setAdminLoading(false);
  };
  const refreshWorkspace = async (preferredWorkspaceId?: string) => {
    if (!session) { setWorkspace(null); setWorkspaceError(null); setWorkspaceLoading(false); return null; }
    setWorkspaceLoading(true);
    const cached = readWorkspaceCache(session.user.id) ?? await readOffline<Workspace>(`workspace:${session.user.id}`);
    const [{ data, error }, { data: deletionRows }] = await Promise.all([supabase.rpc('list_my_workspaces'), supabase.rpc('list_my_workspace_deletions')]);
    if (error) {
      if (cached) { applyWorkspace({ ...cached, role: 'owner', appAccess: defaultAppAccess() }); setWorkspaceError(null); setWorkspaceLoading(false); return cached; }
      setWorkspace(null); setWorkspaceError(error.message); setWorkspaceLoading(false); return null;
    }
    const memberships = ((data as Array<{ workspace_id: string; workspace_name: string; accent_color: string; member_role: 'owner' | 'member'; book_enabled: boolean; book_permission: AppPermission; payroll_enabled: boolean; payroll_permission: AppPermission }> | null) ?? []).map((row) => ({
      id: row.workspace_id, name: row.workspace_name, accent_color: row.accent_color, role: row.member_role,
      deletionStatus: 'active' as 'active' | 'scheduled', deletionScheduledFor: null,
      appAccess: { book: { app_id: 'book' as AppId, enabled: row.book_enabled, permission: row.book_permission }, payroll: { app_id: 'payroll' as AppId, enabled: row.payroll_enabled, permission: row.payroll_permission }, truck: { app_id: 'truck' as AppId, enabled: true, permission: 'none' as AppPermission } },
    }));
    for (const row of ((deletionRows as Array<{ workspace_id: string; workspace_name: string; accent_color: string; member_role: 'owner' | 'member'; deletion_status: 'scheduled'; deletion_scheduled_for: string | null }> | null) ?? [])) memberships.push({ id: row.workspace_id, name: row.workspace_name, accent_color: row.accent_color, role: row.member_role, deletionStatus: 'scheduled', deletionScheduledFor: row.deletion_scheduled_for, appAccess: defaultAppAccess() });
    const { data: truckAccess } = await supabase.rpc('list_my_truck_access');
    const accessByWorkspace = new Map(((truckAccess as Array<{ workspace_id: string; truck_enabled: boolean; truck_permission: AppPermission }> | null) ?? []).map((item) => [item.workspace_id, item]));
    memberships.forEach((membership) => { const access = accessByWorkspace.get(membership.id); membership.appAccess.truck = { app_id: 'truck', enabled: access?.truck_enabled ?? true, permission: access?.truck_permission ?? (membership.role === 'owner' ? 'edit' : 'none') }; });
    setWorkspaces(memberships);
    const current = memberships.find((item) => item.id === (preferredWorkspaceId ?? workspace?.id));
    const preferred = current ?? memberships.find((item) => item.role === 'owner') ?? memberships[0] ?? null;
    applyWorkspace(preferred); setWorkspaceError(null); setWorkspaceLoading(false);
    if (preferred) { localStorage.setItem(workspaceCacheKey(session.user.id), JSON.stringify(preferred)); await writeOffline(`workspace:${session.user.id}`, preferred); void prefetchWorkspaceData(preferred.id, session.user.id); }
    return preferred ? { id: preferred.id, name: preferred.name, accent_color: preferred.accent_color } : null;
  };
  const switchWorkspace = (workspaceId: string) => {
    const next = workspaces.find((item) => item.id === workspaceId);
    if (!next || next.id === workspace?.id) return;
    applyWorkspace(next);
    if (session) localStorage.setItem(workspaceCacheKey(session.user.id), JSON.stringify(next));
  };
  useEffect(() => {
    if (standaloneMode || guest || !isSupabaseConfigured) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.subscription.unsubscribe();
  }, [guest]);
  useEffect(() => { if (!loading) void refreshWorkspace(); }, [session, loading]);
  useEffect(() => {
    const refreshOfflineCache = () => { if (session && workspace && navigator.onLine) void prefetchWorkspaceData(workspace.id, session.user.id); };
    window.addEventListener('online', refreshOfflineCache);
    document.addEventListener('visibilitychange', refreshOfflineCache);
    refreshOfflineCache();
    return () => { window.removeEventListener('online', refreshOfflineCache); document.removeEventListener('visibilitychange', refreshOfflineCache); };
  }, [session?.user.id, workspace?.id]);
  useEffect(() => { if (!loading) void refreshAdmin(); }, [session, loading, guest]);
  useEffect(() => {
    if (standaloneMode || guest || !isSupabaseConfigured || !Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
      try {
        const callback = new URL(url);
        const code = callback.searchParams.get('code');
        const type = callback.searchParams.get('type') ?? new URLSearchParams(callback.hash.replace(/^#/, '')).get('type');
        if (code) await supabase.auth.exchangeCodeForSession(code);
        const hash = new URLSearchParams(callback.hash.replace(/^#/, ''));
        const accessToken = hash.get('access_token');
        const refreshToken = hash.get('refresh_token');
        if (!code && accessToken && refreshToken) await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (type === 'recovery') setPasswordRecovery(true);
        await supabase.auth.getSession();
        await Browser.close().catch(() => undefined);
      } catch {
        setWorkspaceError('Google sign-in could not be completed. Please try again.');
      }
    });
    return () => { void listener.then((handle) => handle.remove()); };
  }, [guest]);
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('type') === 'recovery') setPasswordRecovery(true);
  }, []);
  const value = useMemo(() => ({ configured: isSupabaseConfigured && !standaloneMode, loading, workspaceLoading, adminLoading, passwordRecovery, session, user: session?.user ?? null, workspace, workspaces, workspaceError, isOwner, isSystemAdmin, appAccess, isGuest: guest, continueAsGuest: () => { enableGuestMode(); setGuest(true); setLoading(false); setWorkspaceLoading(false); setAdminLoading(false); setIsSystemAdmin(false); }, refreshWorkspace, refreshAccess, refreshAdmin, switchWorkspace, canViewApp: (app: AppId) => appAccess[app]?.enabled === true && appAccess[app]?.permission !== 'none', canEditApp: (app: AppId) => appAccess[app]?.enabled === true && appAccess[app]?.permission === 'edit', finishPasswordRecovery: () => setPasswordRecovery(false), signOut: async () => { if (guest) { disableGuestMode(); setGuest(false); } else if (!standaloneMode) { await supabase.auth.signOut(); setSession(null); } setWorkspace(null); setWorkspaces([]); setWorkspaceError(null); setWorkspaceLoading(false); setAdminLoading(false); setIsSystemAdmin(false); } }), [guest, loading, workspaceLoading, adminLoading, passwordRecovery, session, workspace, workspaces, workspaceError, isOwner, isSystemAdmin, appAccess]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used inside AuthProvider'); return value; }
