import { expect, test } from 'playwright/test';
import { signIn } from './helpers';
import { setE2EOffline, setE2EOnline } from './network';
import { localSupabaseStatus } from './supabaseLocal';
import { createClient } from '@supabase/supabase-js';

async function readCashBookPersistence(page: import('playwright/test').Page, bookName: string) {
  return page.evaluate(async (expectedName) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('mathan-erp-offline');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const entries = await new Promise<Array<{ key: string; value: unknown }>>((resolve, reject) => {
      const transaction = database.transaction('records', 'readonly');
      const store = transaction.objectStore('records');
      const keys = store.getAllKeys();
      const values = store.getAll();
      transaction.oncomplete = () => resolve(keys.result.map((key, index) => ({ key: String(key), value: values.result[index] })));
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
    const state = entries
      .filter((entry) => entry.key.endsWith(':cash_book:state'))
      .map((entry) => entry.value as { books?: Array<{ name?: string }>; transactions?: Array<{ bookId?: string }> })
      .find((value) => value.books?.some((book) => book.name === expectedName));
    const queue = entries.find((entry) => entry.key === 'sync-queue-v1')?.value;
    return {
      localBookCount: state?.books?.filter((book) => book.name === expectedName).length ?? 0,
      queuedOccurrences: (Array.isArray(queue) ? queue : []).filter((mutation) => JSON.stringify(mutation).includes(expectedName)).length,
    };
  }, bookName);
}

test('offline unattempted Cash Book create then delete leaves no durable or remote record', async ({ page, context }) => {
  const status = localSupabaseStatus();
  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const bookName = `Create-delete regression ${Date.now()}`;

  await signIn(page, 'member');
  await page.getByLabel('Cash Book').click();
  await expect(page.getByText('Cash Book Overview')).toBeVisible();
  await setE2EOffline(context, status.API_URL);

  await page.getByRole('button', { name: /Create Book|New Book/ }).first().click();
  await page.getByPlaceholder(/Retail Shop Cashbook/).fill(bookName);
  await page.getByRole('button', { name: 'Save Book' }).click();
  await expect(page.getByRole('heading', { name: bookName })).toBeVisible();
  await page.getByRole('button', { name: 'Dashboard' }).click();

  const card = page.locator('div.group').filter({ hasText: bookName }).first();
  await card.getByRole('button', { name: `Actions for ${bookName}` }).click();
  await page.getByRole('button', { name: 'Delete book' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText(bookName, { exact: true })).toHaveCount(0);
  await expect.poll(() => readCashBookPersistence(page, bookName)).toEqual({ localBookCount: 0, queuedOccurrences: 0 });

  await setE2EOnline(context, status.API_URL);
  await page.reload();
  await expect(page.getByText(bookName, { exact: true })).toHaveCount(0);
  const { data: workspace } = await service.from('workspaces').select('id').eq('name', 'Member Company').single();
  expect(workspace).toBeTruthy();
  await expect.poll(async () => {
    const { data } = await service.from('app_state_snapshots').select('payload').eq('workspace_id', workspace!.id).eq('domain', 'cash_book:state').maybeSingle();
    const payload = data?.payload as { books?: Array<{ name?: string }> } | undefined;
    return payload?.books?.filter((book) => book.name === bookName).length ?? 0;
  }).toBe(0);
});

test('local storage failure keeps Cash Book save open and never reports success', async ({ page, context }) => {
  const status = localSupabaseStatus();
  await signIn(page, 'member');
  await page.getByLabel('Cash Book').click();
  await expect(page.getByText('Cash Book Overview')).toBeVisible();
  await setE2EOffline(context, status.API_URL);

  await page.evaluate(() => {
    const databasePrototype = IDBDatabase.prototype as IDBDatabase & { transaction: IDBDatabase['transaction'] };
    const originalTransaction = databasePrototype.transaction;
    databasePrototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      const mode = typeof args[1] === 'string' ? args[1] : undefined;
      if (mode === 'readwrite') throw new DOMException('Simulated durable-store failure', 'QuotaExceededError');
      return originalTransaction.apply(this, args);
    };
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith('mathan_erp_offline_') || key.includes('atomic_recovery')) throw new DOMException('Simulated fallback failure', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    };
  });

  const bookName = `Storage failure regression ${Date.now()}`;
  await page.getByRole('button', { name: /Create Book|New Book/ }).first().click();
  await page.getByPlaceholder(/Retail Shop Cashbook/).fill(bookName);
  await page.getByRole('button', { name: 'Save Book' }).click();
  await expect(page.getByRole('alert')).toContainText(/Could not save the Cash Book|not saved|storage/i);
  await expect(page.getByRole('heading', { name: 'Create New Book' })).toBeVisible();
  await expect(page.getByText(bookName, { exact: true })).toHaveCount(0);
});
