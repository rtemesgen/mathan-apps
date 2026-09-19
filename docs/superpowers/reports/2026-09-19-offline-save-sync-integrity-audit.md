# Offline save/sync integrity implementation audit

Date: 2026-09-19  
Branch: `fix-andriod`  
Audited implementation checkpoint: `fix-andriod` after the stale-state fixes and Truck E2E assertion correction.

This audit compares the implementation with `docs/superpowers/plans/2026-09-19-offline-save-sync-integrity.md`. A passing unit test is counted only for the behavior that test actually exercises.

## Verified complete or materially implemented

| Area | Evidence | Result |
| --- | --- | --- |
| Native SQLite operation coordination | `frontend/tests/persistence-coordinator.test.ts`; `sqliteStore.ts` wraps reads, writes, health checks, and migration transactions | Pass |
| Retryable native initialization | `retryableSingleFlight.ts`; `native-store-lifecycle.test.ts` | Pass for decision logic |
| Schema preflight and key preservation | `sqlite-migration.test.ts`; `sqliteStore.ts` uses `isDatabase()` before generating a key and rejects damaged schemas | Pass for tested logic; real encrypted-key failure remains device-gated |
| Authoritative Android reads | `localStore.ts` rejects typed native read failures and does not consult stale browser stores after native readiness | Implemented |
| Offline create/update queue semantics | `queue-policy.test.ts` and `queuePolicy.ts` preserve never-attempted creates and protect attempted mutations | Pass for policy behavior |
| Browser recovery supersession | `recoveryJournal.ts` and `localStore.ts` use v2 journal entries, same-store per-key receipts, and deletion tombstones; `recovery.spec.ts` covers forced IndexedDB failure, reload recovery, later primary commit, and simulated post-commit cleanup failure | Implemented and real-browser tested; full crash-stage matrix remains pending |
| Atomic Truck batch backend | `202609190001_truck_transaction_batches.sql`; `truck_batch_rpc.sql`; 75 local Supabase assertions pass, including editor/read-only/unrelated authorization, changed-identity rejection, duplicate IDs, invalid truck/owner/customer/workspace references, and invalid-row rollback | Pass locally |
| Online Truck batch client path | `writeTruckTransactionBatchOnline()` and `createTruckTransactionBatch()` preserve batch identity | Implemented; backend-connected browser test remains pending |
| Queued Truck batch integrity | `truckBatchPolicy.ts` and worker group submission path | Policy and wiring implemented; end-to-end retry/cache proof remains pending |
| Snapshot keep-local conflict path | `resolveSnapshotConflict()` fetches remote state, three-way merges, allocates a new ID, and atomically replaces local layers; the issue sheet now stays open and reports failures | Implemented; UI/E2E proof remains pending |
| Snapshot delayed acknowledgement and revision refresh | `snapshot-sync.test.ts`, `snapshot-save.test.ts`, and `snapshot-cache-repair.test.ts` cover newer intent preservation, post-flush revision rereads, and same-ID cache repair receipts | Focused tests pass |
| Bounded diagnostics and attachment input policy | `diagnostics.test.ts` verifies redaction/retention; `attachment-policy.test.ts` verifies the 5 MB embedded limit | Pass for client policy |
| Browser create/delete and storage-failure regressions | `frontend/tests/e2e/persistence-regressions.spec.ts` verifies offline unattempted Cash Book create→delete removes local/outbox intent and leaves zero remote rows; a forced IndexedDB plus fallback-storage failure keeps the form open and emits no success | Passed against local Supabase |
| Stale asynchronous state protection | Truck refresh generations and snapshot online-resync epochs prevent older async results from overwriting newer local state; focused TypeScript and repository tests pass | Implemented; Truck browser confirmation now passes |
| Android force-stop test source | `OfflineSQLiteInstrumentedTest.java` uses target package plus `am force-stop` before relaunch; the backend scenario now queues a production Truck transaction while reachability is unavailable, restarts the process, synchronizes, and repeats the sync assertion | Compiles; emulator execution is unverified here |

## Partial or not yet proven

