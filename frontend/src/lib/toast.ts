import type { PersistenceNotice } from './repositories/types';

export type ToastEvent =
  | { kind: 'message'; message: string; tone?: ToastTone }
  | { kind: 'persistence'; notice: PersistenceNotice };

export type ToastTone = 'success' | 'error' | 'info';

export function emitToast(event: ToastEvent) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<ToastEvent>('mathan:toast', { detail: event }));
  }
}
