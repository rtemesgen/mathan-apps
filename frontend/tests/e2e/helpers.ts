import { expect, type Page } from 'playwright/test';
import { E2E_USERS } from './globalSetup';

export async function signIn(page: Page, user: keyof typeof E2E_USERS) {
  const fixture = E2E_USERS[user];
  await page.goto('/');
  await page.getByPlaceholder('Email address').fill(fixture.email);
  await page.getByPlaceholder('Password').fill(fixture.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Settings')).toBeVisible();
}
