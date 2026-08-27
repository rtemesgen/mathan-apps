import { expect, test } from 'playwright/test';
import { chromium } from 'playwright';
import type { Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { signIn } from './helpers';
import { E2E_USERS } from './globalSetup';
import { localSupabaseStatus } from './supabaseLocal';

const e2eService = () => {
  const status = localSupabaseStatus();
  return createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
};

async function inspectIndexedDbCashContract(page: Page, remarks: string[]) {
  return page.evaluate(async (expectedRemarks) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('mathan-erp-offline', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const entries = await new Promise<Array<{ key: string; value: unknown }>>((resolve, reject) => {
      const transaction = database.transaction('records', 'readonly');
      const store = transaction.objectStore('records');
      const keysRequest = store.getAllKeys();
      const valuesRequest = store.getAll();
      transaction.oncomplete = () => resolve(keysRequest.result.map((key, index) => ({ key: String(key), value: valuesRequest.result[index] })));
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
    const transactionRecords = entries
      .filter((entry) => entry.key.endsWith(':cash_book:transactions') && Array.isArray(entry.value))
      .flatMap((entry) => entry.value as Array<{ remark?: string }>);
    const queue = entries.find((entry) => entry.key === 'sync-queue-v1')?.value;
    const queuedMutations = Array.isArray(queue) ? queue : [];
    return {
      paymentCounts: Object.fromEntries(expectedRemarks.map((remark) => [remark, transactionRecords.filter((record) => record.remark === remark).length])),
      matchingOutboxCount: queuedMutations.filter((mutation) => expectedRemarks.every((remark) => JSON.stringify(mutation).includes(remark))).length,
    };
  }, remarks);
}

test('ordinary users cannot discover or open system administration', async ({ page }) => {
  await signIn(page, 'member');
  await expect(page.getByLabel('Cash Book')).toBeVisible();
  await expect(page.getByLabel('Payroll')).toBeVisible();
  await expect(page.getByLabel('Admin')).toHaveCount(0);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel('Admin')).toHaveCount(0);
  const privilegedAttempt = await page.evaluate(async () => {
    const authKey = Object.keys(localStorage).find((key) => key.startsWith('sb-') && key.endsWith('-auth-token'));
    const session = authKey ? JSON.parse(localStorage.getItem(authKey) ?? '{}') as { access_token?: string } : {};
    const response = await fetch('http://127.0.0.1:54321/functions/v1/system-admin', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'overview' }),
    });
    return { status: response.status, body: await response.json() as { error?: string } };
  });
  expect(privilegedAttempt.status).toBe(403);
  expect(privilegedAttempt.body.error).toContain('System administrator access required');
});

test('existing Cash Book, Payroll, and Settings flows still load and save', async ({ page }) => {
  await signIn(page, 'member');
  await page.getByLabel('Cash Book').click();
  await expect(page.getByText('Cash Book Overview')).toBeVisible();
  await page.getByRole('button', { name: /Create Book|New Book/ }).first().click();
  await page.getByPlaceholder(/Retail Shop Cashbook/).fill('Playwright Regression Book');
  await page.getByRole('button', { name: 'Save Book' }).click();
  await expect(page.getByRole('heading', { name: 'Playwright Regression Book' })).toBeVisible();
  await page.goto('/');
  await page.getByLabel('Payroll').click();
  await expect(page.getByText('Payroll Tracker').first()).toBeVisible();
  await expect(page.getByText('Total Owed')).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Your profile', exact: true })).toBeVisible();
  await expect(page.getByText('Password', { exact: true }).first()).toBeVisible();
});

test('app data settings expose sync progress and the popup preference', async ({ page }) => {
  await signIn(page, 'member');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'App data', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sync and notifications', exact: true })).toBeVisible();
  await expect(page.getByText('Pending', { exact: true })).toBeVisible();
  await expect(page.getByText('Errors', { exact: true })).toBeVisible();
  const retry = page.getByRole('button', { name: 'Retry pending sync' });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(retry).toBeEnabled();

  const popups = page.getByLabel('Show sync popups');
  await expect(popups).toBeChecked();
  await popups.uncheck();
  await expect(popups).not.toBeChecked();
  await popups.check();
  await expect(popups).toBeChecked();
});

