import { useAsyncAction } from './useAsyncAction';

/** @deprecated Use useAsyncAction for new forms. Kept while existing forms migrate. */
export function useSubmitGuard() {
  const { busy, run, runAction } = useAsyncAction();
  return { submitting: busy, run, runAction };
}
