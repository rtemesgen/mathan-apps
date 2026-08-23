import { expect, test } from 'playwright/test';
import { createClient } from '@supabase/supabase-js';
import { E2E_USERS } from './globalSetup';
import { localSupabaseStatus } from './supabaseLocal';

async function enterGuest(page: import('playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await expect(page.getByRole('link', { name: 'Cash Book' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Payroll' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Truck Equity' })).toBeVisible();
}

test('guest mode exposes all apps and manages multiple companies offline', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterGuest(page);
  await context.setOffline(true);
  await page.getByRole('link', { name: /Switch · Guest Company/ }).click();
  await page.getByRole('button', { name: /Create another company/ }).click();
  await page.getByPlaceholder('Company name').fill('Offline Test Company');
  await page.getByRole('button', { name: 'Create company' }).click();
  await expect(page.getByText('Offline Test Company', { exact: true })).toBeVisible();
  await page.getByText('Offline Test Company', { exact: true }).click();
  await page.getByRole('link', { name: 'Truck Equity' }).click();
  await expect(page.getByText(/No trucks yet/i)).toBeVisible();
  await expect(page.getByText(/Truck tables are not installed/i)).not.toBeVisible();
  await context.setOffline(false);
});

test('guest Cash Book, Payroll, and Truck data merge idempotently after login', async ({ page }) => {
  await enterGuest(page);
  const fixture = await page.evaluate(async () => {
    const cache = JSON.parse(localStorage.getItem('mathan_erp_guest_workspaces_v1') ?? '{}') as { memberships: Array<{ id: string }>; selectedWorkspaceId: string };
    const workspaceId = cache.selectedWorkspaceId;
    const truckId = '10000000-0000-4000-a000-000000000001';
    const ownerId = '10000000-0000-4000-a000-000000000002';
    const transactionId = '10000000-0000-4000-a000-000000000003';
    const values: Record<string, unknown> = {
      [`standalone:${workspaceId}:cash_book:books`]: [{ id: 'guest-book', name: 'Guest Book', currency: 'UGX', createdAt: '2026-08-23T00:00:00Z', updatedAt: '2026-08-23T00:00:00Z' }],
      [`standalone:${workspaceId}:cash_book:transactions`]: [{ id: 'guest-cash-tx', bookId: 'guest-book', type: 'in', amount: 5000, remark: 'Guest income', dateTime: '2026-08-23T08:00', createdAt: '2026-08-23T08:00:00Z', attachmentUrl: 'data:text/plain;base64,Z3Vlc3Q=', attachmentName: 'guest.txt' }],
      [`standalone:${workspaceId}:payroll:employees`]: [{ id: 'guest-employee', name: 'Guest Employee', startDate: '2026-08-01', initialSalary: 100000, salaryHistory: [], status: 'active', createdAt: '2026-08-01T00:00:00Z' }],
      [`standalone:${workspaceId}:payroll:transactions`]: [{ id: 'guest-payroll-tx', employeeId: 'guest-employee', amount: 10000, date: '2026-08-23', type: 'withdrawal', createdAt: '2026-08-23T00:00:00Z' }],
      [`truck:guest:${workspaceId}`]: { trucks: [{ id: truckId, name: 'Guest Truck', unitNumber: 'G-1', makeModel: 'Test', vin: '', cashOnHand: 0, licensePlate: 'UG-GUEST' }], owners: [{ id: ownerId, truckId, name: 'Guest Partner', startDate: '2026-08-01', equityPercentage: 50, monthlyDrawRate: 0, avatarColor: 'bg-slate-800 text-white' }], transactions: [{ id: transactionId, truckId, ownerId, date: '2026-08-23', type: 'INCOME', category: 'Trip', amount: 25000, description: 'Guest trip' }] },
    };
    const database = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('mathan-erp-offline', 1); request.onupgradeneeded = () => request.result.createObjectStore('records'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise<void>((resolve, reject) => { const transaction = database.transaction('records', 'readwrite'); const store = transaction.objectStore('records'); Object.entries(values).forEach(([key, value]) => store.put(value, key)); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    return { workspaceId, truckId };
  });
  const status = localSupabaseStatus();
  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const setupClient = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  await setupClient.auth.signInWithPassword({ email: E2E_USERS.disposable.email, password: E2E_USERS.disposable.password });
  const { data: workspace, error: createWorkspaceError } = await setupClient.rpc('create_workspace', { workspace_name: 'Guest Import Target' });
  expect(createWorkspaceError).toBeNull();
  await service.from('app_state_snapshots').insert({ workspace_id: workspace!.id, domain: 'cash_book:books', revision: 1, payload: [{ id: 'guest-book', name: 'Cloud Book', currency: 'UGX', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' }] });

  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByPlaceholder('Email address').fill(E2E_USERS.disposable.email);
  await page.getByPlaceholder('Password').fill(E2E_USERS.disposable.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Sync guest companies' })).toBeVisible();
  await page.getByRole('button', { name: 'Import guest company' }).click();
  await expect(page.getByText(/Imported .* records, skipped .* duplicates/)).toBeVisible();

  const { data: snapshots } = await service.from('app_state_snapshots').select('domain,payload').eq('workspace_id', workspace!.id);
  const books = snapshots?.find((row) => row.domain === 'cash_book:books')?.payload as Array<{ id: string; name: string }>;
  expect(books.some((item) => item.name === 'Cloud Book')).toBeTruthy();
  const importedBook = books.find((item) => item.name === 'Guest Book');
  expect(importedBook?.id).toMatch(/^guest-book-guest-/);
  const cashTransactions = snapshots?.find((row) => row.domain === 'cash_book:transactions')?.payload as Array<{ bookId: string; attachmentName?: string }>;
  expect(cashTransactions.some((item) => item.attachmentName === 'guest.txt' && item.bookId === importedBook?.id)).toBeTruthy();
  expect((snapshots?.find((row) => row.domain === 'payroll:employees')?.payload as Array<{ name: string }>).some((item) => item.name === 'Guest Employee')).toBeTruthy();
  const { data: truck } = await service.from('trucks').select('id,name').eq('workspace_id', workspace!.id).eq('name', 'Guest Truck').single();
  expect(truck?.id).toBe(fixture.truckId);
  const { data: receipts, error: receiptError } = await service.from('guest_workspace_import_receipts').select('import_id,result').eq('target_workspace', workspace!.id);
  expect(receiptError).toBeNull();
  expect(receipts).toHaveLength(1);
  const receipt = receipts![0];
  expect((receipt.result as { status: string }).status).toBe('imported');
  expect((receipt.result as { remapped: number }).remapped).toBeGreaterThan(0);

  const signed = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  await signed.auth.signInWithPassword({ email: E2E_USERS.disposable.email, password: E2E_USERS.disposable.password });
  const retry = await signed.rpc('import_guest_workspace', { target_workspace: workspace!.id, target_import_id: receipt.import_id, target_payload: { version: 1 } });
  expect(retry.error).toBeNull();
  expect((retry.data as { status: string }).status).toBe('already_imported');

  const { data: restrictedWorkspace } = await service.from('workspaces').select('id').eq('name', 'Admin Company').single();
  const denied = await signed.rpc('import_guest_workspace', { target_workspace: restrictedWorkspace!.id, target_import_id: '20000000-0000-4000-a000-000000000001', target_payload: { version: 1, snapshots: {}, truck: {}, fingerprint: 'denied' } });
  expect(denied.error?.message).toContain('Edit access to Cash Book, Payroll, and Truck Equity is required');
  await service.from('workspaces').delete().eq('id', workspace!.id);
});
