export type PersistenceState =
  | 'saving'
  | 'saved locally'
  | 'offline saved'
  | 'sync pending'
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

export function persistenceStateForEnvironment(): Extract<PersistenceState, 'saved locally' | 'offline saved'> {
  return typeof navigator !== 'undefined' && navigator.onLine ? 'saved locally' : 'offline saved';
}

export function reportPersistenceNotice(notice: PersistenceNotice) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mathan:persistence-status', { detail: notice }));
  }
}
