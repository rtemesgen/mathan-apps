import { expect, test } from 'playwright/test';
import { signIn } from './helpers';

const PASSPHRASE = 'Mathan-E2E-recovery-passphrase!';

test('admin controls, encrypted backup, recoverable deletion, safe restore, and audit work end to end', async ({ page }) => {
  await signIn(page, 'admin');
  await expect(page.getByLabel('Admin')).toBeVisible();
  await page.getByLabel('Admin').click();
  await expect(page.getByText('Secure administrator backups')).toBeVisible();
  await page.getByRole('textbox', { name: 'Passphrase', exact: true }).fill(PASSPHRASE);
  await page.getByRole('textbox', { name: 'Confirm passphrase', exact: true }).fill(PASSPHRASE);
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
  const memberRow = company.getByText('member@mathan-e2e.local · member', { exact: true }).locator('xpath=../..');
  await memberRow.getByRole('button', { name: 'Cash Book', exact: true }).click();
  await page.getByRole('option', { name: 'No access', exact: true }).click();
  await expect(memberRow.getByRole('button', { name: 'Cash Book', exact: true })).toContainText('No access');
  await memberRow.getByRole('button', { name: 'Cash Book', exact: true }).click();
  await page.getByRole('option', { name: 'Edit', exact: true }).click();
  await expect(memberRow.getByRole('button', { name: 'Cash Book', exact: true })).toContainText('Edit');
  const cashBookControl = company.locator('div').filter({ hasText: /^Cash Book · OnDisable$/ }).first();
  await cashBookControl.getByRole('button', { name: 'Disable' }).click();
  await expect(company.getByText('Cash Book · Off')).toBeVisible();
  await company.getByRole('button', { name: 'Enable' }).first().click();
  await expect(company.getByText('Cash Book · On')).toBeVisible();

  await page.getByRole('button', { name: 'Users', exact: true }).click();
  await page.getByPlaceholder('Search name, email, or phone').fill('delete-me@mathan-e2e.local');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByText('delete-me@mathan-e2e.local · active').click();
  await page.getByRole('button', { name: 'Schedule deletion' }).click();
  await page.getByRole('dialog').getByLabel('Type DELETE delete-me@mathan-e2e.local to confirm').fill('DELETE delete-me@mathan-e2e.local');
  await page.getByRole('dialog').getByRole('button', { name: 'Schedule deletion' }).click();
  await expect(page.getByText('delete-me@mathan-e2e.local · purge pending')).toBeVisible();
  const deletedUser = page.locator('article').filter({ hasText: 'delete-me@mathan-e2e.local' }).first();
  const restoreUser = deletedUser.getByRole('button', { name: 'Restore user' });
  if (!await restoreUser.isVisible()) await deletedUser.getByRole('button').first().click();
  await restoreUser.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore user', exact: true }).click();
  await expect(page.getByText('delete-me@mathan-e2e.local · active')).toBeVisible();

  await page.getByRole('button', { name: 'Backup & Restore' }).click();
  await page.locator('input[type=file]').setInputFiles(backupPath!);
  await page.getByRole('textbox', { name: 'Passphrase', exact: true }).fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Inspect and verify backup' }).click();
  await expect(page.getByText(/Verified backup from/)).toBeVisible();
  await page.getByRole('button', { name: 'Restore selected as new workspaces' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore as new workspaces' }).click();
  await expect(page.getByText(/recovery workspaces created/)).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Audit Log' }).click();
  await expect(page.getByText('user suspended').first()).toBeVisible();
  await expect(page.getByText('user deletion scheduled')).toBeVisible();
  await expect(page.getByText('user deletion cancelled')).toBeVisible();
  await expect(page.getByText('restore completed')).toBeVisible();
});

test('admin sidebar remains usable at a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'admin');
  await page.getByLabel('Admin').click();
  await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Backup & Restore' })).toBeVisible();
});
