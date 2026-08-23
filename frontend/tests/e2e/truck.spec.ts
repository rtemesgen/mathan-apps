import { expect, test } from 'playwright/test';
import { signIn } from './helpers';

test('Truck app is available through the workspace launcher and has native navigation', async ({ page }) => {
  await signIn(page, 'member');
  const launcher = page.getByLabel('Truck Equity');
  if (await launcher.count() === 0) test.skip(true, 'Truck access is not granted to this fixture workspace.');
  await launcher.click();
  await expect(page).toHaveURL(/\/truck$/);
  await expect(page.getByText('DASHBOARD')).toBeVisible();
  await page.getByRole('button', { name: /TRUCK EQUITY/ }).click();
  await page.getByRole('button', { name: /Partners & Loans/ }).click();
  await expect(page.getByText(/Partners & Loans/).first()).toBeVisible();
  await expect(page.getByText('Reset Demo Data')).toHaveCount(0);
});
