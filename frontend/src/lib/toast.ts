import type { PersistenceNotice } from './repositories/types';

export type ToastEvent =
  | { kind: 'message'; message: string; tone?: ToastTone }
  | { kind: 'persistence'; notice: PersistenceNotice };

export type ToastTone = 'success' | 'error' | 'info';
export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'retry' | 'conflicted' | 'error';
export type SyncConflictDetail = { domain: string; remote: unknown; revision: number; mutationId: string };
export type SyncIssueDetail = { table: string; entityId: string; mutationId: string; state: 'needs_attention'; message?: string; updatedAt?: string; workspaceId?: string; operation?: 'create' | 'update' | 'upsert' | 'delete' };
export type SyncProgressDetail = { workspaceId?: string; total: number; completed: number; pending: number; errors: number; status: SyncStatus };

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

export function emitSyncIssue(detail: SyncIssueDetail) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<SyncIssueDetail>('mathan:open-sync-issue', { detail }));
}

export function emitSyncProgress(detail: SyncProgressDetail) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<SyncProgressDetail>('mathan:sync-progress', { detail }));
}
