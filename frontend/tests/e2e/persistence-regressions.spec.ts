import { expect, test } from 'playwright/test';
import { signIn } from './helpers';
import { setE2EOffline, setE2EOnline } from './network';
import { localSupabaseStatus } from './supabaseLocal';
import { createClient } from '@supabase/supabase-js';

async function readCashBookPersistence(page: import('playwright/test').Page, bookName: string) {
  return page.evaluate(async (expectedName) => {
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
    const state = entries
      .filter((entry) => entry.key.endsWith(':cash_book:state'))
      .map((entry) => entry.value as { books?: Array<{ name?: string }>; transactions?: Array<{ bookId?: string }> })
      .find((value) => value.books?.some((book) => book.name === expectedName));
    const queue = entries.find((entry) => entry.key === 'sync-queue-v1')?.value;
    return {
      localBookCount: state?.books?.filter((book) => book.name === expectedName).length ?? 0,
      queuedOccurrences: (Array.isArray(queue) ? queue : []).filter((mutation) => JSON.stringify(mutation).includes(expectedName)).length,
    };
  }, bookName);
}

test('offline unattempted Cash Book create then delete leaves no durable or remote record', async ({ page, context }) => {
  const status = localSupabaseStatus();
  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const bookName = `Create-delete regression ${Date.now()}`;

  await signIn(page, 'member');
  await page.getByLabel('Cash Book').click();
  await expect(page.getByText('Cash Book Overview')).toBeVisible();
  await setE2EOffline(context, status.API_URL);

  await page.getByRole('button', { name: /Create Book|New Book/ }).first().click();
  await page.getByPlaceholder(/Retail Shop Cashbook/).fill(bookName);
  await page.getByRole('button', { name: 'Save Book' }).click();
  await expect(page.getByRole('heading', { name: bookName })).toBeVisible();
  await page.getByRole('button', { name: 'Dashboard' }).click();

  const card = page.locator('div.group').filter({ hasText: bookName }).first();
  await card.getByRole('button', { name: `Actions for ${bookName}` }).click();
  await page.getByRole('button', { name: 'Delete book' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText(bookName, { exact: true })).toHaveCount(0);
  await expect.poll(() => readCashBookPersistence(page, bookName)).toEqual({ localBookCount: 0, queuedOccurrences: 0 });

  await setE2EOnline(context, status.API_URL);
  await page.reload();
  await expect(page.getByText(bookName, { exact: true })).toHaveCount(0);
  const { data: workspace } = await service.from('workspaces').select('id').eq('name', 'Member Company').single();
  expect(workspace).toBeTruthy();
  await expect.poll(async () => {
    const { data } = await service.from('app_state_snapshots').select('payload').eq('workspace_id', workspace!.id).eq('domain', 'cash_book:state').maybeSingle();
    const payload = data?.payload as { books?: Array<{ name?: string }> } | undefined;
    return payload?.books?.filter((book) => book.name === bookName).length ?? 0;
  }).toBe(0);
});

test('local storage failure keeps Cash Book save open and never reports success', async ({ page, context }) => {
  const status = localSupabaseStatus();
  await signIn(page, 'member');
  await page.getByLabel('Cash Book').click();
  await expect(page.getByText('Cash Book Overview')).toBeVisible();
  await setE2EOffline(context, status.API_URL);

  await page.evaluate(() => {
    const databasePrototype = IDBDatabase.prototype as IDBDatabase & { transaction: IDBDatabase['transaction'] };
    const originalTransaction = databasePrototype.transaction;
    databasePrototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      const mode = typeof args[1] === 'string' ? args[1] : undefined;
      if (mode === 'readwrite') throw new DOMException('Simulated durable-store failure', 'QuotaExceededError');
      return originalTransaction.apply(this, args);
    };
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith('mathan_erp_offline_') || key.includes('atomic_recovery')) throw new DOMException('Simulated fallback failure', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    };
  });

  const bookName = `Storage failure regression ${Date.now()}`;
  await page.getByRole('button', { name: /Create Book|New Book/ }).first().click();
  await page.getByPlaceholder(/Retail Shop Cashbook/).fill(bookName);
  await page.getByRole('button', { name: 'Save Book' }).click();
  await expect(page.getByRole('alert')).toContainText(/Could not save the Cash Book|not saved|storage/i);
  await expect(page.getByRole('heading', { name: 'Create New Book' })).toBeVisible();
  await expect(page.getByText(bookName, { exact: true })).toHaveCount(0);
});

