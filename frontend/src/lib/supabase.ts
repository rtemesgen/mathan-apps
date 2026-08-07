import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

function cleanEnvValue(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/^("|')|("|')$/g, '') : '';
}

function isValidSupabaseUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

const cleanUrl = cleanEnvValue(url);
const cleanKey = cleanEnvValue(key);
const configuredUrl = isValidSupabaseUrl(cleanUrl) ? cleanUrl : null;
const configuredKey = cleanKey.length > 20 ? cleanKey : null;

export const isSupabaseConfigured = Boolean(configuredUrl && configuredKey);
export const supabase = createClient(
  configuredUrl || 'https://placeholder.supabase.co',
  configuredKey || 'placeholder-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true } },
);
