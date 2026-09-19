export type TruckBatchRequestRow = {
  id?: unknown;
  mutation_id?: unknown;
};

export type TruckBatchResponse = {
  status?: unknown;
  batch_id?: unknown;
  rows?: unknown;
};

/**
 * Validate the server receipt before a grouped Truck mutation is removed from
 * the durable queue. The server response is authoritative only when it
 * accounts for every requested row under the same batch and mutation IDs.
 */
export function validateTruckBatchResponse(
  batchId: string,
  requestedRows: TruckBatchRequestRow[],
  response: TruckBatchResponse,
) {
  if (response.batch_id !== batchId) throw new Error('Truck batch identity mismatch in server response.');
  if (!Array.isArray(response.rows)) throw new Error('Truck batch response did not include accepted rows.');
  if (response.rows.length !== requestedRows.length) throw new Error('Truck batch response row count does not match the request.');

  const requested = new Map<string, string>();
  for (const row of requestedRows) {
    const id = String(row.id ?? '');
    const mutationId = String(row.mutation_id ?? '');
    if (!id || !mutationId || requested.has(id)) throw new Error('Truck batch request contains duplicate or missing row identities.');
    requested.set(id, mutationId);
  }

  const seen = new Set<string>();
  for (const rawRow of response.rows) {
    if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) throw new Error('Truck batch response contains an invalid row.');
    const row = rawRow as Record<string, unknown>;
    const id = String(row.id ?? '');
    const mutationId = String(row.last_mutation_id ?? '');
    if (!requested.has(id) || seen.has(id)) throw new Error('Truck batch response contains an unexpected or duplicate row identity.');
    if (requested.get(id) !== mutationId) throw new Error('Truck batch response mutation identity mismatch.');
    seen.add(id);
  }
  if (seen.size !== requested.size) throw new Error('Truck batch response is missing a requested row.');
  return response.rows as Array<Record<string, unknown>>;
}