| Plan requirement | Current evidence | Status |
| --- | --- | --- |
| Full browser recovery journal v2, receipts, cleanup-failure behavior | v2 journal/receipt/tombstone source, deterministic selection tests, and a real browser test covering failure/reload plus post-commit cleanup failure exist; full crash-stage matrix remains | Partially verified |
| Snapshot acknowledgement race matrix | `rebaseSnapshotMutation()` now limits rebasing to never-attempted pending successors; `queue-policy.test.ts` simulates a newer durable snapshot arriving during acknowledgement and verifies revision rebasing, while attempted successors remain immutable | Queue-layer proof passes; deferred-RPC/browser matrix remains pending |
| Truck conflict resolution | `resolveTruckConflict()` fetches the remote row, supports keep-local/use-server, and uses an updated-at race guard before atomic queue/cache replacement; the issue sheet now stays open and reports failures | Implemented; no backend-connected UI/E2E proof yet |
| Backend authorization matrix | `truck_batch_rpc.sql` exercises owner, permitted editor, read-only member, and unrelated user RPC execution paths | Pass locally for the covered batch RPC matrix; broader application policies remain outside this test |
| Backend invalid-row rollback matrix | `truck_batch_rpc.sql` proves zero rows and zero receipt for invalid second-row truck references, duplicate IDs, and invalid owner/customer/workspace references | Pass locally for the covered RPC matrix |
| Backend-connected Android sync | CI now starts disposable Supabase, seeds an authenticated Truck fixture, uses `adb reverse`, and runs the production Truck repository through offline queueing, force-stop/relaunch, synchronization, and repeat-idempotency checks | CI/device evidence required |
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
- `frontend`: `npm run test:e2e -- recovery.spec.ts` — passed again with simulated post-commit localStorage cleanup failure; the matching IndexedDB receipt preserved the committed value after reload.
- `backend`: `supabase db reset --local --no-seed` — applied all migrations, including the Truck batch migration.
- `backend`: `supabase test db` — passed 75 assertions across security and Truck batch RPC tests.
- `mobile/android`: `./gradlew testDebugUnitTest` — passed.
- `mobile/android`: `./gradlew compileDebugAndroidTestJavaWithJavac` — passed.
- Local `adb devices` could not start an ADB daemon in this environment; physical/emulator runtime results therefore remain unverified.
- Full elevated browser run before the final Payroll reconnect correction: 27/28 passed. The sole failure was the ordinary Payroll process-restart server assertion; it passed in a targeted rerun after waiting for the authenticated Payroll UI before replaying `online`. The combined multimodule flow, both Cash Book/Payroll reload flows, and legacy split-Payroll migration/restart all pass in targeted reruns.
- Focused verification after the harness corrections: `npm run test:unit`, `npm run lint`, `npm run test:snapshot-sync`, `npm run test:snapshot-save`, `npm run test:truck`, `npm run build`, the affected Cash Book/Payroll regressions (2/2), the combined multimodule flow (1/1), the legacy split-Payroll migration/restart flow (1/1), and the final ordinary Payroll process-restart flow (1/1) — passed. The dedicated Truck restart and customer-projection scenarios pass.
- Fresh `npx supabase test db` passed all 75 database/security assertions. The reconnect helper now replays the online event after a persistent page reload, and restart-heavy tests have explicit cold-start budgets/selectors.
- Current release checks: `npm run build` passed and a post-build string scan found no Android instrumentation API or E2E credential material in the production bundle. `./gradlew testDebugUnitTest lintDebug assembleDebug compileDebugAndroidTestJavaWithJavac` passed; Gradle's `flatDir` messages are warnings from the generated Capacitor Cordova plugin repository, not failures.
- Latest instrumentation-source verification: `mobile`: `npm run build:instrumentation` completed; `mobile/android`: `./gradlew testDebugUnitTest lintDebug compileDebugAndroidTestJavaWithJavac` passed after adding the backend-connected offline Truck force-stop scenario. No emulator was available locally, so this remains source/build evidence rather than runtime evidence.
- Latest browser regression verification: `SUPABASE_TELEMETRY_DISABLED=true npx playwright test tests/e2e/persistence-regressions.spec.ts --trace on` passed 2/2 against disposable local Supabase.

## Release decision

The branch is not ready to be marked as fully complete against the plan. The remaining items above are correctness or evidence gates, not cosmetic follow-up. In particular, do not claim that Truck conflict resolution, browser recovery v2, attachment capacity, or physical Android process-death/16 KB compatibility has passed until the specified test layer produces evidence.
