import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export interface Workspace { id: string; name: string; }
interface AuthState { configured: boolean; loading: boolean; session: Session | null; user: User | null; workspace: Workspace | null; workspaceError: string | null; refreshWorkspace: () => Promise<Workspace | null>; signOut: () => Promise<void>; }
const AuthContext = createContext<AuthState | null>(null);
export const standaloneMode = import.meta.env.VITE_STANDALONE === 'true';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshWorkspace = async () => {
    if (!session) { setWorkspace(null); setWorkspaceError(null); return null; }
    const { data, error } = await supabase.from('workspace_members').select('workspaces(id,name)').eq('user_id', session.user.id).limit(1).maybeSingle();
    if (error) { setWorkspace(null); setWorkspaceError(error.message); return null; }
    const row = data as unknown as { workspaces: Workspace | Workspace[] | null } | null;
    const nextWorkspace = Array.isArray(row?.workspaces) ? row?.workspaces[0] ?? null : row?.workspaces ?? null;
    setWorkspace(nextWorkspace); setWorkspaceError(null); return nextWorkspace;
  };
  useEffect(() => {
    if (standaloneMode || !isSupabaseConfigured) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (!loading) void refreshWorkspace(); }, [session, loading]);
  const value = useMemo(() => ({ configured: isSupabaseConfigured && !standaloneMode, loading, session, user: session?.user ?? null, workspace, workspaceError, refreshWorkspace, signOut: async () => { if (!standaloneMode) await supabase.auth.signOut(); setWorkspace(null); setWorkspaceError(null); } }), [loading, session, workspace, workspaceError]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used inside AuthProvider'); return value; }
