import { expect, test } from 'playwright/test';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { signIn } from './helpers';
import { localSupabaseStatus } from './supabaseLocal';

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
    await firstPage.getByRole('button', { name: /TRUCK EQUITY/ }).click();
    await firstPage.getByRole('button', { name: /Dashboard\(Trucks\)/ }).click();
    await firstPage.getByRole('button', { name: 'Manage Fleet' }).click();
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
    const reopenedPage = await persistent.newPage();
    await reopenedPage.goto('/truck');
    await persistent.setOffline(true);
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
