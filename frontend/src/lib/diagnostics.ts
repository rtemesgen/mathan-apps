type DiagnosticValue = string | number | boolean | null;

/** Development-only lifecycle diagnostics. Never pass business payloads or secrets. */
export function diagnostic(event: string, details: Record<string, DiagnosticValue> = {}) {
  if (import.meta.env?.DEV) console.debug(`[mathan:${event}]`, details);
}
