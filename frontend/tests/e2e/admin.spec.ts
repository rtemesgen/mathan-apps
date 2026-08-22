import { expect, test } from 'playwright/test';
import { signIn } from './helpers';
import { E2E_USERS } from './globalSetup';

const PASSPHRASE = 'Mathan-E2E-recovery-passphrase!';

test('admin controls, encrypted backup, purge, safe restore, and audit work end to end', async ({ page }) => {
  await signIn(page, 'admin');
  await expect(page.getByLabel('Admin')).toBeVisible();
  await page.getByLabel('Admin').click();
  await expect(page.getByText('Secure administrator backups')).toBeVisible();
  await page.getByPlaceholder('Passphrase').fill(PASSPHRASE);
  await page.getByPlaceholder('Confirm passphrase').fill(PASSPHRASE);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save and create today/ }).click();
  const backupDownload = await downloadPromise;
  const backupPath = await backupDownload.path();
  expect(backupPath).toBeTruthy();
  await expect(page.getByText('Total users')).toBeVisible();

  await page.getByRole('button', { name: 'Users', exact: true }).click();
  await page.getByPlaceholder('Search name, email, or phone').fill('member@mathan-e2e.local');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByText('member@mathan-e2e.local · active').click();
  await page.getByRole('button', { name: 'Suspend 24h' }).click();
  await page.getByRole('dialog').getByLabel('Suspension duration (hours)').fill('2');
  await page.getByRole('dialog').getByRole('button', { name: 'Suspend account' }).click();
  await expect(page.getByText('member@mathan-e2e.local · suspended')).toBeVisible();
  await page.getByRole('button', { name: 'Reactivate' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reactivate account' }).click();
  await expect(page.getByText('member@mathan-e2e.local · active')).toBeVisible();

  await page.getByRole('button', { name: 'Workspaces & Access' }).click();
  const company = page.locator('section').filter({ hasText: 'Admin Company' }).first();
  await company.getByRole('button', { name: /Admin Company/ }).click();
  const memberRow = company.getByText('member@mathan-e2e.local · member', { exact: true }).locator('xpath=../../..');
  await memberRow.locator('select').first().selectOption('none');
  await expect(memberRow.locator('select').first()).toHaveValue('none');
  await memberRow.locator('select').first().selectOption('edit');
  await expect(memberRow.locator('select').first()).toHaveValue('edit');
  const cashBookControl = company.locator('div').filter({ hasText: /^Cash Book · OnDisable$/ }).first();
  await cashBookControl.getByRole('button', { name: 'Disable' }).click();
  await expect(company.getByText('Cash Book · Off')).toBeVisible();
  await company.getByRole('button', { name: 'Enable' }).first().click();
  await expect(company.getByText('Cash Book · On')).toBeVisible();

  await page.getByRole('button', { name: 'Users', exact: true }).click();
  await page.getByPlaceholder('Search name, email, or phone').fill('delete-me@mathan-e2e.local');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByText('delete-me@mathan-e2e.local · active').click();
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await page.getByRole('dialog').getByLabel('Type DELETE to confirm').fill('DELETE');
  await page.getByRole('dialog').getByLabel('Your password').fill(E2E_USERS.admin.password);
  await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByText('0 users')).toBeVisible();

  await page.getByRole('button', { name: 'Backup & Restore' }).click();
  await page.locator('input[type=file]').setInputFiles(backupPath!);
  await page.getByPlaceholder('Passphrase').fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Inspect and verify backup' }).click();
  await expect(page.getByText(/Verified backup from/)).toBeVisible();
  await page.getByRole('button', { name: 'Restore selected as new workspaces' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore as new workspaces' }).click();
  await expect(page.getByText(/recovery workspaces created/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/delete-me@mathan-e2e.local/)).toBeVisible();

  await page.getByRole('button', { name: 'Audit Log' }).click();
  await expect(page.getByText('user suspended').first()).toBeVisible();
  await expect(page.getByText('user purged')).toBeVisible();
  await expect(page.getByText('restore completed')).toBeVisible();
});

test('admin sidebar remains usable at a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'admin');
  await page.getByLabel('Admin').click();
  await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Backup & Restore' })).toBeVisible();
});
