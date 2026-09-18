import type { BrowserContext } from 'playwright';

const OFFLINE_KEY = '__mathan_e2e_offline__';

function installOfflineNavigator(key: string) {
  const marker = '__mathanOfflineNavigatorInstalled__';
  if ((globalThis as Record<string, unknown>)[marker]) return;
  const nativeGetter = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine')?.get;
  Object.defineProperty(Navigator.prototype, 'onLine', {
    configurable: true,
    get() {
      return localStorage.getItem(key) !== 'true' && (nativeGetter ? nativeGetter.call(this) : true);
    },
  });
  (globalThis as Record<string, unknown>)[marker] = true;
}

function apiPattern(apiUrl: string) {
  return `${apiUrl.replace(/\/$/, '')}/**`;
}

/** Keep the local Vite server reachable while making the app observe an offline device. */
export async function setE2EOffline(context: BrowserContext, apiUrl: string) {
  const pattern = apiPattern(apiUrl);
  await context.addInitScript(installOfflineNavigator, OFFLINE_KEY);
  await context.unroute(pattern);
  await context.route(pattern, (route) => route.abort('internetdisconnected'));
  await Promise.all(context.pages().map(async (page) => {
    try {
      await page.evaluate(installOfflineNavigator, OFFLINE_KEY);
      await page.evaluate((key) => {
        localStorage.setItem(key, 'true');
        window.dispatchEvent(new Event('offline'));
      }, OFFLINE_KEY);
    } catch {
      // about:blank pages do not have storage; the init script covers navigation.
    }
  }));
}

export async function setE2EOnline(context: BrowserContext, apiUrl: string) {
  await context.unroute(apiPattern(apiUrl));
  await Promise.all(context.pages().map(async (page) => {
    try {
      await page.evaluate((key) => {
        localStorage.removeItem(key);
        window.dispatchEvent(new Event('online'));
      }, OFFLINE_KEY);
    } catch {
      // about:blank pages do not have storage.
    }
  }));
}
