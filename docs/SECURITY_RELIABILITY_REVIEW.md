# Security and reliability review

Reviewed: 2026-08-16

## Changes applied

- Added safe browser-storage helpers. Restricted storage, exhausted quotas, and malformed JSON now degrade safely instead of crashing application startup.
- Made offline hydration always leave its loading state, including after IndexedDB, network, or Supabase failures.
- Added accessible success, information, and error notifications. Failed saves and sync attempts are no longer silent, and errors remain visible longer.
- Removed blocking browser alerts from sharing and printing fallbacks. Clipboard messages now claim success only after a real write.
- Made company creation handle network and refresh failures without exposing raw database errors.
- Made PDF export failures explain the likely recovery action.

## Security findings

The database migrations use workspace-scoped row-level security, authenticated grants, invitation hashing, owner permission enforcement, and locked audit helpers. The frontend contains no service-role secret. No `dangerouslySetInnerHTML` or direct HTML injection was found in the maintained frontend. External invite/contact windows use `noopener,noreferrer`, and React escapes rendered user input.

Remaining risks to manage:

1. **Offline data is not encrypted at rest.** A person or malware with access to an unlocked device/browser profile may read IndexedDB/local storage. Do not put passwords, identity numbers, card data, or banking secrets in remarks or attachments. Consider an encrypted local vault protected by a device credential.
2. **Dependencies need continuous monitoring.** Run `npm audit` and dependency review in CI with automated update pull requests. Test accounting and mobile flows before major-version fixes.
3. **Content Security Policy should be deployment-specific.** Add a strict CSP at the hosting layer allowing only the app and configured Supabase project. Test OAuth, PDF workers, Capacitor, and downloads before enforcement.
4. **Backend abuse controls are needed.** Rate-limit workspace creation, invitations, backup upload, and authentication; alert on unusual bursts.
5. **Operational monitoring is needed.** Add privacy-conscious crash and sync-failure reporting. Never send payroll values, contacts, tokens, backups, or free-text remarks to telemetry.
6. **Backups need lifecycle rules.** Define retention, deletion, restore drills, and passphrase recovery expectations.

## Recommended product improvements

- Add a persistent sync panel with last cloud sync, queued changes, conflicts, and retry.
- Add an undo window after deleting a transaction, employee, or book.
- Add a restore preview listing record counts and date ranges before replacement.
- Add accountant, payroll-clerk, and read-only-auditor role templates plus permission history.
- Add duplicate detection during imports and idempotency keys for retry-safe writes.
- Add optional biometric/PIN re-lock and automatic locking after inactivity.
- Add end-to-end tests for sign-in, guest mode, company switching, offline reconnect, permissions, import/export, deletion, and restore.
- Add dialog focus trapping and keyboard accessibility tests across all modals.

## Release checklist

1. Run frontend type checking, accounting tests, production build, and dependency audit.
2. Reset local Supabase and run database contract tests.
3. Build Android debug and run unit/instrumented tests on an emulator.
4. Manually verify guest/authenticated flows, airplane-mode editing, reconnect/sync, permission denial, and restore with non-production data.
5. Confirm production environment variables, HTTPS, CSP, backup retention, telemetry redaction, and rollback procedures.
