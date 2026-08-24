const DB_NAME = 'mathan-erp-offline';
const STORE_NAME = 'records';
const META_STORE_NAME = 'metadata';
const DB_VERSION = 2;
const memoryCache = new Map<string, unknown>();
const fallbackKey = (key: string) => `mathan_erp_offline_${key}`;

function readFallback<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(fallbackKey(key));
    return raw === null ? null : JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function removeFallback(key: string) {
  try { localStorage.removeItem(fallbackKey(key)); } catch { /* localStorage may be disabled */ }
}

function getDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
      if (!database.objectStoreNames.contains(META_STORE_NAME)) database.createObjectStore(META_STORE_NAME);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function getStore(mode: IDBTransactionMode, storeName = STORE_NAME) {
  return getDatabase().then((database) => database.transaction(storeName, mode).objectStore(storeName));
}

export async function readOffline<T>(key: string): Promise<T | null> {
  if (memoryCache.has(key)) return memoryCache.get(key) as T;
  try {
    const store = await getStore('readonly');
    return await new Promise<T | null>((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        // A previous IndexedDB failure may have placed the newest value in the
        // fallback store. Do not mistake a missing IDB record for missing data.
        const value = (request.result as T | undefined) ?? readFallback<T>(key);
        if (value !== null) memoryCache.set(key, value);
        resolve(value);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return readFallback<T>(key);
  }
}

export async function writeOffline<T>(key: string, value: T): Promise<void> {
  memoryCache.set(key, value);
  try {
    const database = await getDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Offline write aborted'));
    });
    removeFallback(key);
  } catch {
    localStorage.setItem(fallbackKey(key), JSON.stringify(value));
  }
}

export async function deleteOffline(key: string): Promise<void> {
  memoryCache.delete(key);
  // Always clear the fallback too: it may contain a value from an earlier IDB
  // outage even when IndexedDB is healthy again.
  removeFallback(key);
  try {
    const store = await getStore('readwrite');
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch { /* fallback was already removed */ }
}

export async function listOfflineKeys(): Promise<string[]> {
  try {
    const store = await getStore('readonly');
    const indexedKeys = await new Promise<string[]>((resolve, reject) => {
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(request.result.map(String));
      request.onerror = () => reject(request.error);
    });
    const fallbackKeys = Object.keys(localStorage).filter((key) => key.startsWith('mathan_erp_offline_')).map((key) => key.slice('mathan_erp_offline_'.length));
    return [...new Set([...indexedKeys, ...fallbackKeys])];
  } catch {
    return Object.keys(localStorage).filter((key) => key.startsWith('mathan_erp_offline_')).map((key) => key.slice('mathan_erp_offline_'.length));
  }
}

/** Atomically persist related cache records (for example an entity and its queue entry). */
export async function writeOfflineAtomic(entries: Array<{ key: string; value: unknown }>): Promise<void> {
  entries.forEach(({ key, value }) => memoryCache.set(key, value));
  try {
    const database = await getDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      entries.forEach(({ key, value }) => store.put(value, key));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Offline cache transaction aborted'));
    });
  } catch {
    try { entries.forEach(({ key, value }) => localStorage.setItem(`mathan_erp_offline_${key}`, JSON.stringify(value))); } catch { /* storage is unavailable */ }
  }
}

export async function clearOfflinePrefix(prefix: string): Promise<number> {
  const keys = (await listOfflineKeys()).filter((key) => key.startsWith(prefix));
  await Promise.all(keys.map((key) => deleteOffline(key)));
  return keys.length;
}

export async function resetUserOfflineCache(userId: string): Promise<number> {
  const keys = await listOfflineKeys();
  const targets = keys.filter((key) => key.startsWith(`${userId}:`) || key.startsWith(`truck:${userId}:`) || key === `workspace:${userId}` || key === `workspaces:${userId}:` || key.startsWith(`permissions:${userId}`));
  await Promise.all(targets.map((key) => deleteOffline(key)));
  return targets.length;
}

export async function readOfflineMetadata<T>(key: string): Promise<T | null> {
  try {
    const store = await getStore('readonly', META_STORE_NAME);
    return await new Promise<T | null>((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch { return null; }
}

export async function writeOfflineMetadata<T>(key: string, value: T): Promise<void> {
  try {
    const store = await getStore('readwrite', META_STORE_NAME);
    await new Promise<void>((resolve, reject) => {
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch { /* metadata is best effort */ }
}

export async function getOfflineStorageEstimate() {
  try { return navigator.storage?.estimate ? await navigator.storage.estimate() : null; } catch { return null; }
}

export function clearOfflineMemory() { memoryCache.clear(); }
