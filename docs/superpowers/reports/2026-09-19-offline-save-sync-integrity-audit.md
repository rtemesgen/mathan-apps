# Offline save/sync integrity implementation audit

Date: 2026-09-19  
Branch: `fix-andriod`  
Audited HEAD: `baa4a1a`

This audit compares the implementation with `docs/superpowers/plans/2026-09-19-offline-save-sync-integrity.md`. A passing unit test is counted only for the behavior that test actually exercises.

## Verified complete or materially implemented

| Area | Evidence | Result |
| --- | --- | --- |
| Native SQLite operation coordination | `frontend/tests/persistence-coordinator.test.ts`; `sqliteStore.ts` wraps reads, writes, health checks, and migration transactions | Pass |
| Retryable native initialization | `retryableSingleFlight.ts`; `native-store-lifecycle.test.ts` | Pass for decision logic |
| Schema preflight and key preservation | `sqlite-migration.test.ts`; `sqliteStore.ts` uses `isDatabase()` before generating a key and rejects damaged schemas | Pass for tested logic; real encrypted-key failure remains device-gated |
| Authoritative Android reads | `localStore.ts` rejects typed native read failures and does not consult stale browser stores after native readiness | Implemented |
| Offline create/update queue semantics | `queue-policy.test.ts` and `queuePolicy.ts` preserve never-attempted creates and protect attempted mutations | Pass for policy behavior |
| Browser recovery supersession | `localStore.ts` removes recovery entries after successful writes | Fix implemented; full browser crash journal matrix remains partial |
| Atomic Truck batch backend | `202609190001_truck_transaction_batches.sql`; `truck_batch_rpc.sql`; 56 local Supabase assertions pass | Pass locally |
| Online Truck batch client path | `writeTruckTransactionBatchOnline()` and `createTruckTransactionBatch()` preserve batch identity | Implemented; backend-connected browser test remains pending |
| Queued Truck batch integrity | `truckBatchPolicy.ts` and worker group submission path | Policy and wiring implemented; end-to-end retry/cache proof remains pending |
| Snapshot keep-local conflict path | `resolveSnapshotConflict()` fetches remote state, three-way merges, allocates a new ID, and atomically replaces local layers | Implemented; UI/E2E proof remains pending |
| Android force-stop test source | `OfflineSQLiteInstrumentedTest.java` uses target package plus `am force-stop` before relaunch | Compiles; emulator execution is unverified here |

## Partial or not yet proven

| Plan requirement | Current evidence | Status |
| --- | --- | --- |
| Full browser recovery journal v2, receipts, cleanup-failure behavior | Only supersession cleanup is implemented; no `local-store-recovery.test.ts` or real IndexedDB crash test exists | Missing |
| Snapshot acknowledgement race matrix | Current worker/repository code has protections, but no deferred-RPC test proves delayed acknowledgement cannot overwrite a newer save | Missing proof |
| Truck conflict resolution | `resolveTruckConflict()` fetches the remote row, supports keep-local/use-server, and uses an updated-at race guard before atomic queue/cache replacement | Implemented; no backend-connected UI/E2E proof yet |
| Backend authorization matrix | RPC contract tests cover the local owner path and privilege boundary; authenticated editor/read-only/unrelated-user RPC execution tests are not present | Incomplete |
| Backend invalid-row rollback matrix | RPC has validation and is transaction-bound, but the requested valid-row-plus-invalid-row and duplicate/reference scenarios are not all tested | Incomplete |
| Backend-connected Android sync | CI runs Android instrumentation, but the test harness still lacks a live Supabase backend and exact-once server-count verification | Unverified |
| True process-death execution | Test source now calls `am force-stop`; no emulator was available locally and CI evidence was not inspected for this HEAD | Unverified |
| Attachment capacity | Attachments remain base64 in snapshot payloads with a 5 MB UI limit; no physical-device SQLite capacity result exists | Unverified |
| 16 KB page-size release evidence | Existing artifact checks were previously recorded, but no final post-change release/device evidence is attached to this HEAD | Unverified |
| APK replacement/data preservation | No supported old-APK-to-new-APK instrumentation run is recorded | Missing |
| Deployment, rollback, mixed-client, and pilot handoff | [offline-sync-rollout.md](../../offline-sync-rollout.md) records additive order, stop-ship triggers, rollback restrictions, and required evidence; pilot/device artifacts remain pending | Documented; evidence pending |

## Verification run for this audit

- `frontend`: `npm run test:unit` — passed.
- `frontend`: `npm run lint` — passed during the latest implementation checkpoints.
- `backend`: `supabase db reset --local --no-seed` — applied all migrations, including the Truck batch migration.
- `backend`: `supabase test db` — passed 56 assertions across security and Truck batch RPC tests.
- `mobile/android`: `./gradlew testDebugUnitTest` — passed.
- `mobile/android`: `./gradlew compileDebugAndroidTestJavaWithJavac` — passed.
- Local `adb devices` could not start an ADB daemon in this environment; physical/emulator runtime results therefore remain unverified.

## Release decision

The branch is not ready to be marked as fully complete against the plan. The remaining items above are correctness or evidence gates, not cosmetic follow-up. In particular, do not claim that Truck conflict resolution, browser recovery v2, attachment capacity, or physical Android process-death/16 KB compatibility has passed until the specified test layer produces evidence.
