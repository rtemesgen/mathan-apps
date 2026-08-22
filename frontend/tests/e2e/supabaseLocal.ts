import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type LocalSupabaseStatus = { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };
export const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const backendRoot = path.resolve(frontendRoot, '../backend');

export function localSupabaseStatus(): LocalSupabaseStatus {
  try {
    const output = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
      cwd: backendRoot, encoding: 'utf8', env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: 'true' },
    });
    const jsonStart = output.indexOf('{');
    if (jsonStart < 0) throw new Error('Supabase did not return local service details.');
    return JSON.parse(output.slice(jsonStart)) as LocalSupabaseStatus;
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    throw new Error(`The local Supabase stack is required for E2E tests. Run "npx supabase start" in backend first. ${message}`);
  }
}
