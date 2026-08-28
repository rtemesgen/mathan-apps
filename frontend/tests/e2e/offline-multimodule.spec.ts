import { expect, test, type Page } from 'playwright/test';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { signIn } from './helpers';
import { localSupabaseStatus } from './supabaseLocal';

type Labels = {
  cashIn: string;
  cashOut: string;
  employee: string;
  payout: string;
  partner: string;
  tripOne: string;
  tripTwo: string;
  repair: string;
  tires: string;
};

async function inspectCombinedOfflineState(page: Page, labels: Labels) {
  return page.evaluate(async (expected) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('mathan-erp-offline');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const entries = await new Promise<Array<{ key: string; value: unknown }>>((resolve, reject) => {
      const transaction = database.transaction('records', 'readonly');
      const store = transaction.objectStore('records');
      const keys = store.getAllKeys();
      const values = store.getAll();
      transaction.oncomplete = () => resolve(keys.result.map((key, index) => ({ key: String(key), value: values.result[index] })));
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();

    const cashStates = entries.filter((entry) => entry.key.includes(':cash_book:state')).map((entry) => entry.value as { transactions?: Array<{ remark?: string }> });
    const payrollStates = entries.filter((entry) => entry.key.includes(':payroll:state')).map((entry) => entry.value as { employees?: Array<{ name?: string }>; transactions?: Array<{ notes?: string }> });
    const truckStates = entries.filter((entry) => entry.key.startsWith('truck:')).map((entry) => entry.value as { owners?: Array<{ name?: string }>; transactions?: Array<{ description?: string }> });
    const queue = entries.find((entry) => entry.key === 'sync-queue-v1')?.value;
    const queued = Array.isArray(queue) ? queue : [];
    const occurrences = (values: Array<string | undefined>, label: string) => values.filter((value) => value === label).length;
    const queuedOccurrences = (label: string) => queued.filter((mutation) => JSON.stringify(mutation).includes(label)).length;
    const cashRemarks = cashStates.flatMap((state) => state.transactions ?? []).map((transaction) => transaction.remark);
    const employeeNames = payrollStates.flatMap((state) => state.employees ?? []).map((employee) => employee.name);
    const payoutNotes = payrollStates.flatMap((state) => state.transactions ?? []).map((transaction) => transaction.notes);
    const ownerNames = truckStates.flatMap((state) => state.owners ?? []).map((owner) => owner.name);
    const truckDescriptions = truckStates.flatMap((state) => state.transactions ?? []).map((transaction) => transaction.description);

    return {
      effective: {
        cashIn: occurrences(cashRemarks, expected.cashIn),
        cashOut: occurrences(cashRemarks, expected.cashOut),
        employee: occurrences(employeeNames, expected.employee),
        payout: occurrences(payoutNotes, expected.payout),
        partner: occurrences(ownerNames, expected.partner),
        tripOne: occurrences(truckDescriptions, expected.tripOne),
        tripTwo: occurrences(truckDescriptions, expected.tripTwo),
        repair: occurrences(truckDescriptions, expected.repair),
        tires: occurrences(truckDescriptions, expected.tires),
      },
      outbox: Object.fromEntries(Object.entries(expected).map(([name, label]) => [name, queuedOccurrences(label)])),
    };
  }, labels);
}

async function openTruckSection(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name: /TRUCK EQUITY/ }).click();
  await page.getByRole('button', { name }).click();
}

