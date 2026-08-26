import { enqueueMutationsAtomic, type QueuedMutationInput } from './syncQueue';

/**
 * Shared durable fallback contract for every business repository.
 *
 * The entity/cache records and their outbox mutations are committed together.
 * Repository-specific code supplies the canonical payload and local record
 * keys; this module owns the invariant that an accepted offline operation can
 * never be persisted without its replay instruction (or vice versa).
 */
export type DurableOfflineMutation = Omit<QueuedMutationInput, 'mutationId'> & {
  mutationId?: string;
};

export async function saveOfflineFallback(
  mutations: DurableOfflineMutation | DurableOfflineMutation[],
  records: Array<{ key: string; value: unknown }>,
) {
  const list = Array.isArray(mutations) ? mutations : [mutations];
  await enqueueMutationsAtomic(list.map((mutation) => ({ ...mutation, mutationId: mutation.mutationId ?? crypto.randomUUID() })), records);
  return 'offline saved' as const;
}
