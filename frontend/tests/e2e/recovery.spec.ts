import { expect, test } from 'playwright/test';
import { signIn } from './helpers';
import { localSupabaseStatus } from './supabaseLocal';
import { setE2EOffline } from './network';

test('IndexedDB failure recovery survives reload before a later primary commit', async ({ page, context }) => {
  await signIn(page, 'member');
  await page.getByLabel('Cash Book').click();
  await expect(page.getByText('Cash Book Overview')).toBeVisible();

  const status = localSupabaseStatus();
  await setE2EOffline(context, status.API_URL);
  await page.evaluate(() => {
    const databasePrototype = IDBDatabase.prototype as IDBDatabase & { transaction: IDBDatabase['transaction'] };
    const original = databasePrototype.transaction;
    let failNextWrite = true;
    databasePrototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      const mode = typeof args[1] === 'string' ? args[1] : undefined;
      if (failNextWrite && mode === 'readwrite') {
        failNextWrite = false;
        throw new DOMException('Simulated IndexedDB failure', 'AbortError');
      }
      return original.apply(this, args);
    };
  });

  const bookName = `Recovery journal book ${Date.now()}`;
  await page.getByRole('button', { name: /Create Book|New Book/ }).first().click();
  await page.getByPlaceholder(/Retail Shop Cashbook/).fill(bookName);
  await page.getByRole('button', { name: 'Save Book' }).click();
  await expect(page.getByRole('heading', { name: bookName })).toBeVisible();

  await page.reload();
  await setE2EOffline(context, status.API_URL);
  await expect(page.getByRole('heading', { name: bookName })).toBeVisible();

  await page.getByRole('button', { name: 'Cash In', exact: true }).last().click();
  await page.locator('input[inputmode=decimal]').fill('321');
  await page.getByPlaceholder('e.g. Counter sale, Payment received').fill('Recovery journal cash in');
  await page.getByRole('button', { name: 'Save Entry', exact: true }).click();
  await page.getByRole('heading', { name: bookName }).click();
  await expect(page.getByText('Recovery journal cash in', { exact: true })).toBeVisible();

  const journal = await page.evaluate(() => localStorage.getItem('mathan_erp_offline_atomic_recovery_v2'));
  expect(journal).toBeNull();
  await page.reload();
  await setE2EOffline(context, status.API_URL);
  await expect(page.getByRole('heading', { name: bookName })).toBeVisible();
  await page.getByRole('heading', { name: bookName }).click();
  await expect(page.locator('main')).toContainText('Recovery journal cash in');
});
