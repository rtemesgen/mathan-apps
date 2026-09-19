import { appendFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { E2E_USERS } from './globalSetup';
import { localSupabaseStatus } from './supabaseLocal';

const status = localSupabaseStatus();
const client = createClient(status.API_URL, status.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error } = await client.auth.signInWithPassword({
  email: E2E_USERS.admin.email,
  password: E2E_USERS.admin.password,
});

if (error) {
  throw new Error(`Android backend authentication failed at ${status.API_URL}: ${error.message}`);
}

const githubEnv = process.env.GITHUB_ENV;
if (githubEnv) {
  appendFileSync(githubEnv, [
    `VITE_SUPABASE_URL=${status.API_URL}`,
    `VITE_SUPABASE_ANON_KEY=${status.ANON_KEY}`,
    `VITE_ANDROID_E2E_EMAIL=${E2E_USERS.admin.email}`,
    `VITE_ANDROID_E2E_PASSWORD=${E2E_USERS.admin.password}`,
    '',
  ].join('\n'));
}

console.log(`Android backend authentication verified at ${status.API_URL}.`);
