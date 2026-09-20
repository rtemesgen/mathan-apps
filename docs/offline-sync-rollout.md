# Offline sync integrity rollout and rollback

This document is the release handoff for the implementation described in `docs/superpowers/plans/2026-09-19-offline-save-sync-integrity.md`.

## Deployment order

1. Apply the additive Supabase migrations first, including the Truck transaction-batch receipt migration. Do not clear SQLite, IndexedDB, localStorage, or server outboxes.
2. Run the local migration/upgrade contract, security contract, and batch receipt/idempotency tests with synthetic users for owner, editor, read-only, and unrelated workspaces.
3. The required Android CI job starts a disposable Supabase stack, seeds a synthetic owner workspace and Truck, configures the debug instrumentation build through `adb reverse`, and runs the production Truck repository through force-stop/relaunch. A client must retain grouped batches when the RPC is unavailable; it must not fall back to independent financial inserts.
4. Release the matching web/Android client only after the RPC and receipt schema are available.
5. Pilot with disposable workspaces: offline Cash Book, Payroll, and Truck edits; browser reload; Android force-stop/relaunch; reconnect; duplicate-request retry; and both conflict choices.
6. Record the exact client commit, migration version, APK/application ID, Android API level, device/emulator, test account class, server row counts, receipt counts, and local queue counts.

## Stop-ship triggers

Stop rollout and preserve the affected database/outbox if any of these occur:

- an accepted save disappears after reload or force-stop;
- a Truck batch creates only some rows, duplicates rows, or has no receipt;
- a delayed acknowledgement hides a newer local edit;
- a conflict choice discards an unrelated later edit;
- a native schema/key/read failure is converted into an empty business record;
- recovery data resurrects an older value after a newer successful save;
- attachment persistence exceeds the tested device capacity;
- an APK replacement loses records, markers, or pending mutations;
- recurring Android native-write failures or unsupported-version/schema errors appear.

## Rollback

- Prefer a forward-compatible client fix while pending grouped work remains. Do not downgrade to a client that ignores `batch_id`, batch indexes, or receipt-backed retries.
- Keep the additive receipt table and RPC during a client rollback. Do not drop migrations or delete receipts to make an older client appear healthy.
- If the new client is blocked by a structural/key failure, keep the native database and diagnostics intact. Recovery must be performed with an explicit repair build or verified export, never by regenerating a key or clearing storage.
- If a server migration is faulty before client release, stop at the migration stage and repair forward. Production reset/data cleanup is not part of this plan.

## Required evidence before declaring release complete

The release owner must attach:

- full frontend unit and browser E2E results;
- local Supabase migration/security/batch results;
- Android unit/lint/build results;
- emulator or physical-device force-stop/relaunch results with redacted logcat;
- backend-connected Android exact-once result (server rows and receipt count);
- previous-APK to new-APK replacement result using the same signing key/application ID;
- attachment-capacity result and final 16 KB APK/native-library evidence;
- unresolved limitations and mixed-client compatibility decision.

Until those artifacts exist, the implementation is an audited candidate, not a release-complete plan.
