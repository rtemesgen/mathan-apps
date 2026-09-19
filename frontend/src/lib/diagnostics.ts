export type DiagnosticValue = string | number | boolean | null;
export type DiagnosticEvent = { at: string; event: string; details: Record<string, DiagnosticValue> };

const STORAGE_KEY = 'mathan_erp_diagnostics_v1';
const MAX_EVENTS = 500;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ALLOWED_KEYS = new Set([
  'adapter', 'schemaVersion', 'formatVersion', 'mutationId', 'batchId', 'entityType', 'operation',
  'localSequence', 'queueGeneration', 'attemptId', 'baseRevision', 'acknowledgedRevision',
  'retryCount', 'conflictState', 'outcomeCode', 'durationMs', 'count', 'pendingCount',
  'conflictCount', 'errorCode', 'healthy', 'expectedVersion', 'actualVersion', 'workspaceCount',
  'mutationCount', 'recoveredMutationCount', 'recoveredRecordCount', 'selectedWorkspaces',
  'restoredWorkspaces', 'attachments', 'diagnostics', 'empty', 'reason', 'app', 'entity',
  'code', 'status', 'delayMs',
]);

let events: DiagnosticEvent[] = [];
let loaded = false;

function storage() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

function prune(now = Date.now()) {
  const cutoff = now - MAX_AGE_MS;
  events = events.filter((item) => Date.parse(item.at) >= cutoff).slice(-MAX_EVENTS);
}

function load() {
  if (loaded) return;
  loaded = true;
  const raw = storage()?.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) events = parsed.filter((item): item is DiagnosticEvent => Boolean(item && typeof item === 'object' && typeof (item as DiagnosticEvent).at === 'string' && typeof (item as DiagnosticEvent).event === 'string' && typeof (item as DiagnosticEvent).details === 'object'));
    prune();
  } catch { events = []; }
}

function persist() {
  try { storage()?.setItem(STORAGE_KEY, JSON.stringify(events)); } catch { /* diagnostics never block business writes */ }
}

function safeDetails(input: Record<string, unknown>) {
  const details: Record<string, DiagnosticValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (value === null || typeof value === 'boolean' || typeof value === 'number') {
      if (typeof value !== 'number' || Number.isFinite(value)) details[key] = value as DiagnosticValue;
    } else if (typeof value === 'string' && value.length <= 160) details[key] = value;
  }
  return details;
}

/** Record only bounded, allowlisted lifecycle data. Never persist payloads,
 * identities, amounts, credentials, or raw exception messages. */
export function diagnostic(event: string, details: Record<string, unknown> = {}) {
  load();
  prune();
  events.push({ at: new Date().toISOString(), event: event.slice(0, 80), details: safeDetails(details) });
  events = events.slice(-MAX_EVENTS);
  persist();
  if (import.meta.env?.DEV) console.debug(`[mathan:${event}]`, safeDetails(details));
}

export function getDiagnosticEvents() {
  load();
  prune();
  return events.map((item) => ({ at: item.at, event: item.event, details: { ...item.details } }));
}

export function clearDiagnosticEvents() {
  events = [];
  loaded = true;
  try { storage()?.removeItem(STORAGE_KEY); } catch { /* best effort */ }
}

export function exportDiagnosticEvents() {
  return JSON.stringify(getDiagnosticEvents());
}
