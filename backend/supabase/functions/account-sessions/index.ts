import { createClient } from 'npm:@supabase/supabase-js@2';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
const url = Deno.env.get('SUPABASE_URL') ?? '';
const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Authentication required.' }, 401);
  const client = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return json({ error: 'Invalid or expired session.' }, 401);
  const body = await request.json().catch(() => ({})) as { action?: string };
  if (body.action === 'revoke-others') {
    const response = await fetch(`${url}/auth/v1/logout?scope=others`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${token}` } });
    if (!response.ok) return json({ error: 'Could not sign out other devices.' }, 400);
    return json({ ok: true });
  }
  return json({ sessions: [{ id: 'current', user_id: data.user.id, current: true, user_agent: request.headers.get('user-agent') ?? 'Unknown device', last_seen_at: new Date().toISOString() }] });
});
