import type { PersistenceNotice } from './repositories/types';

export type ToastEvent =
  | { kind: 'message'; message: string }
  | { kind: 'persistence'; notice: PersistenceNotice };

export function emitToast(event: ToastEvent) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<ToastEvent>('mathan:toast', { detail: event }));
  }
}
