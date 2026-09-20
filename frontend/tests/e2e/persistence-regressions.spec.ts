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

async function seedTruckConflict(page: import('playwright/test').Page) {
  const status = localSupabaseStatus();
  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: users, error: usersError } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) throw usersError;
  const admin = (users.users as Array<{ id: string; email?: string }>).find((user) => user.email === 'admin@mathan-e2e.local');
  expect(admin).toBeTruthy();
  const { data: workspace, error: workspaceError } = await service.from('workspaces').select('id').eq('name', 'Admin Company').single();
  if (workspaceError || !workspace) throw workspaceError ?? new Error('Admin Company fixture is missing.');
  const { data: truck, error: truckError } = await service.from('trucks').select('id').eq('workspace_id', workspace.id).limit(1).single();
  if (truckError || !truck) throw truckError ?? new Error('Truck fixture is missing.');
  const transactionId = crypto.randomUUID();
  const remoteDescription = `Truck remote conflict ${Date.now()}`;
  const localDescription = `${remoteDescription} local`;
  const { data: inserted, error: insertError } = await service.from('truck_transactions').insert({
    id: transactionId,
    workspace_id: workspace.id,
    truck_id: truck.id,
    occurred_on: '2026-09-20',
    transaction_type: 'INCOME',
    category: 'Conflict test',
    amount: 111,
    description: remoteDescription,
  }).select('*').single();
  if (insertError || !inserted) throw insertError ?? new Error('Could not seed Truck conflict row.');

  await signIn(page, 'admin');
  await page.goto('/truck');
  await expect(page.getByText('DASHBOARD')).toBeVisible();
  const storageKey = `truck:${admin!.id}:${workspace.id}`;
  const mutationId = crypto.randomUUID();
  const updatedAt = new Date().toISOString();
  const localPayload = { ...inserted, amount: 222, description: localDescription, mutation_id: mutationId };
  const mutation = {
    formatVersion: 2,
    id: mutationId,
    mutationId,
    userId: admin!.id,
    companyId: workspace.id,
    entityType: 'truck_transactions',
    entityId: transactionId,
    table: 'truck_transactions',
    operation: 'update',
    payload: localPayload,
    queuedAt: updatedAt,
    updatedAt,
    baseServerUpdatedAt: inserted.updated_at,
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

  await page.evaluate(({ storageKey: key, transactionId: id, localPayload: payload, queued }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('mathan-erp-offline', 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('records', 'readwrite');
      const store = transaction.objectStore('records');
      const cacheRequest = store.get(key);
      cacheRequest.onsuccess = () => {
        const cache = (cacheRequest.result ?? { trucks: [], owners: [], customers: [], transactions: [] }) as { trucks: unknown[]; owners: unknown[]; customers: unknown[]; transactions: Array<Record<string, unknown>> };
        store.put({ ...cache, transactions: cache.transactions.map((row) => row.id === id ? { ...row, amount: payload.amount, description: payload.description } : row) }, key);
        store.put([queued], 'sync-queue-v1');
        store.put({ formatVersion: 2, queueGeneration: 1, nextLocalSequence: 2 }, 'sync-queue-meta-v2');
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
      cacheRequest.onerror = () => reject(cacheRequest.error);
    };
  }), { storageKey, transactionId, localPayload, queued: mutation });

  await page.evaluate(({ mutationId: id, workspaceId }) => {
    window.dispatchEvent(new CustomEvent('mathan:open-sync-issue', {
      detail: { table: 'truck_transactions', entityId: 'truck-conflict', mutationId: id, state: 'needs_attention', workspaceId, operation: 'update', updatedAt: new Date().toISOString(), message: 'Truck conflict test' },
    }));
  }, { mutationId, workspaceId: workspace.id });

  return { service, workspaceId: workspace.id, transactionId, remoteDescription, localDescription, storageKey };
}

test('Truck conflict can use the current server row from the production UI', async ({ page }) => {
  const { service, workspaceId, transactionId, remoteDescription, localDescription, storageKey } = await seedTruckConflict(page);
  try {
    await expect(page.getByRole('dialog', { name: 'Sync issue' })).toBeVisible();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Use server version' }).click();
    await expect(page.getByRole('dialog', { name: 'Sync issue' })).toHaveCount(0);
    await expect.poll(async () => {
      const { data, error } = await service.from('truck_transactions').select('amount,description').eq('id', transactionId).single();
      if (error) throw error;
      return data;
    }).toEqual({ amount: 111, description: remoteDescription });
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
    expect(localDescription).not.toBe(remoteDescription);
  } finally {
    await service.from('truck_transactions').delete().eq('id', transactionId);
  }
});

test('Truck conflict can keep local changes against a fresh server timestamp from the production UI', async ({ page }) => {
  const { service, transactionId, remoteDescription, localDescription } = await seedTruckConflict(page);
  try {
    await expect(page.getByRole('dialog', { name: 'Sync issue' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep my saved change' }).click();
    await expect(page.getByRole('dialog', { name: 'Sync issue' })).toHaveCount(0);
    await expect.poll(async () => {
      const { data, error } = await service.from('truck_transactions').select('amount,description').eq('id', transactionId).single();
      if (error) throw error;
      const queue = await page.evaluate(() => new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open('mathan-erp-offline', 2);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('records', 'readonly');
          const result = transaction.objectStore('records').get('sync-queue-v1');
          transaction.oncomplete = () => { database.close(); resolve(result.result); };
          transaction.onerror = () => reject(transaction.error);
        };
      }));
      return { data, queue };
    }).toEqual({ data: { amount: 222, description: localDescription }, queue: [] });
    expect(localDescription).not.toBe(remoteDescription);
  } finally {
    await service.from('truck_transactions').delete().eq('id', transactionId);
  }
});

