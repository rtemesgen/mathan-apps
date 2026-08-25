import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { disableGuestMode, enableGuestMode, isGuestMode } from './guestMode';
import { clearOfflineMemory, clearOfflinePrefix, offlineStore } from '../lib/localStore';
import { prefetchWorkspaceData } from '../lib/offlinePrefetch';
import { syncWorkspaceQueues } from '../lib/offlineSync';
import { createGuestWorkspace as createLocalGuestWorkspace, deleteGuestWorkspace as deleteLocalGuestWorkspace, migrateLegacyGuestData, readGuestWorkspaceCache, renameGuestWorkspace as renameLocalGuestWorkspace, selectGuestWorkspace as selectLocalGuestWorkspace, type GuestWorkspaceCache } from './guestWorkspaces';

export type AppId = 'book' | 'payroll' | 'truck';
export type AppPermission = 'none' | 'view' | 'edit';
export interface Workspace { id: string; name: string; accent_color: string; }
export interface WorkspaceAppAccess { app_id: AppId; enabled: boolean; permission: AppPermission; }
export interface WorkspaceMembership extends Workspace { role: 'owner' | 'member'; appAccess: Record<AppId, WorkspaceAppAccess>; deletionStatus?: 'active' | 'scheduled'; deletionScheduledFor?: string | null; }
interface AuthState { configured: boolean; loading: boolean; workspaceLoading: boolean; adminLoading: boolean; passwordRecovery: boolean; loginError: string | null; session: Session | null; user: User | null; workspace: Workspace | null; workspaces: WorkspaceMembership[]; workspaceError: string | null; isOwner: boolean; isSystemAdmin: boolean; appAccess: Record<AppId, WorkspaceAppAccess>; continueAsGuest: () => void; clearLoginError: () => void; refreshWorkspace: (preferredWorkspaceId?: string) => Promise<Workspace | null>; refreshAccess: () => Promise<void>; refreshAdmin: () => Promise<void>; switchWorkspace: (workspaceId: string) => void; createGuestWorkspace: (name: string) => void; renameGuestWorkspace: (workspaceId: string, name: string, accentColor?: string) => void; deleteGuestWorkspace: (workspaceId: string) => Promise<void>; finishPasswordRecovery: () => void; signOut: () => Promise<void>; canViewApp: (app: AppId) => boolean; canEditApp: (app: AppId) => boolean; isGuest: boolean; }
const AuthContext = createContext<AuthState | null>(null);
export const standaloneMode = import.meta.env?.VITE_STANDALONE === 'true';
const workspaceCacheKey = (userId: string) => `mathan_workspace_cache_${userId}`;
const workspaceListCacheKey = (userId: string) => `workspaces:${userId}:v1`;
const workspaceListLocalCacheKey = (userId: string) => `mathan_workspace_list_cache_${userId}`;
const adminCacheKey = (userId: string) => `mathan_system_admin_${userId}`;
const defaultAppAccess = (): Record<AppId, WorkspaceAppAccess> => ({ book: { app_id: 'book', enabled: true, permission: 'edit' }, payroll: { app_id: 'payroll', enabled: true, permission: 'edit' }, truck: { app_id: 'truck', enabled: true, permission: 'edit' } });
const guestMemberships = (cache: GuestWorkspaceCache): WorkspaceMembership[] => cache.memberships.map((item) => ({ id: item.id, name: item.name, accent_color: item.accent_color, role: 'owner', deletionStatus: 'active', deletionScheduledFor: null, appAccess: defaultAppAccess() }));
interface OfflineWorkspaceCache { version: 1; memberships: WorkspaceMembership[]; selectedWorkspaceId: string | null; cachedAt: string; permissionsLastVerifiedAt?: string; }
function normalizeLegacyWorkspace(value: WorkspaceMembership | null): WorkspaceMembership | null {
  if (!value?.id || !value.name) return null;
  return { ...value, role: value.role ?? 'owner', appAccess: value.appAccess ?? defaultAppAccess(), deletionStatus: value.deletionStatus ?? 'active', deletionScheduledFor: value.deletionScheduledFor ?? null };
}
async function readWorkspaceCache(userId: string): Promise<OfflineWorkspaceCache | null> {
  // localStorage is intentionally checked first. It is synchronous and is
  // available before Android's first encrypted-SQLite migration finishes, so
  // a signed-in user can enter a previously opened company immediately.
  try {
    const fast = localStorage.getItem(workspaceListLocalCacheKey(userId));
    if (fast) {
      const parsed = JSON.parse(fast) as OfflineWorkspaceCache;
      if (parsed?.version === 1 && Array.isArray(parsed.memberships)) return parsed;
    }
  } catch { /* continue with the durable shared store */ }
  const cached = await offlineStore.read<OfflineWorkspaceCache>(workspaceListCacheKey(userId));
  if (cached?.version === 1 && Array.isArray(cached.memberships)) return cached;
  let legacy: WorkspaceMembership | null = null;
  try { const value = localStorage.getItem(workspaceCacheKey(userId)); legacy = value ? normalizeLegacyWorkspace(JSON.parse(value) as WorkspaceMembership) : null; } catch { /* use the IndexedDB fallback */ }
  legacy ??= normalizeLegacyWorkspace(await offlineStore.read<WorkspaceMembership>(`workspace:${userId}`));
  // Legacy single-workspace caches predate the timestamp field. Treat the
  // migrated record as a valid local cache so an offline restart can open the
  // company immediately instead of being rejected as an expired workspace.
  return legacy ? { version: 1, memberships: [legacy], selectedWorkspaceId: legacy.id, cachedAt: new Date().toISOString() } : null;
}
async function writeWorkspaceCache(userId: string, memberships: WorkspaceMembership[], selectedWorkspaceId: string | null) {
  const cache: OfflineWorkspaceCache = { version: 1, memberships, selectedWorkspaceId, cachedAt: new Date().toISOString(), permissionsLastVerifiedAt: new Date().toISOString() };
  try { localStorage.setItem(workspaceListLocalCacheKey(userId), JSON.stringify(cache)); } catch { /* shared offline storage remains authoritative */ }
  await offlineStore.write(workspaceListCacheKey(userId), cache);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const guestAtStartup = isGuestMode();
  const initialGuestCache = guestAtStartup ? readGuestWorkspaceCache() : null;
  const [session, setSession] = useState<Session | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(() => { const selected = initialGuestCache?.memberships.find((item) => item.id === initialGuestCache.selectedWorkspaceId); return selected ? { id: selected.id, name: selected.name, accent_color: selected.accent_color } : null; });
  const [workspaces, setWorkspaces] = useState<WorkspaceMembership[]>(() => initialGuestCache ? guestMemberships(initialGuestCache) : []);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState(guestAtStartup);
  const [workspaceLoading, setWorkspaceLoading] = useState(() => !standaloneMode && !isGuestMode() && isSupabaseConfigured);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(guestAtStartup);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [offlineAccessExpired, setOfflineAccessExpired] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [appAccess, setAppAccess] = useState<Record<AppId, WorkspaceAppAccess>>(defaultAppAccess);
  const refreshSequence = useRef(0);
  const applyWorkspace = (membership: WorkspaceMembership | null) => {
    setWorkspace(membership ? { id: membership.id, name: membership.name, accent_color: membership.accent_color } : null);
    setIsOwner(membership?.role === 'owner');
    setAppAccess(membership?.appAccess ?? defaultAppAccess());
  };
  const applyGuestCache = (cache: GuestWorkspaceCache) => {
    const memberships = guestMemberships(cache);
    setWorkspaces(memberships);
    applyWorkspace(memberships.find((item) => item.id === cache.selectedWorkspaceId) ?? memberships[0] ?? null);
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
    const requestId = ++refreshSequence.current;
    const cached = await readWorkspaceCache(session.user.id);
    const restoreCached = (message: string) => {
      const memberships = cached?.memberships ?? [];
      setWorkspaces(memberships);
      const selectedId = preferredWorkspaceId ?? workspace?.id ?? cached?.selectedWorkspaceId;
      const selected = memberships.find((item) => item.id === selectedId) ?? memberships.find((item) => item.role === 'owner' && item.deletionStatus !== 'scheduled') ?? memberships.find((item) => item.deletionStatus !== 'scheduled') ?? memberships[0] ?? null;
      applyWorkspace(selected);
      setWorkspaceError(selected ? null : message);
      return selected ? { id: selected.id, name: selected.name, accent_color: selected.accent_color } : null;
    };
    const cachedSelection = restoreCached('Connect to the internet once to download your companies for offline use.');
    setOfflineAccessExpired(!navigator.onLine && !!cached?.cachedAt && Date.now() - new Date(cached.cachedAt).getTime() > 30 * 86400000);
    setWorkspaceLoading(false);
    if (!navigator.onLine) return restoreCached('Connect to the internet once to download your companies for offline use.');
    const [{ data, error }, { data: deletionRows }] = await Promise.all([supabase.rpc('list_my_workspaces'), supabase.rpc('list_my_workspace_deletions')]);
    if (requestId !== refreshSequence.current) return cachedSelection;
    if (error) return restoreCached(error.message);
    const memberships = ((data as Array<{ workspace_id: string; workspace_name: string; accent_color: string; member_role: 'owner' | 'member'; book_enabled: boolean; book_permission: AppPermission; payroll_enabled: boolean; payroll_permission: AppPermission; truck_enabled?: boolean; truck_permission?: AppPermission }> | null) ?? []).map((row) => ({
      id: row.workspace_id, name: row.workspace_name, accent_color: row.accent_color, role: row.member_role,
      deletionStatus: 'active' as 'active' | 'scheduled', deletionScheduledFor: null,
      appAccess: { book: { app_id: 'book' as AppId, enabled: row.book_enabled, permission: row.book_permission }, payroll: { app_id: 'payroll' as AppId, enabled: row.payroll_enabled, permission: row.payroll_permission }, truck: { app_id: 'truck' as AppId, enabled: row.truck_enabled ?? true, permission: row.truck_permission ?? (row.member_role === 'owner' ? 'edit' : 'none') } },
    }));
    for (const row of ((deletionRows as Array<{ workspace_id: string; workspace_name: string; accent_color: string; member_role: 'owner' | 'member'; deletion_status: 'scheduled'; deletion_scheduled_for: string | null }> | null) ?? [])) memberships.push({ id: row.workspace_id, name: row.workspace_name, accent_color: row.accent_color, role: row.member_role, deletionStatus: 'scheduled', deletionScheduledFor: row.deletion_scheduled_for, appAccess: defaultAppAccess() });
    const { data: truckAccess } = await supabase.rpc('list_my_truck_access');
    if (requestId !== refreshSequence.current) return cachedSelection;
    const accessByWorkspace = new Map(((truckAccess as Array<{ workspace_id: string; truck_enabled: boolean; truck_permission: AppPermission }> | null) ?? []).map((item) => [item.workspace_id, item]));
    memberships.forEach((membership) => { const access = accessByWorkspace.get(membership.id); const cachedAccess = cached?.memberships.find((item) => item.id === membership.id)?.appAccess.truck; membership.appAccess.truck = { app_id: 'truck', enabled: access?.truck_enabled ?? cachedAccess?.enabled ?? true, permission: access?.truck_permission ?? cachedAccess?.permission ?? (membership.role === 'owner' ? 'edit' : 'none') }; });
    setWorkspaces(memberships);
    const current = memberships.find((item) => item.id === (preferredWorkspaceId ?? workspace?.id ?? cached?.selectedWorkspaceId));
    const preferred = current ?? memberships.find((item) => item.role === 'owner') ?? memberships[0] ?? null;
    applyWorkspace(preferred); setWorkspaceError(null); setWorkspaceLoading(false);
    setOfflineAccessExpired(false);
    await writeWorkspaceCache(session.user.id, memberships, preferred?.id ?? null);
    await offlineStore.writeMetadata(`permissions:${session.user.id}`, { permissionsLastVerifiedAt: new Date().toISOString() });
    if (preferred) { localStorage.setItem(workspaceCacheKey(session.user.id), JSON.stringify(preferred)); await offlineStore.write(`workspace:${session.user.id}`, preferred); }
    const active = memberships.filter((item) => item.deletionStatus !== 'scheduled');
    void (async () => {
      await syncWorkspaceQueues(active.map((item) => item.id));
      await Promise.allSettled(active.map((item) => prefetchWorkspaceData(item.id, session.user.id)));
    })();
    return preferred ? { id: preferred.id, name: preferred.name, accent_color: preferred.accent_color } : cachedSelection;
  };
  const switchWorkspace = (workspaceId: string) => {
    if (guest) { applyGuestCache(selectLocalGuestWorkspace(workspaceId)); return; }
    const next = workspaces.find((item) => item.id === workspaceId);
    if (!next || next.id === workspace?.id) return;
    applyWorkspace(next);
    if (session) {
      localStorage.setItem(workspaceCacheKey(session.user.id), JSON.stringify(next));
      void offlineStore.write(`workspace:${session.user.id}`, next);
      void writeWorkspaceCache(session.user.id, workspaces, next.id);
    }
  };
  const createGuestWorkspace = (name: string) => applyGuestCache(createLocalGuestWorkspace(name));
  const renameGuestWorkspace = (workspaceId: string, name: string, accentColor?: string) => applyGuestCache(renameLocalGuestWorkspace(workspaceId, name, accentColor));
  const deleteGuestWorkspace = async (workspaceId: string) => applyGuestCache(await deleteLocalGuestWorkspace(workspaceId));
  const continueAsGuest = () => {
    enableGuestMode();
    setGuest(true);
    setLoading(false);
    setWorkspaceLoading(false);
    setAdminLoading(false);
    setIsSystemAdmin(false);
    setIsOwner(true);
    const cache = readGuestWorkspaceCache();
    applyGuestCache(cache);
    void migrateLegacyGuestData(cache.memberships[0].id);
  };
  useEffect(() => {
    if (standaloneMode || guest || !isSupabaseConfigured) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); if (next) setLoginError(null); });
    return () => subscription.subscription.unsubscribe();
  }, [guest]);
  useEffect(() => { if (guest) { const cache = readGuestWorkspaceCache(); applyGuestCache(cache); void migrateLegacyGuestData(cache.memberships[0].id); } }, [guest]);
  useEffect(() => { if (!loading && !guest) void refreshWorkspace(); }, [session, loading, guest]);
  useEffect(() => {
    const refreshOfflineCache = () => { if (session && navigator.onLine) void refreshWorkspace(workspace?.id); };
    const refreshVisibleCache = () => { if (document.visibilityState === 'visible') refreshOfflineCache(); };
    window.addEventListener('online', refreshOfflineCache);
    document.addEventListener('visibilitychange', refreshVisibleCache);
    return () => { window.removeEventListener('online', refreshOfflineCache); document.removeEventListener('visibilitychange', refreshVisibleCache); };
  }, [session?.user.id, workspace?.id]);
  useEffect(() => { if (!loading) void refreshAdmin(); }, [session, loading, guest]);
  useEffect(() => {
    if (standaloneMode || guest || !isSupabaseConfigured || !Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
      try {
        const callback = new URL(url);
        const callbackError = callback.searchParams.get('error_description') ?? callback.searchParams.get('error') ?? new URLSearchParams(callback.hash.replace(/^#/, '')).get('error_description');
        if (callbackError) throw new Error(callbackError);
        const code = callback.searchParams.get('code');
        const type = callback.searchParams.get('type') ?? new URLSearchParams(callback.hash.replace(/^#/, '')).get('type');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        const hash = new URLSearchParams(callback.hash.replace(/^#/, ''));
        const accessToken = hash.get('access_token');
        const refreshToken = hash.get('refresh_token');
        if (!code && accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw error;
        }
        if (type === 'recovery') setPasswordRecovery(true);
        await supabase.auth.getSession();
        await Browser.close().catch(() => undefined);
      } catch (reason) {
        setLoginError(reason instanceof Error && reason.message ? `Google sign-in failed: ${reason.message}` : 'Google sign-in could not be completed. Please try again.');
        await Browser.close().catch(() => undefined);
      }
    });
    return () => { void listener.then((handle) => handle.remove()); };
  }, [guest]);
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if ((query.get('type') ?? hash.get('type')) === 'recovery') setPasswordRecovery(true);
    const callbackError = query.get('error_description') ?? hash.get('error_description') ?? query.get('error') ?? hash.get('error');
    if (callbackError) {
      setLoginError(`Google sign-in failed: ${callbackError}`);
      window.history.replaceState({}, '', '/');
    }
  }, []);
  const value = useMemo(() => ({ configured: isSupabaseConfigured && !standaloneMode, loading, workspaceLoading, adminLoading, passwordRecovery, loginError, session, user: session?.user ?? null, workspace, workspaces, workspaceError, isOwner, isSystemAdmin, appAccess, isGuest: guest, continueAsGuest, clearLoginError: () => setLoginError(null), refreshWorkspace, refreshAccess, refreshAdmin, switchWorkspace, createGuestWorkspace, renameGuestWorkspace, deleteGuestWorkspace, canViewApp: (app: AppId) => !offlineAccessExpired && appAccess[app]?.enabled === true && appAccess[app]?.permission !== 'none', canEditApp: (app: AppId) => !offlineAccessExpired && appAccess[app]?.enabled === true && appAccess[app]?.permission === 'edit', finishPasswordRecovery: () => setPasswordRecovery(false), signOut: async () => { const signedInUserId = session?.user.id; if (guest) { disableGuestMode(); setGuest(false); } else if (!standaloneMode) { await supabase.auth.signOut(); if (signedInUserId) { await clearOfflinePrefix(`${signedInUserId}:`); await offlineStore.delete(workspaceListCacheKey(signedInUserId)); await offlineStore.delete(`workspace:${signedInUserId}`); try { localStorage.removeItem(workspaceCacheKey(signedInUserId)); localStorage.removeItem(workspaceListLocalCacheKey(signedInUserId)); } catch { /* storage is unavailable */ } clearOfflineMemory(); } setSession(null); } setLoginError(null); setWorkspace(null); setWorkspaces([]); setWorkspaceError(null); setWorkspaceLoading(false); setAdminLoading(false); setIsSystemAdmin(false); } }), [guest, loading, workspaceLoading, adminLoading, passwordRecovery, loginError, session, workspace, workspaces, workspaceError, isOwner, isSystemAdmin, appAccess, offlineAccessExpired]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used inside AuthProvider'); return value; }
