import { supabase } from '../lib/supabase';

export async function getProfilePhone(userId: string) { const { data, error } = await supabase.from('workspace_profiles').select('phone').eq('user_id', userId).maybeSingle(); if (error) throw error; return data?.phone ?? null; }
export async function signInWithPassword(email: string, password: string) { return supabase.auth.signInWithPassword({ email, password }); }
export async function signUp(email: string, password: string, phone: string) { return supabase.auth.signUp({ email, password, options: { data: { phone } } }); }
export async function sendPasswordReset(email: string, redirectTo: string) { return supabase.auth.resetPasswordForEmail(email, { redirectTo }); }
export async function signInWithGoogle(redirectTo: string, skipBrowserRedirect: boolean) { return supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect, queryParams: { prompt: 'select_account' } } }); }
export async function saveUserPhone(userId: string, phone: string) { const [profile, auth] = await Promise.all([supabase.from('workspace_profiles').upsert({ user_id: userId, phone }), supabase.auth.updateUser({ data: { phone } })]); if (profile.error) throw profile.error; if (auth.error) throw auth.error; }
export async function updatePassword(password: string) { const { error } = await supabase.auth.updateUser({ password }); if (error) throw error; }
export async function createWorkspace(name: string) { const { data, error } = await supabase.rpc('create_workspace', { workspace_name: name }); if (error) throw error; return data; }
export async function importGuestWorkspace(workspaceId: string, importId: string, payload: unknown) { const { data, error } = await supabase.rpc('import_guest_workspace', { target_workspace: workspaceId, target_import_id: importId, target_payload: payload }); if (error) throw error; return data; }
