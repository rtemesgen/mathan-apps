import type { PersistenceNotice } from './repositories/types';

export type ToastEvent =
  | { kind: 'message'; message: string; tone?: ToastTone }
  | { kind: 'persistence'; notice: PersistenceNotice };

export type ToastTone = 'success' | 'error' | 'info';
export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'retry' | 'conflicted' | 'error';
export type SyncConflictDetail = { domain: string; remote: unknown; revision: number; mutationId: string };

export function emitToast(event: ToastEvent) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<ToastEvent>('mathan:toast', { detail: event }));
  }
}

export function emitSyncStatus(status: SyncStatus, queued?: number, detail: Record<string, unknown> = {}) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('mathan:sync-status', { detail: { status, queued, ...detail } }));
}

export function emitSyncConflict(detail: SyncConflictDetail) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<SyncConflictDetail>('mathan:sync-conflict', { detail }));
}