test('Cash Book and Payroll snapshot saves appear in company activity', async ({ page }) => {
  await signIn(page, 'admin');
  await page.getByLabel('Cash Book').click();
  await expect(page.getByText('Cash Book Overview')).toBeVisible();
  await page.getByRole('button', { name: /Create Book|New Book/ }).first().click();
  await page.getByPlaceholder(/Retail Shop Cashbook/).fill('Audit Regression Book');
  await page.getByRole('button', { name: 'Save Book' }).click();
  await expect(page.getByRole('heading', { name: 'Audit Regression Book' })).toBeVisible();

  await page.goto('/payroll');
  await expect(page.getByText('Payroll Tracker').first()).toBeVisible();
  await page.getByRole('button', { name: 'Add Employee', exact: true }).first().click();
  await page.getByPlaceholder('e.g. Sarah Jenkins').fill('Audit Regression Employee');
  await page.getByPlaceholder('Enter amount').fill('5000');
  await page.getByRole('button', { name: 'Save Employee' }).click();
  await expect(page.getByText('Employee Successfully Registered!', { exact: true })).toBeVisible();

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  await expect(page.getByText('Company activity')).toBeVisible();
  const auditCount = async (recordType: string) => {
    await page.reload();
    await page.getByRole('button', { name: 'Activity', exact: true }).click();
    return page.getByText(new RegExp(recordType)).count();
  };
  await expect.poll(() => auditCount('Cash Book'), { timeout: 20_000 }).toBeGreaterThan(0);
  await expect.poll(() => auditCount('Payroll'), { timeout: 20_000 }).toBeGreaterThan(0);
});

test('Cash Book records survive switching apps and an offline reload', async ({ page, context }) => {
  await signIn(page, 'member');
  await page.getByLabel('Cash Book').click();
  await expect(page.getByText('Cash Book Overview')).toBeVisible();
  await page.getByRole('button', { name: /Create Book|New Book/ }).first().click();
  await page.getByPlaceholder(/Retail Shop Cashbook/).fill('Persistence Regression Book');
  await page.getByRole('button', { name: 'Save Book' }).click();
  await expect(page.getByRole('heading', { name: 'Persistence Regression Book' })).toBeVisible();

  await page.goto('/payroll');
  await expect(page.getByText('Payroll Tracker').first()).toBeVisible();
  await page.goto('/book');
  await expect(page.getByRole('heading', { name: 'Persistence Regression Book' })).toBeVisible();

  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Persistence Regression Book' })).toBeVisible();
  await context.setOffline(false);
});

test('Payroll employees survive switching apps and an offline reload', async ({ page, context }) => {
  await signIn(page, 'member');
  await page.getByLabel('Payroll').click();
  await expect(page.getByText('Payroll Tracker').first()).toBeVisible();
  await page.getByRole('button', { name: 'Add Employee', exact: true }).first().click();
  await page.getByPlaceholder('e.g. Sarah Jenkins').fill('Payroll Persistence Employee');
  await page.getByPlaceholder('Enter amount').fill('5000');
  await page.getByRole('button', { name: 'Save Employee' }).click();
  await expect(page.getByText('Employee Successfully Registered!', { exact: true })).toBeVisible();
  await page.goto('/book');
  await expect(page.getByText('Cash Book Overview')).toBeVisible();
  await page.goto('/payroll');
  await page.getByRole('button', { name: 'Manage Employees', exact: true }).first().click();
  await expect(page.getByText('Payroll Persistence Employee', { exact: true })).toBeVisible();

  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Manage Employees', exact: true }).first().click();
  await expect(page.getByText('Payroll Persistence Employee', { exact: true })).toBeVisible();
  await context.setOffline(false);
});

