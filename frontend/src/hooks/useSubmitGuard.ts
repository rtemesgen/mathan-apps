import { useCallback, useRef, useState } from 'react';

export function useSubmitGuard() {
  const active = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const run = useCallback(async (operation: () => void | Promise<void>) => {
    if (active.current) return false;
    active.current = true;
    setSubmitting(true);
    try { await operation(); return true; }
    finally { active.current = false; setSubmitting(false); }
  }, []);
  return { submitting, run };
}
