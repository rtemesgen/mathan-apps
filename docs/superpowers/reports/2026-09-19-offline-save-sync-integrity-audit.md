# Offline save/sync integrity implementation audit

Date: 2026-09-19  
Branch: `fix-andriod`  
Audited HEAD: `e98a40d`

This audit compares the implementation with `docs/superpowers/plans/2026-09-19-offline-save-sync-integrity.md`. A passing unit test is counted only for the behavior that test actually exercises.

## Verified complete or materially implemented

| Area | Evidence | Result |
| --- | --- | --- |
| Native SQLite operation coordination | `frontend/tests/persistence-coordinator.test.ts`; `sqliteStore.ts` wraps reads, writes, health checks, and migration transactions | Pass |
| Retryable native initialization | `retryableSingleFlight.ts`; `native-store-lifecycle.test.ts` | Pass for decision logic |
| Schema preflight and key preservation | `sqlite-migration.test.ts`; `sqliteStore.ts` uses `isDatabase()` before generating a key and rejects damaged schemas | Pass for tested logic; real encrypted-key failure remains device-gated |
| Authoritative Android reads | `localStore.ts` rejects typed native read failures and does not consult stale browser stores after native readiness | Implemented |
| Offline create/update queue semantics | `queue-policy.test.ts` and `queuePolicy.ts` preserve never-attempted creates and protect attempted mutations | Pass for policy behavior |
| Browser recovery supersession | `recoveryJournal.ts` and `localStore.ts` use v2 journal entries, same-store per-key receipts, and deletion tombstones; unit tests pass; `recovery.spec.ts` forces an IndexedDB write failure, reloads, commits a later primary value, and reloads again | Implemented and real-browser tested; cleanup-failure and full crash-stage matrix remain pending |
| Atomic Truck batch backend | `202609190001_truck_transaction_batches.sql`; `truck_batch_rpc.sql`; 63 local Supabase assertions pass, including editor/read-only/unrelated authorization, changed-identity rejection, and invalid-row rollback | Pass locally |
| Online Truck batch client path | `writeTruckTransactionBatchOnline()` and `createTruckTransactionBatch()` preserve batch identity | Implemented; backend-connected browser test remains pending |
| Queued Truck batch integrity | `truckBatchPolicy.ts` and worker group submission path | Policy and wiring implemented; end-to-end retry/cache proof remains pending |
| Snapshot keep-local conflict path | `resolveSnapshotConflict()` fetches remote state, three-way merges, allocates a new ID, and atomically replaces local layers | Implemented; UI/E2E proof remains pending |
| Android force-stop test source | `OfflineSQLiteInstrumentedTest.java` uses target package plus `am force-stop` before relaunch | Compiles; emulator execution is unverified here |

## Partial or not yet proven

| Plan requirement | Current evidence | Status |
| --- | --- | --- |
| Full browser recovery journal v2, receipts, cleanup-failure behavior | v2 journal/receipt/tombstone source, deterministic selection tests, and a real IndexedDB failure/reload/primary-commit browser test exist; cleanup-failure injection and full crash-stage matrix remain | Partially verified |
| Snapshot acknowledgement race matrix | Current worker/repository code has protections, but no deferred-RPC test proves delayed acknowledgement cannot overwrite a newer save | Missing proof |
| Truck conflict resolution | `resolveTruckConflict()` fetches the remote row, supports keep-local/use-server, and uses an updated-at race guard before atomic queue/cache replacement | Implemented; no backend-connected UI/E2E proof yet |
| Backend authorization matrix | `truck_batch_rpc.sql` exercises owner, permitted editor, read-only member, and unrelated user RPC execution paths | Pass locally for the covered batch RPC matrix; broader application policies remain outside this test |
| Backend invalid-row rollback matrix | `truck_batch_rpc.sql` proves a valid first row plus invalid second truck reference leaves zero rows and zero receipt; duplicate/reference variants beyond this case remain future coverage | Partially verified |
| Backend-connected Android sync | CI runs Android instrumentation, but the test harness still lacks a live Supabase backend and exact-once server-count verification | Unverified |
| True process-death execution | Test source now calls `am force-stop`; no emulator was available locally and CI evidence was not inspected for this HEAD | Unverified |
| Attachment capacity | Attachments remain base64 in snapshot payloads with a 5 MB UI limit; no physical-device SQLite capacity result exists | Unverified |
| 16 KB page-size release evidence | Existing artifact checks were previously recorded, but no final post-change release/device evidence is attached to this HEAD | Unverified |
| APK replacement/data preservation | No supported old-APK-to-new-APK instrumentation run is recorded | Missing |
| Deployment, rollback, mixed-client, and pilot handoff | [offline-sync-rollout.md](../../offline-sync-rollout.md) records additive order, stop-ship triggers, rollback restrictions, and required evidence; pilot/device artifacts remain pending | Documented; evidence pending |

## Verification run for this audit

- `frontend`: `npm run test:unit` — passed, including `test:local-store-recovery`.
- `frontend`: `npm run lint` — passed during the latest implementation checkpoints.
- `frontend`: `npm run test:e2e -- --grep "durable web state survives closing"` — passed with a real persistent Chromium profile and local Supabase.
- `frontend`: `npm run test:e2e -- recovery.spec.ts` — passed with forced IndexedDB failure, reload recovery, later primary commit, and reload verification.
- `backend`: `supabase db reset --local --no-seed` — applied all migrations, including the Truck batch migration.
- `backend`: `supabase test db` — passed 63 assertions across security and Truck batch RPC tests.
- `mobile/android`: `./gradlew testDebugUnitTest` — passed.
- `mobile/android`: `./gradlew compileDebugAndroidTestJavaWithJavac` — passed.
- Local `adb devices` could not start an ADB daemon in this environment; physical/emulator runtime results therefore remain unverified.

## Release decision

The branch is not ready to be marked as fully complete against the plan. The remaining items above are correctness or evidence gates, not cosmetic follow-up. In particular, do not claim that Truck conflict resolution, browser recovery v2, attachment capacity, or physical Android process-death/16 KB compatibility has passed until the specified test layer produces evidence.
