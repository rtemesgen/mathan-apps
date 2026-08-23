import { expect, test } from 'playwright/test';
import { signIn } from './helpers';

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
  await page.getByRole('button', { name: /Create Book/ }).first().click();
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