test('durable web state survives closing and reopening the browser process offline', async ({}, testInfo) => {
  const profile = testInfo.outputPath('persistent-browser-profile');
  const baseURL = testInfo.project.use.baseURL as string;
  let persistent = await chromium.launchPersistentContext(profile, { baseURL, headless: true });
  try {
    const firstPage = await persistent.newPage();
    await signIn(firstPage, 'member');
    await firstPage.getByLabel('Cash Book').click();
    await expect(firstPage.getByText('Cash Book Overview')).toBeVisible();
    await persistent.setOffline(true);
    const bookName = `Persistent browser book ${Date.now()}`;
    await firstPage.getByRole('button', { name: /Create Book|New Book/ }).first().click();
    await firstPage.getByPlaceholder(/Retail Shop Cashbook/).fill(bookName);
    await firstPage.getByRole('button', { name: 'Save Book' }).click();
    await expect(firstPage.getByRole('heading', { name: bookName })).toBeVisible();

    await firstPage.getByRole('button', { name: 'Cash In', exact: true }).last().click();
    await firstPage.locator('input[type=number]').fill('555');
    await firstPage.getByPlaceholder('e.g. Counter sale, Payment received').fill('Offline Cash In');
    await firstPage.getByRole('button', { name: 'Save Entry', exact: true }).click();
    await expect(firstPage.getByText('Offline Cash In', { exact: true })).toBeVisible();
    await firstPage.getByRole('button', { name: 'Cash Out', exact: true }).last().click();
    await firstPage.locator('input[type=number]').fill('100');
    await firstPage.getByPlaceholder('e.g. Rent, Restock, Vendor payout').fill('Offline Cash Out');
    await firstPage.getByRole('button', { name: 'Save Entry', exact: true }).click();
    await expect(firstPage.getByText('Offline Cash Out', { exact: true })).toBeVisible();

    // Adapter contract, stages 1-2: the same offline operation must reach the
    // effective business cache and durable outbox before any restart occurs.
    const beforeRestart = await inspectIndexedDbCashContract(firstPage, ['Offline Cash In', 'Offline Cash Out']);
    expect(beforeRestart.paymentCounts).toEqual({ 'Offline Cash In': 1, 'Offline Cash Out': 1 });
    expect(beforeRestart.matchingOutboxCount).toBe(1);

    await persistent.close();
    persistent = await chromium.launchPersistentContext(profile, { baseURL, headless: true });
    const reopenedPage = await persistent.newPage();
    await reopenedPage.goto('/book');
    await persistent.setOffline(true);
    await reopenedPage.reload();
    await expect(reopenedPage.getByRole('heading', { name: bookName })).toBeVisible();
    await reopenedPage.getByRole('heading', { name: bookName }).click();
    await expect(reopenedPage.locator('main')).toContainText('Offline Cash In');
    await expect(reopenedPage.locator('main')).toContainText('Offline Cash Out');
    // Adapter contract, stages 3-4: a new browser process reads the same
    // business data and outbox directly from IndexedDB while offline.
    const afterRestart = await inspectIndexedDbCashContract(reopenedPage, ['Offline Cash In', 'Offline Cash Out']);
    expect(afterRestart).toEqual(beforeRestart);
    await persistent.setOffline(false);
    await reopenedPage.reload();
    const service = e2eService();
    await expect.poll(async () => {
      const { data: workspace } = await service.from('workspaces').select('id').eq('name', 'Member Company').single();
      if (!workspace) return false;
      const [{ data: bookSnapshots }, { data: transactionSnapshots }] = await Promise.all([
        service.from('app_state_snapshots').select('payload').eq('workspace_id', workspace.id).eq('domain', 'cash_book:books'),
        service.from('app_state_snapshots').select('payload').eq('workspace_id', workspace.id).eq('domain', 'cash_book:transactions'),
      ]);
      const books = (bookSnapshots?.[0]?.payload as Array<{ name?: string }> | undefined) ?? [];
      const transactions = (transactionSnapshots?.[0]?.payload as Array<{ remark?: string }> | undefined) ?? [];
      return books.filter((book) => book.name === bookName).length === 1
        && transactions.filter((transaction) => transaction.remark === 'Offline Cash In').length === 1
        && transactions.filter((transaction) => transaction.remark === 'Offline Cash Out').length === 1;
    }, { timeout: 20_000 }).toBe(true);
    // Adapter contract, stage 5: acknowledgement clears the matching outbox
    // mutation while retaining exactly one local copy of each payment.
    await expect.poll(() => inspectIndexedDbCashContract(reopenedPage, ['Offline Cash In', 'Offline Cash Out']), { timeout: 20_000 }).toEqual({
      paymentCounts: { 'Offline Cash In': 1, 'Offline Cash Out': 1 },
      matchingOutboxCount: 0,
    });
  } finally {
    await persistent.close();
  }
});

