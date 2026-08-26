/** Errors that mean the request could not reliably reach Supabase. */
export function isConnectivityFailure(error: unknown): boolean {
  const candidate = error as { name?: string; code?: string; status?: number; message?: string } | null;
  if (candidate?.name === 'AbortError') return true;
  if (typeof candidate?.status === 'number' && candidate.status >= 500) return true;
  if (['NETWORK_ERROR', 'FETCH_ERROR', 'PGRST000', 'PGRST001'].includes(candidate?.code ?? '')) return true;
  return /network|failed to fetch|fetch failed|timeout|timed out|connection|offline|load failed|service unavailable|gateway/i.test(candidate?.message ?? String(error ?? ''));
}

export function withConnectionTimeout<T>(operation: PromiseLike<T>, timeoutMs = 10000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(Object.assign(new Error('Supabase request timed out.'), { name: 'AbortError' })), timeoutMs);
    Promise.resolve(operation).then((value) => { globalThis.clearTimeout(timer); resolve(value); }, (error) => { globalThis.clearTimeout(timer); reject(error); });
  });
}
