import { expect, test } from 'playwright/test';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { signIn } from './helpers';
import { localSupabaseStatus } from './supabaseLocal';

async function inspectTruckOfflineContract(page: import('playwright/test').Page, memo: string) {
  return page.evaluate(async (expectedMemo) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('mathan-erp-offline'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const entries = await new Promise<Array<{ key: string; value: unknown }>>((resolve, reject) => { const transaction = database.transaction('records', 'readonly'); const store = transaction.objectStore('records'); const keys = store.getAllKeys(); const values = store.getAll(); transaction.oncomplete = () => resolve(keys.result.map((key, index) => ({ key: String(key), value: values.result[index] }))); transaction.onerror = () => reject(transaction.error); });
    database.close();
    const cachedTransactions = entries.filter((entry) => entry.key.startsWith('truck:')).flatMap((entry) => (entry.value as { transactions?: Array<{ description?: string }> } | null)?.transactions ?? []);
    const queue = entries.find((entry) => entry.key === 'sync-queue-v1')?.value;
    return {
      effectiveCount: cachedTransactions.filter((transaction) => transaction.description === expectedMemo).length,
      outboxCount: (Array.isArray(queue) ? queue : []).filter((mutation) => JSON.stringify(mutation).includes(expectedMemo)).length,
    };
  }, memo);
}

