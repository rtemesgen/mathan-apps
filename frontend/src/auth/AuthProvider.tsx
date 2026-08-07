import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { disableGuestMode, enableGuestMode, isGuestMode } from './guestMode';

export interface Workspace { id: string; name: string; }
interface AuthState { configured: boolean; loading: boolean; session: Session | null; user: User | null; workspace: Workspace | null; workspaceError: string | null; isGuest: boolean; continueAsGuest: () => void; refreshWorkspace: () => Promise<Workspace | null>; signOut: () => Promise<void>; }
const AuthContext = createContext<AuthState | null>(null);
export const standaloneMode = import.meta.env.VITE_STANDALONE === 'true';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState(() => isGuestMode());
  const refreshWorkspace = async () => {
    if (!session) { setWorkspace(null); setWorkspaceError(null); return null; }
    const { data, error } = await supabase.from('workspace_members').select('workspaces(id,name)').eq('user_id', session.user.id).limit(1).maybeSingle();
    if (error) { setWorkspace(null); setWorkspaceError(error.message); return null; }
    const row = data as unknown as { workspaces: Workspace | Workspace[] | null } | null;
    const nextWorkspace = Array.isArray(row?.workspaces) ? row?.workspaces[0] ?? null : row?.workspaces ?? null;
    setWorkspace(nextWorkspace); setWorkspaceError(null); return nextWorkspace;
  };
  useEffect(() => {
    if (standaloneMode || guest || !isSupabaseConfigured) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.subscription.unsubscribe();
  }, [guest]);
  useEffect(() => { if (!loading) void refreshWorkspace(); }, [session, loading]);
  const value = useMemo(() => ({ configured: isSupabaseConfigured && !standaloneMode, loading, session, user: session?.user ?? null, workspace, workspaceError, isGuest: guest, continueAsGuest: () => { enableGuestMode(); setGuest(true); setLoading(false); }, refreshWorkspace, signOut: async () => { if (guest) { disableGuestMode(); setGuest(false); } else if (!standaloneMode) { await supabase.auth.signOut(); setSession(null); } setWorkspace(null); setWorkspaceError(null); } }), [guest, loading, session, workspace, workspaceError]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used inside AuthProvider'); return value; }
