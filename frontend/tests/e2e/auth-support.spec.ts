import { expect, test } from 'playwright/test';
import { E2E_USERS } from './globalSetup';

test('failed password sign-in explains the failure and offers WhatsApp support', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Email address').fill(E2E_USERS.member.email);
  await page.getByPlaceholder('Password').fill('not-the-right-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  const failure = page.getByRole('alert');
  await expect(failure).toContainText('Sign-in failed');
  await expect(failure).toContainText('blocked, suspended, or scheduled for deletion');
  const support = page.getByRole('link', { name: 'Contact customer service on WhatsApp' });
  await expect(support).toHaveAttribute('href', /https:\/\/wa\.me\/256741321674\?text=/);

  await page.getByPlaceholder('Password').fill(E2E_USERS.member.password);
  await expect(failure).not.toBeVisible();
});

test('failed Google callback returns to login with WhatsApp support', async ({ page }) => {
  await page.goto('/auth/callback?error=access_denied&error_description=Account%20is%20suspended');

  const failure = page.getByRole('alert');
  await expect(failure).toContainText('Sign-in failed');
  await expect(failure).toContainText('This account is currently unavailable');
  await expect(page.getByRole('link', { name: 'Contact customer service on WhatsApp' })).toHaveAttribute('href', /wa\.me\/256741321674/);
  await expect(page).toHaveURL('http://127.0.0.1:4173/');
});

test('signup and password-reset messages do not show sign-in support', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Reset password' }).click();
  await page.getByPlaceholder('Email address').fill('missing@example.com');
  await page.getByRole('button', { name: 'Send reset email' }).click();

  await expect(page.getByText('Password reset email sent. Open the link to choose a new password.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Contact customer service on WhatsApp' })).not.toBeVisible();
});