async function seedDurableSnapshotConflict(page: import('playwright/test').Page, remoteValue: Array<{ id: string; name: string }>, localValue: Array<{ id: string; name: string }>) {
  const status = localSupabaseStatus();
  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: users, error: usersError } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) throw usersError;
  const member = (users.users as Array<{ id: string; email?: string }>).find((user) => user.email === 'member@mathan-e2e.local');
  expect(member).toBeTruthy();
  const { data: workspace, error: workspaceError } = await service.from('workspaces').select('id').eq('name', 'Admin Company').single();
  if (workspaceError || !workspace) throw workspaceError ?? new Error('Admin Company fixture is missing.');
  const domain = 'cash_book:books';
  const mutationId = `e2e-conflict-${Date.now()}`;
  const updatedAt = new Date().toISOString();
  const storageKey = `${member!.id}:${workspace.id}:${domain}`;
  const { error: remoteUpdateError } = await service.from('app_state_snapshots').update({ payload: remoteValue }).eq('workspace_id', workspace.id).eq('domain', domain);
  if (remoteUpdateError) throw remoteUpdateError;
  const mutation = {
    formatVersion: 2,
    id: mutationId,
    mutationId,
    userId: member!.id,
    companyId: workspace.id,
    entityType: 'app_state_snapshot',
    entityId: domain,
    baseRevision: 1,
    table: 'app_state_snapshots',
    operation: 'upsert',
    payload: {
      workspace_id: workspace.id,
      domain,
      payload: localValue,
      base_payload: [],
      expected_revision: 1,
      affected_client_ids: [localValue[0].id],
      mutation_id: mutationId,
    },
    queuedAt: updatedAt,
    updatedAt,
    baseServerUpdatedAt: null,
    lastAttemptAt: updatedAt,
    syncStartedAt: null,
    syncAttemptId: null,
    leaseExpiresAt: null,
    syncStatus: 'conflicted',
    retryCount: 1,
    errorCode: 'CONFLICT',
    errorMessage: 'Remote revision changed',
    lastError: 'Remote revision changed',
    localSequence: 1,
  };

  await signIn(page, 'member');
  await page.evaluate(({ storageKey: key, mutation: queued, mutationId: id, localValue: value }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('mathan-erp-offline', 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('records', 'readwrite');
      const store = transaction.objectStore('records');
      store.put(value, key);
      store.put([], `${key}:confirmed`);
      store.put(1, `${key}:revision`);
      store.put([], `${key}:confirmed:revision`);
      store.put([queued], 'sync-queue-v1');
      store.put({ formatVersion: 2, queueGeneration: 1, nextLocalSequence: 2 }, 'sync-queue-meta-v2');
      transaction.oncomplete = () => {
        database.close();
        window.dispatchEvent(new CustomEvent('mathan:open-sync-issue', {
          detail: { table: 'app_state_snapshots', entityId: 'cash_book:books', mutationId: id, state: 'needs_attention', workspaceId: key.split(':')[1], operation: 'upsert', updatedAt: queued.updatedAt },
        }));
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  }), { storageKey, mutation, mutationId, localValue });

  return { service, workspaceId: workspace.id, storageKey, mutationId, localValue };
}

test('durable snapshot conflict can be resolved with the server version from the UI', async ({ page }) => {
  const localValue = [{ id: `local-book-${Date.now()}`, name: 'Local conflict value' }];
  const { service, workspaceId, storageKey } = await seedDurableSnapshotConflict(page, [], localValue);
  try {
    await expect(page.getByRole('dialog', { name: 'Sync issue' })).toBeVisible();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Use server version' }).click();
    await expect(page.getByRole('dialog', { name: 'Sync issue' })).toHaveCount(0);
    await expect.poll(() => page.evaluate((key) => new Promise<{ queue: unknown[]; value: unknown }>((resolve, reject) => {
      const request = indexedDB.open('mathan-erp-offline', 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('records', 'readonly');
        const store = transaction.objectStore('records');
        const queueRequest = store.get('sync-queue-v1');
        const valueRequest = store.get(key);
        transaction.oncomplete = () => { database.close(); resolve({ queue: (queueRequest.result as unknown[] | undefined) ?? [], value: valueRequest.result }); };
        transaction.onerror = () => reject(transaction.error);
      };
    }), storageKey)).toMatchObject({ queue: [], value: [] });
  } finally {
    const { error } = await service.from('app_state_snapshots').update({ payload: [], revision: 1 }).eq('workspace_id', workspaceId).eq('domain', 'cash_book:books');
    if (error) throw error;
  }
});

test('durable snapshot conflict can keep the local change and synchronize it from the UI', async ({ page }) => {
  const remoteValue = [{ id: `remote-book-${Date.now()}`, name: 'Remote conflict value' }];
  const localValue = [{ id: `local-book-${Date.now()}`, name: 'Local conflict value' }];
  const { service, workspaceId, storageKey } = await seedDurableSnapshotConflict(page, remoteValue, localValue);
  try {
    await expect(page.getByRole('dialog', { name: 'Sync issue' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep my saved change' }).click();
    await expect(page.getByRole('dialog', { name: 'Sync issue' })).toHaveCount(0);
    await expect.poll(async () => {
      const { data, error } = await service.from('app_state_snapshots').select('payload').eq('workspace_id', workspaceId).eq('domain', 'cash_book:books').single();
      if (error) throw error;
      return data?.payload;
    }).toEqual([...remoteValue, ...localValue]);
    await expect.poll(() => page.evaluate(() => new Promise<unknown[]>((resolve, reject) => {
      const request = indexedDB.open('mathan-erp-offline', 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('records', 'readonly');
        const result = transaction.objectStore('records').get('sync-queue-v1');
        transaction.oncomplete = () => { database.close(); resolve((result.result as unknown[] | undefined) ?? []); };
        transaction.onerror = () => reject(transaction.error);
      };
    }))).toEqual([]);
    expect(storageKey).toContain(workspaceId);
  } finally {
    const { error } = await service.from('app_state_snapshots').update({ payload: [], revision: 1 }).eq('workspace_id', workspaceId).eq('domain', 'cash_book:books');
    if (error) throw error;
  }
});
