export type PersistenceActivityTracker = {
  track<T>(operation: Promise<T>): Promise<T>;
  waitForIdle(timeoutMs?: number): Promise<void>;
  activeCount(): number;
};

export function createPersistenceActivityTracker(): PersistenceActivityTracker {
  const active = new Set<Promise<unknown>>();
  return {
    track<T>(operation: Promise<T>) {
      active.add(operation);
      void operation.finally(() => active.delete(operation)).catch(() => undefined);
      return operation;
    },
    async waitForIdle(timeoutMs = 15_000) {
      const deadline = Date.now() + timeoutMs;
      while (active.size) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error('Timed out while finishing local saves. The app was kept open.');
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            Promise.allSettled([...active]),
            new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Timed out while finishing local saves. The app was kept open.')), remaining); }),
          ]);
        } finally {
          if (timeout) clearTimeout(timeout);
        }
      }
    },
    activeCount: () => active.size,
  };
}

export const persistenceActivity = createPersistenceActivityTracker();
