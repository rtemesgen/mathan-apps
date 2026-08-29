function isCryptoKey(value: unknown) {
  return typeof CryptoKey !== 'undefined' && value instanceof CryptoKey;
}

function isPlainObject(value: object) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Only plain JSON records belong in SQLite. CryptoKey and other clone-only values stay in IndexedDB. */
export function isJsonSafe(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || isCryptoKey(value)) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.every((item) => isJsonSafe(item, seen));
    if (!isPlainObject(value)) return false;
    // JSON.stringify intentionally omits undefined object properties. Optional
    // fields are common in persisted business records, so accepting them keeps
    // the object on SQLite while producing the same canonical JSON that will be
    // read after restart. Undefined array entries remain rejected because JSON
    // would change their meaning to null.
    return Object.values(value).every((item) => item === undefined || isJsonSafe(item, seen));
  } finally {
    // `seen` represents the active recursion path, not every object visited.
    // JSON can safely serialize the same object from multiple sibling paths;
    // only a reference back into the current path is a real cycle.
    seen.delete(value);
  }
}

export function jsonValue(value: unknown): string | null {
  if (!isJsonSafe(value)) return null;
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? null : serialized;
  } catch {
    return null;
  }
}

export async function jsonHash(value: unknown) {
  const serialized = jsonValue(value);
  if (serialized === null) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isJsonSerializable(value: unknown) {
  return jsonValue(value) !== null;
}
