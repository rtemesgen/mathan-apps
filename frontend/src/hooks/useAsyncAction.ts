import { useCallback, useRef, useState } from 'react';
import { emitToast } from '../lib/toast';
import { persistenceActivity } from '../lib/persistenceActivity';

export type AsyncActionOptions<T> = {
  onSuccess?: (value: T) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
};

export type AsyncActionConfig<T> = AsyncActionOptions<T> & {
  operation: () => T | Promise<T>;
  successMessage?: string | ((value: T) => string);
  errorMessage?: string | ((error: unknown) => string);
};

export function createActionGate() {
  let active = false;

  const run = async <T,>(operation: () => T | Promise<T>) => {
    if (active) return undefined;
    active = true;
    try {
      return await persistenceActivity.track(Promise.resolve().then(operation));
    } finally {
      active = false;
    }
  };

  return { run, isActive: () => active };
}

/** Shared lifecycle for every save/delete form: one active operation, one loading state. */
export function useAsyncAction() {
  const gate = useRef(createActionGate());
  const [busy, setBusy] = useState(false);

  const run = useCallback(async <T,>(operation: () => T | Promise<T>, options: AsyncActionOptions<T> = {}) => {
    if (gate.current.isActive()) return undefined;
    setBusy(true);
    try {
      const value = await gate.current.run(operation);
      await options.onSuccess?.(value);
      return value;
    } catch (error) {
      await options.onError?.(error);
      throw error;
    } finally {
      setBusy(false);
    }
  }, []);

  const runAction = useCallback(async <T,>(config: AsyncActionConfig<T>) => {
    const successMessage = (value: T) => typeof config.successMessage === 'function' ? config.successMessage(value) : config.successMessage ?? 'Saved successfully.';
    const errorMessage = (error: unknown) => typeof config.errorMessage === 'function' ? config.errorMessage(error) : config.errorMessage;
    return run(config.operation, {
      onSuccess: async (value) => {
        const message = successMessage(value);
        if (message) emitToast({ kind: 'message', message, tone: 'success' });
        await config.onSuccess?.(value);
      },
      onError: async (error) => {
        const message = errorMessage(error);
        if (message) emitToast({ kind: 'message', message, tone: 'error' });
        await config.onError?.(error);
      },
    });
  }, [run]);

  return { busy, submitting: busy, run, runAction };
}
