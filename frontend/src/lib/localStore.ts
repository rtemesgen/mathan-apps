import { Capacitor } from '@capacitor/core';
import { deleteNativeRecord, isJsonSerializable, listNativeRecords, migrateLegacyRecords, readNativeMetadata, readNativeRecord, writeNativeMetadata, writeNativeRecord, writeNativeRecordsAtomic } from './sqliteStore';

const DB_NAME = 'mathan-erp-offline';
const STORE_NAME = 'records';
const META_STORE_NAME = 'metadata';
const DB_VERSION = 2;
const memoryCache = new Map<string, unknown>();
const fallbackKey = (key: string) => `mathan_erp_offline_${key}`;
let nativeStoreReady: Promise<boolean> | null = null;
let writeTail: Promise<void> = Promise.resolve();

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

function queueWrite<T>(operation: () => Promise<T>) {
  const result = writeTail.then(operation, operation);
  writeTail = result.then(() => undefined, () => undefined);
  return result;
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

async function readLegacyStore(storeName: string) {
  try {
    const store = await getStore('readonly', storeName);
    const keys = await new Promise<string[]>((resolve, reject) => {
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(request.result.map(String));
      request.onerror = () => reject(request.error);
    });
    const entries: Array<{ key: string; value: unknown }> = [];
    for (const key of keys) {
      const currentStore = await getStore('readonly', storeName);
      const value = await new Promise<unknown>((resolve, reject) => {
        const request = currentStore.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      entries.push({ key, value });
    }
    return entries;
  } catch {
    return null;
  }
}

async function readLegacyLocalStorage() {
  const entries: Array<{ key: string; value: unknown }> = [];
  try {
    for (const key of Object.keys(localStorage).filter((item) => item.startsWith('mathan_erp_offline_'))) {
      const value = readFallback(key.slice('mathan_erp_offline_'.length));
      if (value !== null) entries.push({ key: key.slice('mathan_erp_offline_'.length), value });
    }
  } catch { /* localStorage may be unavailable */ }
  return entries;
}

async function getNativeStoreReady() {
  if (!Capacitor.isNativePlatform()) return false;
  nativeStoreReady ??= (async () => {
    const [records, metadata, localStorageRecords] = await Promise.all([
      readLegacyStore(STORE_NAME),
      readLegacyStore(META_STORE_NAME),
      readLegacyLocalStorage(),
    ]);
    if (records === null || metadata === null) return false;
    try {
      const mergedRecords = new Map(records.map((entry) => [entry.key, entry]));
      // A fallback entry exists because an IndexedDB write failed; it is the
      // newest value and must win if both stores contain the same key.
      localStorageRecords.forEach((entry) => mergedRecords.set(entry.key, entry));
      await migrateLegacyRecords([...mergedRecords.values()], metadata);
      return true;
    } catch {
      // Keep IndexedDB active until a complete verified migration succeeds.
      return false;
    }
  })().catch(() => false);
  return nativeStoreReady;
}

async function writeIndexedDb<T>(key: string, value: T): Promise<void> {
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
}

async function deleteIndexedDb(key: string): Promise<void> {
  const store = await getStore('readwrite');
  await new Promise<void>((resolve, reject) => {
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function readOffline<T>(key: string): Promise<T | null> {
  if (memoryCache.has(key)) return memoryCache.get(key) as T;
  try {
    if (await getNativeStoreReady()) {
      const nativeValue = await readNativeRecord<T>(key);
      if (nativeValue !== null) { memoryCache.set(key, nativeValue); return nativeValue; }
    }
    const store = await getStore('readonly');
    return await new Promise<T | null>((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        // A previous IndexedDB failure may have placed the newest value in the
        // fallback store. Prefer it whenever present: IndexedDB may still have
        // the older value because the failed write left that record untouched.
        const fallback = readFallback<T>(key);
        const value = fallback ?? (request.result as T | undefined) ?? null;
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
  return queueWrite(async () => {
    try {
      if (isJsonSerializable(value) && await getNativeStoreReady()) {
        await writeNativeRecord(key, value);
        removeFallback(key);
        return;
      }
      await writeIndexedDb(key, value);
      removeFallback(key);
    } catch {
      try { await writeIndexedDb(key, value); removeFallback(key); }
      catch { localStorage.setItem(fallbackKey(key), JSON.stringify(value)); }
    }
  });
}

export async function deleteOffline(key: string): Promise<void> {
  memoryCache.delete(key);
  return queueWrite(async () => {
    removeFallback(key);
    try { if (await getNativeStoreReady()) await deleteNativeRecord(key); } catch { /* continue with legacy stores */ }
    try { await deleteIndexedDb(key); } catch { /* fallback was already removed */ }
  });
}

export async function listOfflineKeys(): Promise<string[]> {
  const nativeKeys = await (async () => { try { return await (await getNativeStoreReady()) ? listNativeRecords() : []; } catch { return []; } })();
  try {
    const store = await getStore('readonly');
    const indexedKeys = await new Promise<string[]>((resolve, reject) => {
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(request.result.map(String));
      request.onerror = () => reject(request.error);
    });
    const fallbackKeys = Object.keys(localStorage).filter((key) => key.startsWith('mathan_erp_offline_')).map((key) => key.slice('mathan_erp_offline_'.length));
    return [...new Set([...nativeKeys, ...indexedKeys, ...fallbackKeys])];
  } catch {
    return [...new Set([...nativeKeys, ...Object.keys(localStorage).filter((key) => key.startsWith('mathan_erp_offline_')).map((key) => key.slice('mathan_erp_offline_'.length))])];
  }
}

/** Atomically persist related cache records (for example an entity and its queue entry). */
export async function writeOfflineAtomic(entries: Array<{ key: string; value: unknown }>): Promise<void> {
  entries.forEach(({ key, value }) => memoryCache.set(key, value));
  return queueWrite(async () => {
    try {
      if (entries.every(({ value }) => isJsonSerializable(value)) && await getNativeStoreReady()) {
        await writeNativeRecordsAtomic(entries);
        entries.forEach(({ key }) => removeFallback(key));
        return;
      }
      const database = await getDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        entries.forEach(({ key, value }) => store.put(value, key));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error ?? new Error('Offline cache transaction aborted'));
      });
      entries.forEach(({ key }) => removeFallback(key));
    } catch {
      try { entries.forEach(({ key, value }) => localStorage.setItem(fallbackKey(key), JSON.stringify(value))); } catch { /* storage is unavailable */ }
    }
  });
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
  try { if (await getNativeStoreReady()) { const value = await readNativeMetadata<T>(key); if (value !== null) return value; } } catch { /* continue with IndexedDB */ }
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
  try { if (isJsonSerializable(value) && await getNativeStoreReady()) { await writeNativeMetadata(key, value); return; } } catch { /* continue with IndexedDB */ }
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

/** Shared storage contract used by repositories and synchronization. The implementation selects encrypted SQLite on Android and IndexedDB/localStorage fallback on web. */
export interface OfflineStore {
  read<T>(key: string): Promise<T | null>;
  write<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  listKeys(): Promise<string[]>;
  readMetadata<T>(key: string): Promise<T | null>;
  writeMetadata<T>(key: string, value: T): Promise<void>;
  writeAtomic(entries: Array<{ key: string; value: unknown }>): Promise<void>;
}

export const offlineStore: OfflineStore = {
  read: <T,>(key: string) => readOffline<T>(key),
  write: <T,>(key: string, value: T) => writeOffline(key, value),
  delete: (key: string) => deleteOffline(key),
  listKeys: () => listOfflineKeys(),
  readMetadata: <T,>(key: string) => readOfflineMetadata<T>(key),
  writeMetadata: <T,>(key: string, value: T) => writeOfflineMetadata(key, value),
  writeAtomic: (entries) => writeOfflineAtomic(entries),
};
