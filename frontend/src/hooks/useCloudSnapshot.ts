import { syncQueue } from '../lib/offlineSync';
import { useSnapshotRepository, type SnapshotPersistenceStatus } from '../lib/repositories/useSnapshotRepository';
import type { PersistenceState } from '../lib/repositories/types';

export { syncQueue } from '../lib/offlineSync';

export type { SnapshotPersistenceStatus } from '../lib/repositories/useSnapshotRepository';
export const useCloudSnapshot = useSnapshotRepository;
