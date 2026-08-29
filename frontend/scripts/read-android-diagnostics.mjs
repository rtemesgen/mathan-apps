import { chromium } from 'playwright';

const endpoint = process.argv[2] || 'http://127.0.0.1:9222';
const browser = await chromium.connectOverCDP(endpoint);

try {
  const pages = browser.contexts().flatMap((context) => context.pages());
  for (const page of pages) {
    const available = await page.evaluate(() => Boolean(window.__mathanOfflineDiagnostics)).catch(() => false);
    if (!available) continue;
    const snapshot = await page.evaluate(() => window.__mathanOfflineDiagnostics.snapshot());
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    process.exitCode = 0;
    break;
  }

  if (process.exitCode === undefined) {
    throw new Error('No debuggable Mathan page exposes offline diagnostics. Open the debug APK and retry.');
  }
} finally {
  await browser.close();
}
