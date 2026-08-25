import { useCallback, useState } from 'react';

export type DeleteConfirmationRequest = {
  title: string;
  message: string;
  itemName?: string;
  itemDetails?: string;
  onConfirm: () => void | Promise<void>;
};

/** Shared delete lifecycle: one request at a time and close only after the operation succeeds. */
export function useDeleteConfirmation(successMessage: string) {
  const [request, setRequest] = useState<DeleteConfirmationRequest | null>(null);

  const open = useCallback((next: DeleteConfirmationRequest) => {
    setRequest(next);
  }, []);

  const close = useCallback(() => {
    setRequest(null);
  }, []);

  const confirm = useCallback(async () => {
    if (!request) return;
    await request.onConfirm();
    setRequest(null);
  }, [request]);

  return {
    request,
    open,
    close,
    confirm,
    successMessage,
  };
}