test('Payroll data survives closing and reopening the browser process offline', async ({}, testInfo) => {
  const profile = testInfo.outputPath('persistent-payroll-profile');
  const baseURL = testInfo.project.use.baseURL as string;
  let persistent = await chromium.launchPersistentContext(profile, { baseURL, headless: true });
  try {
    const firstPage = await persistent.newPage();
    await signIn(firstPage, 'member');
    await firstPage.getByLabel('Payroll').click();
    await expect(firstPage.getByText('Payroll Tracker').first()).toBeVisible();
    await persistent.setOffline(true);
    await firstPage.getByRole('button', { name: 'Add Employee', exact: true }).first().click();
    const employeeName = `Persistent payroll employee ${Date.now()}`;
    await firstPage.getByPlaceholder('e.g. Sarah Jenkins').fill(employeeName);
    await firstPage.getByPlaceholder('Enter amount').fill('5000');
    await firstPage.getByRole('button', { name: 'Save Employee' }).click();
    await expect(firstPage.getByText('Employee Successfully Registered!', { exact: true })).toBeVisible();
    await firstPage.getByRole('button', { name: 'Manage Employees', exact: true }).first().click();
    await expect(firstPage.getByText(employeeName, { exact: true })).toBeVisible();

    await persistent.close();
    persistent = await chromium.launchPersistentContext(profile, { baseURL, headless: true });
    await persistent.setOffline(false);
    const reopenedPage = await persistent.newPage();
    await reopenedPage.goto('/payroll');
    await persistent.setOffline(true);
    await reopenedPage.reload();
    await expect(reopenedPage.getByText('Loading Payroll data…')).toBeHidden({ timeout: 20_000 });
    await reopenedPage.getByRole('button', { name: 'Manage Employees', exact: true }).first().click();
    await expect(reopenedPage.getByText(employeeName, { exact: true })).toBeVisible();
    await persistent.setOffline(false);
    await reopenedPage.reload();
    const service = e2eService();
    await expect.poll(async () => {
      const { data: workspace } = await service.from('workspaces').select('id').eq('name', 'Member Company').single();
      if (!workspace) return 0;
      const { data: snapshots } = await service.from('app_state_snapshots').select('payload').eq('workspace_id', workspace.id).eq('domain', 'payroll:employees');
      return snapshots?.reduce((count, snapshot) => count + (Array.isArray(snapshot.payload) && snapshot.payload.some((employee) => (employee as { name?: string }).name === employeeName) ? 1 : 0), 0) ?? 0;
    }, { timeout: 20_000 }).toBe(1);
  } finally {
    await persistent.close();
  }
});

test('a second company member retrieves a record from the shared Supabase workspace', async ({ page, browser }) => {
  const bookName = `Shared multi-device book ${Date.now()}`;
  await signIn(page, 'admin');
  await page.getByLabel('Cash Book').click();
  await expect(page.getByText('Cash Book Overview')).toBeVisible();
  await page.getByRole('button', { name: /Create Book|New Book/ }).first().click();
  await page.getByPlaceholder(/Retail Shop Cashbook/).fill(bookName);
  await page.getByRole('button', { name: 'Save Book' }).click();
  await expect(page.getByRole('heading', { name: bookName })).toBeVisible();

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  try {
    await signIn(secondPage, 'member');
    await secondPage.goto('/companies');
    await secondPage.getByRole('button').filter({ has: secondPage.getByText('Admin Company', { exact: true }) }).first().click();
    await secondPage.getByRole('button', { name: 'Switch company' }).click();
    await secondPage.getByLabel('Cash Book').click();
    await expect(secondPage.getByRole('heading', { name: bookName })).toBeVisible({ timeout: 20_000 });
  } finally {
    await secondContext.close();
  }
});

