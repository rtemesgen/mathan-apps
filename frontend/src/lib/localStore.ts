const DB_NAME = 'mathan-erp-offline';
const STORE_NAME = 'records';

function getStore(mode: IDBTransactionMode) {
  return new Promise<IDBObjectStore>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
  });
}

export async function readOffline<T>(key: string): Promise<T | null> {
  try {
    const store = await getStore('readonly');
    return await new Promise<T | null>((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    const raw = localStorage.getItem(`mathan_erp_offline_${key}`);
    return raw ? JSON.parse(raw) as T : null;
  }
}

export async function writeOffline<T>(key: string, value: T): Promise<void> {
  try {
    const store = await getStore('readwrite');
    await new Promise<void>((resolve, reject) => {
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    localStorage.setItem(`mathan_erp_offline_${key}`, JSON.stringify(value));
  }
}

