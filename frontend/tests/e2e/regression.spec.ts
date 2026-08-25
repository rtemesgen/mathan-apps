import { expect, test } from 'playwright/test';
import { signIn } from './helpers';
import { E2E_USERS } from './globalSetup';

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
