import { expect, test } from 'playwright/test';
import { signIn } from './helpers';

test('Truck app is available through the workspace launcher and has native navigation', async ({ page }) => {
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
  await expect(page.getByRole('heading', { name: 'E2E Truck', exact: true })).toBeVisible();
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
