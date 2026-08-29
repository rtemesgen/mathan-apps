/** Errors that mean the request could not reliably reach Supabase. */
export function isConnectivityFailure(error: unknown): boolean {
  const candidate = error as { name?: string; code?: string; status?: number; message?: string } | null;
  if (candidate?.name === 'AbortError') return true;
  if (typeof candidate?.status === 'number' && candidate.status >= 500) return true;
  if (['NETWORK_ERROR', 'FETCH_ERROR', 'PGRST000', 'PGRST001'].includes(candidate?.code ?? '')) return true;
  return /network|failed to fetch|fetch failed|timeout|timed out|connection|offline|load failed|service unavailable|gateway/i.test(candidate?.message ?? String(error ?? ''));
}

let backendRetryAfter = 0;

export function markBackendUnreachable(now = Date.now(), cooldownMs = 5_000) {
  backendRetryAfter = Math.max(backendRetryAfter, now + cooldownMs);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('mathan:backend-reachability', { detail: { reachable: false, retryAfter: backendRetryAfter } }));
}

export function markBackendReachable() {
  backendRetryAfter = 0;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('mathan:backend-reachability', { detail: { reachable: true } }));
}

/** navigator.onLine describes the network interface, not whether Supabase is
 * reachable. A recent failed request temporarily opens the local-only path. */
export function canAttemptBackend(online = typeof navigator === 'undefined' ? true : navigator.onLine, now = Date.now()) {
  return online && now >= backendRetryAfter;
}

export function withConnectionTimeout<T>(operation: PromiseLike<T>, timeoutMs = 10000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      markBackendUnreachable();
      reject(Object.assign(new Error('Supabase request timed out.'), { name: 'AbortError' }));
    }, timeoutMs);
    Promise.resolve(operation).then((value) => {
      globalThis.clearTimeout(timer);
      markBackendReachable();
      resolve(value);
    }, (error) => {
      globalThis.clearTimeout(timer);
      if (isConnectivityFailure(error)) markBackendUnreachable();
      reject(error);
    });
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => markBackendReachable());
  window.addEventListener('offline', () => markBackendUnreachable());
}