test('two browser clients surface and resolve a Truck edit conflict without losing the local change', async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const status = localSupabaseStatus();
  const baseURL = testInfo.project.use.baseURL as string;
  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const originalDescription = `Two-client conflict ${Date.now()}`;
  const localDescription = `${originalDescription} local`;
  const remoteDescription = `${originalDescription} remote`;
  const { data: workspace, error: workspaceError } = await service.from('workspaces').select('id').eq('name', 'Admin Company').single();
  if (workspaceError || !workspace) throw workspaceError ?? new Error('Admin Company fixture is missing.');
  const { data: truck, error: truckError } = await service.from('trucks').select('id').eq('workspace_id', workspace.id).limit(1).single();
  if (truckError || !truck) throw truckError ?? new Error('Truck fixture is missing.');
  const transactionId = crypto.randomUUID();
  const { error: insertError } = await service.from('truck_transactions').insert({
    id: transactionId,
    workspace_id: workspace.id,
    truck_id: truck.id,
    occurred_on: '2026-09-20',
    transaction_type: 'INCOME',
    category: 'Two-client conflict test',
    amount: 111,
    description: originalDescription,
  });
  if (insertError) throw insertError;

  const contextA = await browser.newContext({ baseURL });
  const contextB = await browser.newContext({ baseURL });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  pageA.setDefaultTimeout(15_000);
  pageB.setDefaultTimeout(15_000);
  try {
    await signIn(pageA, 'admin');
    await signIn(pageB, 'admin');
    for (const page of [pageA, pageB]) {
      await page.goto('/truck');
      await expect(page.getByText('DASHBOARD')).toBeVisible();
      await page.getByRole('button', { name: /TRUCK EQUITY/ }).click();
      await page.getByRole('button', { name: 'Cash Report (Flow)', exact: true }).click();
      await expect(page.getByText(originalDescription, { exact: true })).toBeVisible();
    }

    // Client A accepts a local edit while disconnected.
    await setE2EOffline(contextA, status.API_URL);
    const localRow = pageA.locator('tr').filter({ hasText: originalDescription }).first();
    await localRow.getByRole('button', { name: 'Edit' }).click();
    const localDialog = pageA.locator('div.fixed.inset-0').filter({ hasText: 'Edit Cash / Ledger Entry' });
    await localDialog.locator('input[type=number]').fill('222');
    await localDialog.locator('input[placeholder="Details of load or repair"]').fill(localDescription);
    await localDialog.getByRole('button', { name: 'Record Entry' }).click();
    await expect(pageA.getByText(localDescription, { exact: true })).toBeVisible();

    // Client B independently commits a newer server edit while online.
    const remoteRow = pageB.locator('tr').filter({ hasText: originalDescription }).first();
    await remoteRow.getByRole('button', { name: 'Edit' }).click();
    const remoteDialog = pageB.locator('div.fixed.inset-0').filter({ hasText: 'Edit Cash / Ledger Entry' });
    await remoteDialog.locator('input[type=number]').fill('333');
    await remoteDialog.locator('input[placeholder="Details of load or repair"]').fill(remoteDescription);
    await remoteDialog.getByRole('button', { name: 'Record Entry' }).click();
    await expect(pageB.getByText(remoteDescription, { exact: true })).toBeVisible();
    await expect.poll(async () => {
      const { data, error } = await service.from('truck_transactions').select('amount,description').eq('id', transactionId).single();
      if (error) throw error;
      return data;
    }).toEqual({ amount: 333, description: remoteDescription });

    // Reconnect client A. The worker must surface a conflict, not retry the
    // stale precondition silently or discard the local edit.
    await setE2EOnline(contextA, status.API_URL);
    await pageA.reload();
    await expect(pageA.getByText('DASHBOARD')).toBeVisible();
    // The reload can occur after the context-level reconnect event was
    // dispatched. Replay it after the new document has mounted so the
    // production sync listener deterministically claims the queued edit.
    await pageA.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(pageA.getByRole('dialog', { name: 'Sync issue' })).toBeVisible({ timeout: 30_000 });
    await pageA.getByRole('button', { name: 'Keep my saved change' }).click();
    await expect(pageA.getByRole('dialog', { name: 'Sync issue' })).toHaveCount(0);
    await expect.poll(async () => {
      const { data, error } = await service.from('truck_transactions').select('amount,description').eq('id', transactionId).single();
      if (error) throw error;
      return data;
    }, { timeout: 30_000 }).toEqual({ amount: 222, description: localDescription });
    await expect.poll(() => pageA.evaluate(() => new Promise<unknown[]>((resolve, reject) => {
      const request = indexedDB.open('mathan-erp-offline');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('records', 'readonly');
        const result = transaction.objectStore('records').get('sync-queue-v1');
        transaction.oncomplete = () => { database.close(); resolve(Array.isArray(result.result) ? result.result : []); };
        transaction.onerror = () => reject(transaction.error);
      };
    })), { timeout: 30_000 }).toHaveLength(0);
  } finally {
    await contextA.close();
    await contextB.close();
    await service.from('truck_transactions').delete().eq('id', transactionId);
  }
});
