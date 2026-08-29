import { defineConfig, devices } from 'playwright/test';
import { backendRoot, localSupabaseStatus } from './tests/e2e/supabaseLocal';

const local = localSupabaseStatus();
export default defineConfig({
  testDir: './tests/e2e', testMatch: /.*\.spec\.ts/, globalSetup: './tests/e2e/globalSetup.ts',
  fullyParallel: false, workers: 1, timeout: 90_000, expect: { timeout: 12_000 }, retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]], outputDir: 'test-results/playwright',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure', acceptDownloads: true },
  webServer: [
    { command: 'npx supabase functions serve', cwd: backendRoot, env: { ...process.env, ADMIN_BOOTSTRAP_EMAILS: 'admin@mathan-e2e.local', SUPABASE_TELEMETRY_DISABLED: 'true' }, url: `${local.API_URL}/functions/v1/system-admin`, reuseExistingServer: true, timeout: 60_000, stdout: 'pipe', stderr: 'pipe' },
    { command: 'npm run dev -- --host 127.0.0.1 --port 4173', cwd: process.cwd(), env: { ...process.env, VITE_SUPABASE_URL: local.API_URL, VITE_SUPABASE_ANON_KEY: local.ANON_KEY, VITE_STANDALONE: 'false', VITE_DEMO_EMAIL: '', VITE_DEMO_PASSWORD: '' }, url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 60_000, stdout: 'pipe', stderr: 'pipe' },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