test('all synced companies and their app data remain accessible offline', async ({ page, context }) => {
  await signIn(page, 'member');
  await page.waitForFunction(async () => {
    const request = indexedDB.open('mathan-erp-offline');
    const database = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => { const read = database.transaction('records', 'readonly').objectStore('records').getAllKeys(); read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); });
    const cacheKey = keys.find((key) => String(key).startsWith('workspaces:'));
    if (!cacheKey) return false;
    const cache = await new Promise<{ memberships?: unknown[] } | undefined>((resolve, reject) => { const read = database.transaction('records', 'readonly').objectStore('records').get(cacheKey); read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); });
    const appDataReady = keys.some((key) => String(key).endsWith(':cash_book:books:revision'));
    return (cache?.memberships?.length ?? 0) >= 2 && appDataReady;
  });
  await page.goto('/companies');
  const memberCompany = page.getByRole('button').filter({ has: page.getByText('Member Company', { exact: true }) }).first();
  const adminCompany = page.getByRole('button').filter({ has: page.getByText('Admin Company', { exact: true }) }).first();
  await expect(memberCompany).toBeVisible();
  await expect(adminCompany).toBeVisible();

  await context.setOffline(true);
  await adminCompany.click();
  await page.getByRole('button', { name: 'Switch company' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByLabel('Cash Book').click();
  await expect(page.getByText('Cash Book Overview')).toBeVisible();
});

test('Truck Equity is available in member and invitation permission controls', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Company', exact: true }).click();
  await page.getByRole('button', { name: /Ordinary Member/ }).click();
  await expect(page.getByText('Truck Equity').first()).toBeVisible();
  await page.getByRole('button', { name: 'Invitations', exact: true }).click();
  await expect(page.getByText('Truck Equity').first()).toBeVisible();
});

test('company owner can schedule and restore deletion without a password', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Company', exact: true }).click();
  await page.getByRole('button', { name: 'Schedule company deletion' }).click();
  const dialog = page.getByRole('dialog', { name: 'Schedule company deletion' });
  await expect(dialog.getByLabel(/Confirm your password/i)).toHaveCount(0);
  await dialog.getByLabel('Type DELETE Admin Company to continue').fill('DELETE Admin Company');
  await dialog.getByRole('button', { name: 'Schedule deletion' }).click();
  await expect(page.getByRole('button', { name: 'Restore company' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore company' }).click();
  await expect(page.getByRole('button', { name: 'Schedule company deletion' })).toBeVisible();
});

test('administrator can schedule and restore companies and users', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, 'admin');
  await page.goto('/admin');
  await expect(page.getByText('Secure administrator backups')).toBeVisible();
  await page.getByRole('textbox', { name: 'Passphrase', exact: true }).fill('Mathan-E2E-recovery-passphrase!');
  await page.getByRole('textbox', { name: 'Confirm passphrase', exact: true }).fill('Mathan-E2E-recovery-passphrase!');
  await page.getByRole('button', { name: /Save and create today/ }).click();
  await expect(page.getByText('Secure administrator backups')).toBeHidden();

  await page.getByRole('button', { name: 'Workspaces & Access' }).click();
  const company = page.locator('section').filter({ has: page.getByText('Admin Company', { exact: true }) }).first();
  await company.getByRole('button').filter({ has: page.getByText('Admin Company', { exact: true }) }).first().click();
  await company.getByRole('button', { name: 'Schedule company deletion' }).click();
  await page.getByLabel('Type DELETE Admin Company to confirm').fill('DELETE Admin Company');
  await page.getByRole('dialog').getByRole('button', { name: 'Schedule deletion', exact: true }).click();
  await expect(company.getByRole('button', { name: 'Restore company' })).toBeVisible();
  await company.getByRole('button', { name: 'Restore company' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore company', exact: true }).click();
  await expect(company.getByRole('button', { name: 'Schedule company deletion' })).toBeVisible();

  await page.getByRole('button', { name: 'Users', exact: true }).click();
  const member = page.locator('article').filter({ hasText: E2E_USERS.member.email }).first();
  await member.getByRole('button').first().click();
  await member.getByRole('button', { name: 'Schedule deletion' }).click();
  await page.getByLabel(`Type DELETE ${E2E_USERS.member.email} to confirm`).fill(`DELETE ${E2E_USERS.member.email}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Schedule deletion', exact: true }).click();
  await expect(page.getByText(`${E2E_USERS.member.email} · purge pending`)).toBeVisible();
  const scheduledMember = page.locator('article').filter({ hasText: E2E_USERS.member.email }).first();
  const restoreUser = scheduledMember.getByRole('button', { name: 'Restore user' });
  if (!await restoreUser.isVisible()) await scheduledMember.getByRole('button').first().click();
  await restoreUser.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore user', exact: true }).click();
  await expect(page.getByText(`${E2E_USERS.member.email} · active`)).toBeVisible();
});
