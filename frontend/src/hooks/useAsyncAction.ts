import { useCallback, useRef, useState } from 'react';

export type AsyncActionOptions<T> = {
  onSuccess?: (value: T) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
};

/** Shared lifecycle for every save/delete form: one active operation, one loading state. */
export function useAsyncAction() {
  const active = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async <T,>(operation: () => T | Promise<T>, options: AsyncActionOptions<T> = {}) => {
    if (active.current) return undefined;
    active.current = true;
    setBusy(true);
    try {
      const value = await operation();
      await options.onSuccess?.(value);
      return value;
    } catch (error) {
      await options.onError?.(error);
      throw error;
    } finally {
      active.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, run };
}