async function navigateClientSide(page: Page, path: string) {
  await page.evaluate((nextPath) => {
    history.pushState({}, '', nextPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

test('Cash Book, Payroll, and Truck survive one combined offline process restart and sync exactly once', async ({}, testInfo) => {
  test.setTimeout(240_000);
  const stamp = Date.now();
  const labels: Labels = {
    cashIn: `Combined cash in ${stamp}`,
    cashOut: `Combined cash out ${stamp}`,
    employee: `Combined employee ${stamp}`,
    payout: `Combined payout ${stamp}`,
    partner: `Combined partner ${stamp}`,
    tripOne: `Combined trip one ${stamp}`,
    tripTwo: `Combined trip two ${stamp}`,
    repair: `Combined mechanical repair ${stamp}`,
    tires: `Combined tires and brakes ${stamp}`,
  };
  const firstBook = `Dhdh ${stamp}`;
  const secondBook = `RemoteSyncTest ${stamp}`;
  const truckId = crypto.randomUUID();
  const truckName = `Combined truck ${stamp}`;
  const unitNumber = `CB-${stamp}`;
  const status = localSupabaseStatus();
  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: workspace } = await service.from('workspaces').select('id').eq('name', 'Admin Company').single();
  expect(workspace).toBeTruthy();
  await service.from('trucks').insert({ id: truckId, workspace_id: workspace!.id, name: truckName, unit_number: unitNumber, make_model: 'Combined offline test', vin: '', cash_on_hand: 0, license_plate: unitNumber });
  await service.from('truck_transactions').insert({ id: crypto.randomUUID(), workspace_id: workspace!.id, truck_id: truckId, occurred_on: '2026-08-28', transaction_type: 'INCOME', category: 'Opening revenue', amount: 20499, description: `Combined baseline ${stamp}` });

  const profile = testInfo.outputPath('combined-offline-profile');
  const baseURL = testInfo.project.use.baseURL as string;
  let persistent = await chromium.launchPersistentContext(profile, { baseURL, headless: true });
  persistent.setDefaultTimeout(12_000);
  try {
    const page = await persistent.newPage();
    await signIn(page, 'admin');

    await page.getByLabel('Cash Book').click();
    for (const bookName of [firstBook, secondBook]) {
      await page.getByRole('button', { name: /Create Book|New Book/ }).first().click();
      await page.getByPlaceholder(/Retail Shop Cashbook/).fill(bookName);
      await page.getByRole('button', { name: 'Save Book' }).click();
      await expect(page.getByRole('heading', { name: bookName })).toBeVisible();
      if (bookName === firstBook) await page.getByRole('button', { name: 'Dashboard' }).click();
    }
    await page.goto('/truck');
    await expect(page.getByText('Loading Truck data…')).toBeHidden({ timeout: 20_000 });
    await page.locator('header button[aria-haspopup=listbox]').click();
    await page.getByRole('option', { name: `${truckName} (${unitNumber})`, exact: true }).dispatchEvent('click');
    await expect(page.locator('header button[aria-haspopup=listbox]')).toContainText(truckName);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
    await persistent.setOffline(true);

    await navigateClientSide(page, '/book');
    await page.getByRole('heading', { name: firstBook }).click();
    await page.getByRole('button', { name: 'Cash In', exact: true }).last().click();
    await page.locator('input[type=number]').fill('111');
    await page.getByPlaceholder('e.g. Counter sale, Payment received').fill(labels.cashIn);
    await page.getByRole('button', { name: 'Save Entry', exact: true }).click();
    await expect(page.getByText(labels.cashIn, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Dashboard' }).click();
    await page.getByRole('heading', { name: secondBook }).click();
    await page.getByRole('button', { name: 'Cash Out', exact: true }).last().click();
    await page.locator('input[type=number]').fill('111');
    await page.getByPlaceholder('e.g. Rent, Restock, Vendor payout').fill(labels.cashOut);
    await page.getByRole('button', { name: 'Save Entry', exact: true }).click();
    await expect(page.getByText(labels.cashOut, { exact: true })).toBeVisible();

    await navigateClientSide(page, '/payroll');
    await expect(page.getByText('Payroll Tracker').first()).toBeVisible();
    await page.getByRole('button', { name: 'Add Employee', exact: true }).first().click();
    await page.getByPlaceholder('e.g. Sarah Jenkins').fill(labels.employee);
    await page.getByPlaceholder('Enter amount').fill('5000');
    await page.getByRole('button', { name: 'Save Employee' }).click();
    await page.getByRole('button', { name: 'Pay', exact: true }).first().click();
    await page.getByRole('button', { name: /Choose employee|Combined employee/ }).first().click();
    await page.getByRole('button', { name: new RegExp(labels.employee) }).last().click();
    await page.locator('input[type=number]').first().fill('111');
    await page.getByPlaceholder('e.g. Mid-month salary withdrawal').fill(labels.payout);
    await page.getByRole('button', { name: 'Save Payout' }).click();
    await expect(page.getByText('Payout Recorded Successfully!')).toBeVisible();

    await navigateClientSide(page, '/truck');
    await openTruckSection(page, /Partners & Loans/);
    await page.getByRole('button', { name: /Add Partner/ }).first().click();
    await page.getByPlaceholder('e.g., Marcus Vance').fill(labels.partner);
    await page.getByPlaceholder('20').fill('25');
    await page.getByPlaceholder('5000').fill('0');
    await page.getByRole('button', { name: 'Save Partner' }).click();
    await expect(page.getByText(labels.partner, { exact: true })).toBeVisible();

    for (const description of [labels.tripOne, labels.tripTwo]) {
      await openTruckSection(page, 'Income (Trips)');
      await page.locator('input[type=number]').first().fill('111');
      await page.getByPlaceholder('e.g. Trip from Dallas TX to Atlanta GA').fill(description);
      await page.getByRole('button', { name: 'Save Income' }).click();
      await expect(page.getByRole('status').filter({ hasText: /Saved|successfully/ }).first()).toBeVisible();
    }
    for (const [amount, category, description] of [['1111', 'Mechanical Repair', labels.repair], ['111', 'Tires & Brakes', labels.tires]] as const) {
      await openTruckSection(page, 'Expenses & Payouts');
      await page.locator('input[type=number]').first().fill(amount);
      await page.getByPlaceholder('Select or type category...').fill(category);
      await page.getByPlaceholder('e.g. Oil change and new air filter').fill(description);
      await page.getByRole('button', { name: 'Save Expense' }).click();
      await expect(page.getByRole('status').filter({ hasText: /Saved|successfully/ }).first()).toBeVisible();
    }

    await openTruckSection(page, 'Activity History');
    for (const description of [labels.tripOne, labels.tripTwo, labels.repair, labels.tires]) await expect(page.getByText(description, { exact: true })).toBeVisible();
    await openTruckSection(page, /Dashboard/);
    await expect(page.getByText('$20,721', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('$1,222', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('$19,499', { exact: true }).first()).toBeVisible();

    const beforeRestart = await inspectCombinedOfflineState(page, labels);
    expect(Object.values(beforeRestart.effective)).toEqual(Array(9).fill(1));
    expect(Object.values(beforeRestart.outbox)).toEqual(Array(9).fill(1));

    await persistent.close();
    persistent = await chromium.launchPersistentContext(profile, { baseURL, headless: true });
    persistent.setDefaultTimeout(12_000);
    const reopened = await persistent.newPage();
    await reopened.goto('/truck');
    await persistent.setOffline(true);
    await reopened.reload();
    await expect(reopened.getByText('Loading Truck data…')).toBeHidden({ timeout: 20_000 });
    expect(await inspectCombinedOfflineState(reopened, labels)).toEqual(beforeRestart);
    await openTruckSection(reopened, 'Activity History');
    for (const description of [labels.tripOne, labels.tripTwo, labels.repair, labels.tires]) await expect(reopened.getByText(description, { exact: true })).toBeVisible();
    await openTruckSection(reopened, /Partners & Loans/);
    await expect(reopened.getByText(labels.partner, { exact: true })).toBeVisible();
    await navigateClientSide(reopened, '/payroll');
    await reopened.getByRole('button', { name: 'Manage Employees', exact: true }).first().click();
    await expect(reopened.getByText(labels.employee, { exact: true })).toBeVisible();
    await navigateClientSide(reopened, '/book');
    await reopened.getByRole('heading', { name: firstBook }).click();
    await expect(reopened.getByText(labels.cashIn, { exact: true })).toBeVisible();
    await reopened.getByRole('button', { name: 'Dashboard' }).click();
    await reopened.getByRole('heading', { name: secondBook }).click();
    await expect(reopened.getByText(labels.cashOut, { exact: true })).toBeVisible();

    await persistent.setOffline(false);
    await reopened.reload();
    await expect.poll(async () => {
      const [{ data: cash }, { data: payroll }, { count: ownerCount }, { data: transactions }] = await Promise.all([
        service.from('app_state_snapshots').select('payload').eq('workspace_id', workspace!.id).eq('domain', 'cash_book:state').maybeSingle(),
        service.from('app_state_snapshots').select('payload').eq('workspace_id', workspace!.id).eq('domain', 'payroll:state').maybeSingle(),
        service.from('truck_owners').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace!.id).eq('name', labels.partner),
        service.from('truck_transactions').select('description').eq('workspace_id', workspace!.id).eq('truck_id', truckId).in('description', [labels.tripOne, labels.tripTwo, labels.repair, labels.tires]),
      ]);
      const cashPayload = cash?.payload as { transactions?: Array<{ remark?: string }> } | undefined;
      const payrollPayload = payroll?.payload as { employees?: Array<{ name?: string }>; transactions?: Array<{ notes?: string }> } | undefined;
      return [
        cashPayload?.transactions?.filter((item) => item.remark === labels.cashIn).length,
        cashPayload?.transactions?.filter((item) => item.remark === labels.cashOut).length,
        payrollPayload?.employees?.filter((item) => item.name === labels.employee).length,
        payrollPayload?.transactions?.filter((item) => item.notes === labels.payout).length,
        ownerCount,
        ...[labels.tripOne, labels.tripTwo, labels.repair, labels.tires].map((label) => transactions?.filter((item) => item.description === label).length),
      ];
    }, { timeout: 30_000 }).toEqual(Array(9).fill(1));
    await expect.poll(() => inspectCombinedOfflineState(reopened, labels), { timeout: 30_000 }).toEqual({
      effective: beforeRestart.effective,
      outbox: Object.fromEntries(Object.keys(labels).map((name) => [name, 0])),
    });
    await reopened.reload();
    expect((await inspectCombinedOfflineState(reopened, labels)).effective).toEqual(beforeRestart.effective);
  } finally {
    await persistent.close();
    await service.from('truck_transactions').delete().eq('truck_id', truckId);
    await service.from('truck_owners').delete().eq('truck_id', truckId);
    await service.from('trucks').delete().eq('id', truckId);
  }
});
