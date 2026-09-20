type BatchMember = {
  mutationId: string;
  companyId: string;
  table: string;
  operation: 'create' | 'update' | 'upsert' | 'delete';
  payload: Record<string, unknown>;
};

export function validateQueuedTransactionBatch<T extends BatchMember>(members: T[]) {
  if (!members.length) return { ok: false as const, reason: 'empty batch' };
  const batchIds = new Set(members.map((member) => String(member.payload.batch_id ?? '')));
  const workspaceIds = new Set(members.map((member) => member.companyId));
  const sizes = new Set(members.map((member) => Number(member.payload.batch_size)));
  const batchId = [...batchIds][0];
  const batchSize = [...sizes][0];
  const indexes = members.map((member) => Number(member.payload.batch_index));
  const expected = Array.from({ length: batchSize }, (_, index) => index);
  if (!batchId || batchIds.size !== 1 || workspaceIds.size !== 1 || sizes.size !== 1 || !Number.isInteger(batchSize) || batchSize !== members.length
    || members.some((member) => member.table !== 'truck_transactions' || member.operation !== 'create' || !member.mutationId || !member.payload.mutation_id)
    || new Set(indexes).size !== members.length || indexes.some((index) => !Number.isInteger(index))
    || indexes.slice().sort((a, b) => a - b).some((index, position) => index !== expected[position])) {
    return { ok: false as const, reason: 'batch members are incomplete or inconsistent' };
  }
  return {
    ok: true as const,
    batchId,
    batchSize,
    members: [...members].sort((left, right) => Number(left.payload.batch_index) - Number(right.payload.batch_index)),
  };
}
