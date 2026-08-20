/** Storage helpers that keep privacy modes, quota limits, and corrupt data from crashing the app. */
export function readStorage(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function readStorageJson<T>(key: string): T | null {
  const value = readStorage(key);
  if (value === null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    // Remove corrupt values so every launch does not repeat the same failure.
    removeStorage(key);
    return null;
  }
}
