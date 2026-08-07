import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

function isValidSupabaseUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

const configuredUrl = isValidSupabaseUrl(url) ? url.trim() : null;
const configuredKey = typeof key === 'string' && key.trim().length > 20 ? key.trim() : null;

export const isSupabaseConfigured = Boolean(configuredUrl && configuredKey);
export const supabase = createClient(
  configuredUrl || 'https://placeholder.supabase.co',
  configuredKey || 'placeholder-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true } },
);