test('Truck app is available through the workspace launcher and preserves data across app switches and offline reloads', async ({ page, context }) => {
  await signIn(page, 'admin');
  const launcher = page.getByLabel('Truck Equity');
  if (await launcher.count() === 0) test.skip(true, 'Truck access is not granted to this fixture workspace.');
  await launcher.click();
  await expect(page).toHaveURL(/\/truck$/);
  await expect(page.getByText('DASHBOARD')).toBeVisible();
  await page.getByRole('button', { name: /TRUCK EQUITY/ }).click();
  await page.getByRole('button', { name: /Dashboard\(Trucks\)/ }).click();
  await page.getByRole('button', { name: 'Manage Fleet' }).click();
  await page.getByRole('button', { name: '+ Add Truck' }).click();
  await page.getByPlaceholder('e.g. Big Red').fill('E2E Truck');
  await page.getByPlaceholder('e.g. Unit 101').fill('E2E-101');
  await page.getByPlaceholder('e.g. 2024 Kenworth T680').fill('Test vehicle');
  await page.getByRole('button', { name: 'Save Truck' }).click();
  const truckCard = page.locator('main').getByText('E2E Truck', { exact: true }).first();
  await expect(truckCard).toBeVisible();
  await page.goto('/book');
  await expect(page).toHaveURL(/\/book$/);
  await page.goto('/truck');
  await expect(page.locator('main').getByText('E2E Truck', { exact: true }).first()).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('main').getByText('E2E Truck', { exact: true }).first()).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('button', { name: /TRUCK EQUITY/ }).click();
  await page.getByRole('button', { name: 'Customers', exact: true }).click();
  await page.getByRole('button', { name: 'Add Customer', exact: true }).first().click();
  await page.getByPlaceholder('e.g. ABC Transport').fill('E2E Customer');
  await page.getByRole('button', { name: 'Save Customer', exact: true }).click();
  await expect(page.getByText('E2E Customer', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /TRUCK EQUITY/ }).click();
  await page.getByRole('button', { name: 'Income (Trips)' }).click();
  await page.getByRole('button', { name: 'Cash received now', exact: true }).click();
  await expect(page.getByRole('option', { name: 'E2E Customer', exact: true })).toBeVisible();
  await page.getByRole('option', { name: 'E2E Customer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'E2E Customer', exact: true })).toBeVisible();
  await page.locator('input[type=number]').first().fill('1000');
  await page.getByRole('button', { name: 'Save Income' }).click();
  await expect(page.getByRole('status')).toContainText(/Saved|Customer receivable saved successfully/);

  await page.getByRole('button', { name: /TRUCK EQUITY/ }).click();
  await page.getByRole('button', { name: 'Expenses & Payouts' }).click();
  await page.getByRole('button', { name: 'Cash paid now', exact: true }).click();
  await expect(page.getByRole('option', { name: 'E2E Customer', exact: true })).toBeVisible();
  await page.getByRole('option', { name: 'E2E Customer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'E2E Customer', exact: true })).toBeVisible();
  await page.locator('input[type=number]').first().fill('400');
  await page.getByPlaceholder('Select or type category...').fill('Customer refund');
  await page.getByRole('button', { name: 'Save Expense' }).click();
  await expect(page.getByRole('status')).toContainText(/Saved|Customer payable saved successfully/);

  await page.getByRole('button', { name: /TRUCK EQUITY/ }).click();
  await page.getByRole('button', { name: 'Customers', exact: true }).click();
  await expect(page.getByText('E2E Customer', { exact: true })).toBeVisible();
  await expect(page.getByText('$600.00', { exact: true })).toBeVisible();
  await expect(page.getByText('RECEIVABLE', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /TRUCK EQUITY/ }).click();
  await page.getByRole('button', { name: 'Income (Trips)' }).click();
  await page.locator('input[type=number]').first().fill('1000');
  await page.getByRole('button', { name: 'Save Income' }).click();
  await expect(page.getByText(/Income saved|E2E Truck/).first()).toBeVisible();
  await page.getByRole('button', { name: /TRUCK EQUITY/ }).click();
  await page.getByRole('button', { name: /Partners & Loans/ }).click();
  await expect(page.getByText(/Partners & Loans/).first()).toBeVisible();
  await expect(page.getByText('Reset Demo Data')).toHaveCount(0);
});

test('Truck transactions survive closing and reopening the browser process offline', async ({}, testInfo) => {
  const profile = testInfo.outputPath('persistent-truck-profile');
  const baseURL = testInfo.project.use.baseURL as string;
  let persistent = await chromium.launchPersistentContext(profile, { baseURL, headless: true });
  try {
    const firstPage = await persistent.newPage();
    await signIn(firstPage, 'admin');
    const launcher = firstPage.getByLabel('Truck Equity');
    if (await launcher.count() === 0) test.skip(true, 'Truck access is not granted to this fixture workspace.');
    await launcher.click();
    const manageFleet = firstPage.getByRole('button', { name: 'Manage Fleet' });
    await expect(manageFleet).toBeVisible();
    await manageFleet.click();
    await firstPage.getByRole('button', { name: '+ Add Truck' }).click();
    const truckName = `Persistent truck ${Date.now()}`;
    await firstPage.getByPlaceholder('e.g. Big Red').fill(truckName);
    await firstPage.getByPlaceholder('e.g. Unit 101').fill(`P-${Date.now()}`);
    await firstPage.getByPlaceholder('e.g. 2024 Kenworth T680').fill('Persistence test vehicle');
    await firstPage.getByRole('button', { name: 'Save Truck' }).click();
    await expect(firstPage.locator('main').getByText(truckName, { exact: true }).first()).toBeVisible();
    await firstPage.getByRole('button', { name: /TRUCK EQUITY/ }).click();
    await firstPage.getByRole('button', { name: 'Income (Trips)' }).click();

    await persistent.setOffline(true);
    const description = `Offline persistent income ${Date.now()}`;
    await firstPage.locator('input[type=number]').first().fill('555');
    await firstPage.getByPlaceholder('e.g. Trip from Dallas TX to Atlanta GA').fill(description);
    await firstPage.getByRole('button', { name: 'Save Income' }).click();
    await firstPage.getByRole('button', { name: /TRUCK EQUITY/ }).click();
    await firstPage.getByRole('button', { name: 'Cash Report (Flow)', exact: true }).click();
    await expect(firstPage.getByText(description, { exact: true })).toBeVisible();

    await persistent.close();
    persistent = await chromium.launchPersistentContext(profile, { baseURL, headless: true });
    await persistent.setOffline(true);
    const reopenedPage = await persistent.newPage();
    await reopenedPage.goto('/truck');
    await reopenedPage.reload();
    await expect(reopenedPage.getByText('Loading Truck data…')).toBeHidden();
    await reopenedPage.getByRole('button', { name: /TRUCK EQUITY/ }).click();
    await reopenedPage.getByRole('button', { name: 'Cash Report (Flow)', exact: true }).click();
    await expect(reopenedPage.getByText(description, { exact: true })).toBeVisible();
    await persistent.setOffline(false);
    await reopenedPage.reload();
    const status = localSupabaseStatus();
    const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    await expect.poll(async () => {
      const { data: workspace } = await service.from('workspaces').select('id').eq('name', 'Admin Company').single();
      if (!workspace) return 0;
      const { count } = await service.from('truck_transactions').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace.id).eq('description', description);
      return count ?? 0;
    }, { timeout: 20_000 }).toBe(1);
  } finally {
    await persistent.close();
  }
});

test('customer projections and Pay Owner remain identical after restart and sync exactly once', async ({}, testInfo) => {
  const profile = testInfo.outputPath('persistent-truck-projections-profile');
  const baseURL = testInfo.project.use.baseURL as string;
  const status = localSupabaseStatus();
  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: workspace } = await service.from('workspaces').select('id').eq('name', 'Admin Company').single();
  expect(workspace).toBeTruthy();
  const truckId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const customerId = crypto.randomUUID();
  const truckName = `Projection truck ${Date.now()}`;
  const unitNumber = `PX-${Date.now()}`;
  const ownerName = `Projection owner ${Date.now()}`;
  const customerName = `Wow ${Date.now()}`;
  const ownerPaymentMemo = `Offline owner payment ${Date.now()}`;
  await service.from('trucks').insert({ id: truckId, workspace_id: workspace!.id, name: truckName, unit_number: unitNumber, make_model: 'Projection test', vin: '', cash_on_hand: 2000, license_plate: unitNumber });
  await service.from('truck_owners').insert({ id: ownerId, workspace_id: workspace!.id, truck_id: truckId, name: ownerName, start_date: '2026-01-01', equity_percentage: 0, monthly_draw_rate: 0, avatar_color: 'bg-slate-800 text-white' });
  await service.from('truck_customers').insert({ id: customerId, workspace_id: workspace!.id, truck_id: truckId, name: customerName });
  await service.from('truck_transactions').insert([
    { id: crypto.randomUUID(), workspace_id: workspace!.id, truck_id: truckId, owner_id: ownerId, occurred_on: '2026-08-01', transaction_type: 'CAPITAL_INJECTION', category: 'Owner Loan', amount: 1000, description: 'Projection owner loan' },
    // This is the exact legacy shape behind the screenshot: customer-linked
    // Trip Pay stored as INCOME before explicit RECEIVABLE rows existed.
    { id: crypto.randomUUID(), workspace_id: workspace!.id, truck_id: truckId, customer_id: customerId, occurred_on: '2026-08-02', transaction_type: 'INCOME', category: 'Trip Pay', amount: 6500, description: 'Legacy customer trip', counterparty_type: 'CUSTOMER', counterparty_name: customerName },
  ]);

  let persistent = await chromium.launchPersistentContext(profile, { baseURL, headless: true });
  try {
    const firstPage = await persistent.newPage();
    await signIn(firstPage, 'admin');
    await firstPage.getByLabel('Truck Equity').click();
    await expect(firstPage.getByText('Loading Truck data…')).toBeHidden({ timeout: 20_000 });
    await firstPage.locator('header button[aria-haspopup=listbox]').click();
    await firstPage.getByRole('option', { name: `${truckName} (${unitNumber})`, exact: true }).dispatchEvent('click');
    await expect(firstPage.locator('header button[aria-haspopup=listbox]')).toContainText(truckName);

    await firstPage.getByRole('button', { name: /TRUCK EQUITY/ }).click();
    await firstPage.getByRole('button', { name: 'Customers', exact: true }).click();
    const customerCard = firstPage.getByText(customerName, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
    await expect(customerCard).toContainText('RECEIVABLE');
    await expect(customerCard).toContainText('$6,500.00');
    await customerCard.getByRole('button', { name: /History/ }).click();
    await expect(customerCard).toContainText('Trip Pay');
    await expect(customerCard).toContainText('$6,500.00');

    await firstPage.getByRole('button', { name: /TRUCK EQUITY/ }).click();
    await firstPage.getByRole('button', { name: /Partners & Loans/ }).click();
    const ownerCard = firstPage.getByText(ownerName, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
    await expect(ownerCard).toContainText('$1,000.00');

    await persistent.setOffline(true);
    await ownerCard.getByRole('button', { name: 'Pay', exact: true }).click();
    await firstPage.locator('input[placeholder="0.00"]').fill('250');
    await firstPage.getByPlaceholder('e.g. Loan repayment check or Zelle transfer').fill(ownerPaymentMemo);
    await firstPage.getByRole('button', { name: 'Pay Owner', exact: true }).click();
    await expect(firstPage.getByText(/Saved offline|Owner payment saved successfully/).first()).toBeVisible();
    await expect.poll(() => inspectTruckOfflineContract(firstPage, ownerPaymentMemo)).toEqual({ effectiveCount: 1, outboxCount: 1 });

    await firstPage.getByRole('button', { name: /TRUCK EQUITY/ }).click();
    await firstPage.getByRole('button', { name: /Partners & Loans/ }).click();
    const updatedOwnerCard = firstPage.getByText(ownerName, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
    await expect(updatedOwnerCard).toContainText('$750.00');
    await expect(updatedOwnerCard).toContainText('Repaid: $250');
    await firstPage.getByRole('button', { name: /TRUCK EQUITY/ }).click();
    await firstPage.getByRole('button', { name: 'Activity History', exact: true }).click();
    await expect(firstPage.getByText(ownerPaymentMemo, { exact: true })).toBeVisible();

    await persistent.close();
    persistent = await chromium.launchPersistentContext(profile, { baseURL, headless: true });
    await persistent.setOffline(true);
    const reopenedPage = await persistent.newPage();
    await reopenedPage.goto('/truck');
    await reopenedPage.reload();
    await expect(reopenedPage.getByText('Loading Truck data…')).toBeHidden({ timeout: 20_000 });
    await reopenedPage.locator('header button[aria-haspopup=listbox]').click();
    await reopenedPage.getByRole('option', { name: `${truckName} (${unitNumber})`, exact: true }).dispatchEvent('click');
    await expect(reopenedPage.locator('header button[aria-haspopup=listbox]')).toContainText(truckName);
    await expect.poll(() => inspectTruckOfflineContract(reopenedPage, ownerPaymentMemo)).toEqual({ effectiveCount: 1, outboxCount: 1 });
    await reopenedPage.getByRole('button', { name: /TRUCK EQUITY/ }).click();
    await reopenedPage.getByRole('button', { name: 'Customers', exact: true }).click();
    const restartedCustomerCard = reopenedPage.getByText(customerName, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
    await expect(restartedCustomerCard).toContainText('RECEIVABLE');
    await expect(restartedCustomerCard).toContainText('$6,500.00');
    await reopenedPage.getByRole('button', { name: /TRUCK EQUITY/ }).click();
    await reopenedPage.getByRole('button', { name: /Partners & Loans/ }).click();
    const restartedOwnerCard = reopenedPage.getByText(ownerName, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
    await expect(restartedOwnerCard).toContainText('$750.00');
    await expect(restartedOwnerCard).toContainText('Repaid: $250');
    await reopenedPage.getByRole('button', { name: /TRUCK EQUITY/ }).click();
    await reopenedPage.getByRole('button', { name: 'Activity History', exact: true }).click();
    await expect(reopenedPage.getByText(ownerPaymentMemo, { exact: true })).toBeVisible();

    await persistent.setOffline(false);
    await reopenedPage.reload();
    await expect.poll(async () => {
      const { data } = await service.from('truck_transactions').select('id').eq('workspace_id', workspace!.id).eq('truck_id', truckId).eq('description', ownerPaymentMemo);
      return data?.length ?? 0;
    }, { timeout: 20_000 }).toBe(1);
    await expect.poll(() => inspectTruckOfflineContract(reopenedPage, ownerPaymentMemo), { timeout: 20_000 }).toEqual({ effectiveCount: 1, outboxCount: 0 });
  } finally {
    await persistent.close();
    await service.from('truck_transactions').delete().eq('truck_id', truckId);
    await service.from('truck_customers').delete().eq('truck_id', truckId);
    await service.from('truck_owners').delete().eq('truck_id', truckId);
    await service.from('trucks').delete().eq('id', truckId);
  }
});
