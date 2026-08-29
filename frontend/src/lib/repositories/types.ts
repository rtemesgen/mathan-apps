import { emitToast } from '../toast';

export type PersistenceState =
  | 'saving'
  | 'saved'
  | 'saved locally'
  | 'offline saved'
  | 'sync pending'
  | 'load error'
  | 'storage error'
  | 'sync conflict';

export type RepositoryResult<T> = {
  data: T;
  persistence: PersistenceState;
};

export type PersistenceNotice = {
  app: 'cash_book' | 'payroll' | 'truck';
  state: PersistenceState;
  message?: string;
};

export const persistenceLabels: Record<PersistenceState, string> = {
  saving: 'Saving…',
  saved: 'Saved',
  'saved locally': 'Saved on this device · Syncing…',
  'offline saved': 'Saved offline · Will sync when online',
  'sync pending': 'Saved on this device · Sync pending',
  'load error': 'Could not refresh server data · Cached data retained',
  'storage error': 'Could not save locally · Please try again',
  'sync conflict': 'Sync conflict · Local data retained',
};

export function persistenceStateForEnvironment(): Extract<PersistenceState, 'saved' | 'offline saved'> {
  return typeof navigator !== 'undefined' && navigator.onLine ? 'saved' : 'offline saved';
}

export function reportPersistenceNotice(notice: PersistenceNotice) {
  emitToast({ kind: 'persistence', notice });
}
