import { useAsyncAction } from './useAsyncAction';

/** @deprecated Use useAsyncAction for new forms. Kept while existing forms migrate. */
export function useSubmitGuard() {
  const { busy, run } = useAsyncAction();
  return { submitting: busy, run };
}
