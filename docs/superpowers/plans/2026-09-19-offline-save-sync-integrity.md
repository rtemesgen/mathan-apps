# Online/Offline Save and SQLite Integrity Implementation Plan

> **For agentic workers:** Execute this plan task by task using `superpowers:executing-plans` or `superpowers:subagent-driven-development`. Preserve the existing working-tree changes. Check off a step only after its evidence exists.

**Goal:** Fix the six reviewed persistence defects so accepted changes survive restart, synchronize without duplication, and support explicit conflict resolution.

**Architecture:** Retain encrypted Capacitor SQLite on Android, IndexedDB with recovery storage on web, and Supabase as the cloud database. Keep Cash Book/Payroll snapshots and Truck relational records. Repair queue transitions and acknowledgement boundaries; introduce one transactional, idempotent server operation for Truck transaction batches.

**Tech stack:** TypeScript, React, Capacitor SQLite 7, IndexedDB, Supabase/PostgreSQL, Node/tsx tests, Playwright, Android instrumentation.

**Spec:** The review findings and acceptance requirements below are the implementation specification. This document plans work; it does not certify fixes or authorize production database deployment.

## 1. Executive summary

**Status: implementation in progress; audited checkpoint on `fix-andriod` (2026-09-20).** This revision incorporates the user's detailed requirements supplied after the review. The branch contains implemented and tested portions of phases 0A–8, including native coordination, queue v2 metadata, atomic snapshot acknowledgement, transactional Truck batches, conflict-path wiring, and CI-backed browser/database checks. Normal-page physical Android runtime evidence now passes on `SM-N971N` (API 30), the debug previous-build→current-build replacement test preserved durable data, and CI run `35479612578` passes all required jobs. The plan remains open: 16 KB runtime evidence, the full browser race/UI matrix, signed-release APK replacement, attachment-capacity measurements, and release/pilot gates are not yet proven. Editing this document does not authorize production database deployment or data cleanup.

The most important changes are crash-safe primary/recovery selection, one durable acknowledgement boundary, and server-side atomic Truck batches. The design below defines exact algorithms and compatibility behavior, not just cleanup or retry instructions. Sections 6–20 are binding details for the phase checklists in section 5; where an earlier task summary is shorter, use those detailed contracts.

Target branch: `fix-andriod`. The September 19 review examined the working tree, including uncommitted SQLite statement, Cash Book, and CI changes. Keep those changes intact; do not reset or indiscriminately stage them.

The current application is online-first, not uniformly local-first:

- Signed-in online saves send to Supabase and then update the local cache.
- Offline/connection-failure saves commit the effective local record and outbox together.
- Cash Book and Payroll use whole-state snapshots and revision checks.
- Truck uses individual rows and `updated_at` guards.
- Android uses encrypted SQLite JSON records; web uses IndexedDB and localStorage recovery.
- Guest records remain local until explicitly imported.

The earlier SQL compatibility change is already in the working tree. Its original diagnosis is **unconfirmed**: upstream issue #670 describes parsing involving `RETURNING`, whereas the former application upsert did not include `RETURNING`, and the inspected installed parser appears to preserve that statement. Do not treat the change or a successful build as proof that the reported phone error is resolved. Capture native errors and reproduce the failing path before deciding whether to retain or revise the SQL change. Native runtime validation remains a release requirement.

### Findings and required outcomes

| ID | Reviewed defect | Required outcome | Tasks |
| --- | --- | --- | --- |
| F1 | Offline Truck create followed by edit becomes an update against a missing row | Preserve create semantics and latest contents | 2, 8 |
| F2 | Older snapshot acknowledgement overwrites newer effective local data | Confirm the server version without hiding later pending changes | 3, 8 |
| F3 | Browser atomic recovery overrides later successful IndexedDB saves | Reload returns the latest accepted value and queue | 1, 8 |
| F4 | Truck profit distribution partially commits on the server | All rows commit together; ambiguous retries never duplicate payouts | 5, 6, 8 |
| F5 | Snapshot save uses the revision from before its own queue flush | Read the current baseline after synchronization | 4, 8 |
| F6 | Keep-local conflict action retries unchanged rejected preconditions | Explicit resolution uses a fresh baseline and mutation identity | 7, 8 |

Review reproductions used actual exported functions with simulated storage/server responses. They established client control-flow defects, not the behavior of a deployed server or physical phone.

### Android-focused review findings

These extend the existing plan rather than creating a separate persistence project.

| ID | Finding | Evidence level | Owning phase |
| --- | --- | --- | --- |
| A1 | Key-based locks permit overlapping transactions on one native connection | Installed plugin wrapper reproduced rejection with a simulated bridge; Java source explicitly rejects an active transaction | 0A; strengthen existing coordination work |
| A2 | Startup executes schema creation/ready-marker SQL before checking existing schema health | Confirmed code ordering; isolated native/database reproduction remains required | 0A |
| A3 | A failed readiness promise remains cached as false until reload | Confirmed control-flow inspection | 0A |
| A4 | Parse errors/native unavailability can become missing values or legacy fallback reads | Confirmed read paths; exercise migrated-install scenarios | 0A, 1 |
| A5 | Embedded attachments enlarge whole-state and queue rows substantially | Capacity risk, not a reproduced device failure | 8; separate storage redesign only if evidence requires it |

Existing release-artifact checks found 16 KB-aligned arm64/x86_64 SQLCipher load segments and a passing APK zip-alignment check. These results apply to the inspected existing artifacts, not a future release or a device runtime. SDK/build settings match the documented Capacitor 7 baseline. Preserve encryption and validate the actual release artifact again.

## 2. Synchronization invariants

| Invariant | Required property |
| --- | --- |
| Queue | Latest unsynchronized intent remains represented with correct create/update/delete semantics. Attempted requests remain immutable; newer intent may require a successor rather than replacement. |
| Acknowledgement | A response for mutation M can settle M, never erase a later local mutation N. |
| Persistence | A locally successful save survives restart without selecting an older snapshot or queue. If durable stores cannot be reconciled, report unavailability rather than silently returning an older authoritative value. |
| Atomicity | Effective business records and their outbox change commit together. A profit-distribution group commits all rows or none at PostgreSQL. |
| Revision | Construct a request from the latest reconciled baseline after preceding acknowledgements, and retain server compare-and-set checks. |
| Conflict | Repeating a rejected precondition is retry, not resolution. Resolution is a new, explicit operation against a freshly fetched version. |
| Idempotency | A retry uses the original request identity and bytes/semantic JSON payload. Never generate a new identity merely because an acknowledgement was lost. |
| Isolation | User/workspace/entity scope is checked during enqueue, claim, acknowledgement, retry, and resolution. |
| Visibility | Confirmed server state C and pending intent P produce effective state E. Cache memory and UI cannot claim a state that failed durable commitment. |

### Global constraints

- Never clear user data, the durable queue, encryption keys, or migration markers to fix a save failure.
- An accepted offline business change and its outbox instruction must commit together.
- Never change the payload or identity of an attempted mutation: its response may have been lost after a server commit.
- Keep confirmed server data distinct from effective local data, which includes pending changes.
- Scope new operations by user and workspace. Validate authorization on the server, including receipt replay.
- Do not remove revision/timestamp checks or use unconditional overwrites to hide conflicts.
- Preserve existing schemas and legacy queue compatibility. No SQLite version bump is needed for these JSON-level changes.
- Test assertions must cover observable data and queue state, not just SQL strings or helper names.
- Do not require network access for guest saves or accepted offline edits.
- Do not perform an unrelated storage rewrite, dependency upgrade, or UI redesign.
- Use synthetic workspaces for destructive tests. Database reset commands below are local test commands only.

## 3. Dependency analysis between the six bugs

- F3 is foundational: correct acknowledgement logic is ineffective if restart resurrects an older queue from recovery storage.
- F1 defines which mutations may be replaced. F2 and F6 must not accidentally replace attempted creates while reconciling snapshots or resolving conflicts.
- F2 provides the atomic queue/confirmed/effective commit used by F5 and F6. Fixing revision refresh without this boundary still allows cache/queue disagreement.
- F5 must reread the result of F2 before building a new request. Moving one revision read earlier does not solve it.
- F4 requires a backend transaction and durable identity before its client integration. Group membership must obey F1's queue rules and F2's acknowledgement guarantees.
- F6 depends on all relevant mutation forms, including batches; a single-row conflict action must not split a financial group.
- Shared writer coordination is a prerequisite, not a seventh product feature: separate tabs or interleaved native transactions must not bypass the planned atomic boundaries.

## 4. Recommended implementation order

```text
0 Baseline
  → 0A Android database foundations
  → 1 Browser recovery
  → 2 Queue transitions
  → 3 Snapshot acknowledgement
  → 4 Snapshot revision refresh
  → 5 Transactional batch RPC
  → 6 Batch client/queue integration
  → 7 Conflict resolution
  → 8 Browser + Android + database verification
  → 9 Release handoff
```

Tasks 1 and 5 are logically independent, but shared queue/repository edits should be integrated sequentially. Tasks 3 and 7 must share the same queue transaction contract. Each task ends with focused verification and a separately reviewable commit. Stage only that task's files or hunks.

This order repairs storage selection first, defines queue semantics second, and then makes server acknowledgement safe. Revision refresh uses that acknowledgement result. Backend batch support precedes grouped client writes, and conflict resolution comes last because it must understand all those states. Regression tests are introduced with each phase, not deferred until phase 8.

Phase 0A precedes recovery work so that native transactions and authoritative reads are dependable before migration, queue acknowledgement, or conflict resolution relies on them. Browser-only regression development can proceed independently; native rollout cannot bypass this phase.

## 5. Phase-by-phase implementation plan

Each task below is a phase. This table supplies its dependency, migration, data-flow, and risk contract; the checklists supply files, implementation steps, and commands.

| Phase | Current problem / confirmed cause | Data-flow change | Migration impact | Dependencies / principal risk |
| --- | --- | --- | --- | --- |
| 0 | Existing tests pass while six deterministic failures remain | Add isolated storage/RPC harness and writer coordination checks | None until fixtures verify legacy formats | First; mock tests must not replace native/server tests |
| 0A | Native overlap, schema repair before inspection, cached failed readiness, ambiguous read failures | Serialize connection; inspect before upgrade/repair; typed authoritative reads; retry initialization safely | No schema bump; preserve existing keys, records and markers | 0; accidental recreation of a damaged existing DB or retry races |
| 1 | Recovery entries win reads even after later primary commits | Select recovery using transactional supersession receipts | Recovery format v2 and legacy archive; no IDB/SQLite schema bump | 0; uncertain legacy conflicts must not be guessed |
| 2 | Coalescing replaces create with update and checks status without attempt history | Preserve operation semantics, identity, sequence and dependency | Optional queue-entry v2 fields plus queue metadata | 0–1; old attempted records require conservative conversion |
| 3 | Worker separately overwrites effective cache and later replaces queue | One checked acknowledgement transaction updates C/P/E | Add queue generation and optional attempt metadata | 1–2; lock inversion and stale worker completion |
| 4 | Revision captured before awaited flush is reused afterward | Flush→acknowledge→reread→construct→submit | Existing revision keys retained | 3; network transition during the sequence |
| 5 | Independent inserts cannot roll back earlier accepted rows | One PostgreSQL RPC commits rows and receipt | Additive receipt table/function migration | 0; authorization, validation and concurrent duplicate requests |
| 6 | Retry loses logical batch identity; queue does not know groups | Durable group→single RPC→atomic local acknowledgement | Optional group metadata; capability checks | 2–5; old client must not process new groups |
| 7 | Conflict retry changes status but retains rejected preconditions | Fetch→review delta→replace durably→retry→verify | Lazy conversion of old conflicts; preserved archival evidence | 3–6; later edits and missing historical baseline |
| 8 | Current native acknowledgement test does not call Supabase | Actual native-store→worker→server→native-store→restart flow | Test old-install fixtures without clearing data | 1–7; misleading simulated success and unavailable infrastructure |
| 9 | Existing docs and rollback assumptions omit new formats | Compatibility-aware staged release and evidence handoff | Leave additive schema/receipts installed | 8; unsafe downgrade with pending v2 work |

### Task 0: Establish reproducible baseline and test seams

**Files:** Inspect `frontend/src/lib/localStore.ts`, `syncQueue.ts`, `offlineSync.ts`, `repositories/snapshotRepository.ts`, `frontend/src/apps/truck/truckRepository.ts`, and existing tests. Create `frontend/tests/helpers/persistenceHarness.ts` only if shared mocks are needed by the new regression tests.

- [ ] Record branch, HEAD, and `git status --short`; inspect existing changes before editing overlapping files.
- [ ] Run the current focused tests and record failures separately from later regressions:

```bash
cd frontend
npm run test:queue-policy
npm run test:reconciliation
npm run test:sqlite-migration
npm run test:android-exit
```

- [ ] Build a deterministic harness with an in-memory `OfflineStore`, deferred RPC responses, simulated write failures, and teardown restoring every patched method. Use separate test processes or isolated browser contexts so module-level queues cannot leak between cases. No real credentials or production data.
- [ ] Capture the six original failures as assertions in the task-specific tests below before changing their production paths. Where possible, make them fail on the wrong data value rather than a missing export.
- [ ] Add the writer/lock-order regression cases specified in section 8. Native database operations must be serialized across the whole transaction, not merely across individual plugin calls. Browser queue read-modify-write operations must coordinate across tabs.

**Deliverable:** Baseline results plus regression fixtures that reproduce the reviewed behavior.

### Task 0A: Android database foundations — A1–A4

**Modify:** `frontend/src/lib/sqliteStore.ts`, `frontend/src/lib/localStore.ts`, `frontend/src/lib/persistenceCoordinator.ts` introduced by the coordination work, `frontend/src/components/DataLayerGate.tsx`, `frontend/src/lib/diagnostics.ts`.

**Tests:** Create `frontend/tests/native-store-lifecycle.test.ts` and register `test:native-store-lifecycle` in `test:unit`; extend coordinator, migration and native instrumentation tests.

**Interfaces:** Keep `OfflineStore` public read/write signatures, but distinguish true absence from a rejected authoritative read. Use typed internal errors so callers can select a recovery path without matching human-readable strings:

```ts
type NativeStoreFailureCode =
  | 'NATIVE_UNAVAILABLE'
  | 'NATIVE_BUSY'
  | 'SCHEMA_INVALID'
  | 'KEY_UNAVAILABLE'
  | 'RECORD_INVALID';
// Reject with an Error carrying code and original cause.
// null means a successful query found no record, never invalid JSON.
```

- [ ] Add tests showing two writes to unrelated keys can overlap in the current plugin wrapper, failed initialization remains latched, and invalid JSON becomes null. Separately seed an existing version-2 test DB missing a required table or marker; prove startup does not pass it as healthy after the fix.
- [ ] Implement one connection-wide coordinator for complete transactions and relevant reads. Reuse section 8's coordinator rather than introducing another competing lock. Ensure every exit, including begin/commit/rollback failure, releases its application lock; preserve the original error cause if rollback also fails.
- [ ] Separate native startup into: determine whether the named DB exists → retrieve/open it through a controlled path → inspect existing version/schema/markers → apply only a recognized initialization or upgrade → verify. Never run unconditional CREATE/ready-marker SQL on an existing version-2 DB before inspection.
- [ ] For a genuinely absent database, initialize the supported schema. For recognized older versions, inspect expected pre-upgrade structure using the installed plugin's supported connection/version APIs, then perform the registered migration. The plugin can upgrade during `open()`, so do not claim a preflight that actually runs after automatic upgrade. Test that exact bridge sequence with a real older database.
- [ ] For an existing database missing required tables/columns/markers, or at an unsupported future version, reject with `SCHEMA_INVALID`, preserve it, and show recovery guidance. Do not set a ready marker merely to satisfy health checks. Do not regenerate an encryption secret when an existing encrypted DB cannot obtain its original key; surface `KEY_UNAVAILABLE` and preserve evidence.
- [ ] Replace readiness's permanent false-promise caching with single-flight initialization that clears retryable failure state. Cache success only after verification. Serialize retries so two callers cannot open/migrate independently. The recovery screen's explicit retry invokes the safe initialization path; structural/key errors remain blocked until resolved, not endlessly retried.
- [ ] Return null only for a successful native query with no record. JSON parse failures reject as `RECORD_INVALID`; native query errors retain their cause. After migration is complete, do not automatically consult obsolete IndexedDB or localStorage on native absence/error. Legacy fallback is allowed only inside the explicit, verified migration/recovery protocol.
- [ ] Preserve the SQLite adapter identity in `DataLayerGate` error reporting. Show actionable initialization/record/schema failure categories while keeping detailed native causes in redacted diagnostics.
- [ ] Test first install, recognized upgrade, missing table, missing migration marker, future version, missing key with existing DB, transient open failure followed by successful retry, invalid JSON, genuinely absent record, and stale legacy values beneath a migrated DB.
- [ ] Run from `frontend`: `npm run test:native-store-lifecycle`, `npm run test:persistence-coordinator`, `npm run test:sqlite-migration`, and `npm run test:sqlite-json`. Register the coordinator script when its suite is introduced. Run real bridge cases with task 8's instrumentation; no phone-fix claim based only on mocks.

**Acceptance:** No overlapping native transactions; no silent schema recreation on damaged existing databases; initialization can recover from transient failures; authoritative read failures cannot masquerade as empty/stale business state. No user data, keys or markers are cleared.

### Task 1: Retire obsolete browser recovery entries safely — F3

**Modify:** `frontend/src/lib/localStore.ts`.

**Create:** `frontend/tests/local-store-recovery.test.ts`; register `test:local-store-recovery` in `frontend/package.json` and include it in `test:unit`.

**Existing interfaces:** `writeOffline`, `writeOfflineAtomic`, `readOffline`, `readDurableOffline`, `clearOfflineMemory`. Preserve their public signatures.

- [ ] Write the failing sequence: fail IndexedDB for an atomic save, allow it for a later save of the same keys, clear memory, and read again. Exercise both the business snapshot and `sync-queue-v1`.

```ts
// Harness controls IndexedDB availability; these calls use the real store.
await writeOfflineAtomic([{ key: 'state', value: { amount: 100 } }]);
// Restore IndexedDB before this operation.
await writeOfflineAtomic([{ key: 'state', value: { amount: 130 } }]);
clearOfflineMemory();
assert.deepEqual(await readOffline('state'), { amount: 130 });
```

- [ ] Run `node --import tsx tests/local-store-recovery.test.ts` from `frontend`; confirm the old recovery value is returned before the fix.
- [ ] Implement the v2 recovery journal and per-key supersession receipts from section 9. Commit data and receipts in the same primary-store transaction. Cleanup alone is not a fix: the receipt must make the correct value selectable after a crash before cleanup.
- [ ] Verify committed values/receipts before cleaning the journal. Cleanup failure leaves an obsolete journal that readers can safely ignore using the receipt. If both primary data and receipts are unreadable, expose recovery uncertainty rather than replaying possibly stale work.
- [ ] Test successful queue clearing after a prior recovery write: reload must not resurrect acknowledged mutations. Also test partial-key updates, another workspace's recovery records, repeated fallback failures, and localStorage cleanup failures.
- [ ] Use a real browser IndexedDB test in Task 8 to validate the mocked transaction behavior.
- [ ] Run the focused suite and `npm run test:split-store-recovery`; review and commit as `fix(storage): retire obsolete browser recovery records`.

**Acceptance:** Every successful save reads back identically after clearing memory/reloading; recovery records belonging to other keys remain available.

### Task 2: Preserve offline create semantics and attempted identities — F1

**Modify:** `frontend/src/lib/queuePolicy.ts`, `frontend/src/lib/syncQueue.ts`, `frontend/tests/queue-policy.test.ts`.

**Interface:** Extend `QueuePolicyEntry` with the optional scope/attempt/sequence fields in section 8. Keep `mergeQueuedMutation<T>(queue: T[], next: T): T[]`.

- [ ] Add failing tests for create→update and interrupted-attempt recovery. A recovered `pending` status alone does not prove a mutation was never attempted.

```ts
const created = { ...first, operation: 'create' as const, lastAttemptAt: null };
const edited = { ...replacement, operation: 'update' as const };
const merged = mergeQueuedMutation([created], edited);
assert.equal(merged.length, 1);
assert.equal(merged[0].operation, 'create');
assert.equal(merged[0].mutationId, edited.mutationId);
const attempted = { ...created, lastAttemptAt: '2026-09-19T00:00:00Z' };
assert.equal(mergeQueuedMutation([attempted], edited).length, 2);
```

- [ ] Run `npm run test:queue-policy`; confirm create→update currently fails.
- [ ] Restrict coalescing to never-attempted, pending mutations in the same user/workspace/entity scope. Preserve an attempted or conflicted predecessor.
- [ ] Implement and test the transition table:

| Existing unattempted operation | New operation | Result |
| --- | --- | --- |
| create | update/upsert | One create with latest complete row payload |
| create | delete | Cancel both operations |
| update/upsert | update/upsert | Latest update/upsert |
| update/upsert | delete | One delete |
| attempted/retrying/syncing/conflicted/error | any new edit | Preserve predecessor; append new edit |

- [ ] Retain the original create fields when combining payloads. Later update payloads may omit fields required for insertion. Keep a create's `baseServerUpdatedAt` null.
- [ ] Add a create→edit→edit→delete sequence and distinct user/workspace cases. Check all Truck entity types, not only transactions.
- [ ] Define conservative normalization for legacy queue records with missing attempt metadata; records with retry counts, attempt timestamps, or uncertain history must not be treated as unattempted creates.
- [ ] Run queue/reconciliation tests; review and commit as `fix(sync): preserve pending creates and attempted mutations`.

**Acceptance:** A Truck record created and edited offline reaches Supabase once with its latest values; deletion before any attempt cancels the operation safely.

### Task 3: Commit snapshot acknowledgement and queue changes together — F2

**Modify:** `frontend/src/lib/syncQueue.ts`, `frontend/src/lib/offlineSync.ts`, `frontend/src/lib/repositories/snapshotRepository.ts` where necessary for coordination.

**Create:** `frontend/tests/snapshot-sync.test.ts`; register `test:snapshot-sync` and add it to `test:unit`.

**Proposed interface in `syncQueue.ts`:**

```ts
export type SnapshotAcknowledgement = {
  mutationId: string;
  userId: string;
  workspaceId: string;
  domain: string;
  revision: number;
  payload: unknown;
};
export function acknowledgeSnapshotMutation(
  acknowledgement: SnapshotAcknowledgement,
): Promise<void>;
```

- [ ] Reproduce an in-flight older snapshot followed by a durable newer save. Release the older RPC only after the newer snapshot and outbox entry commit.

```ts
// After old amount=100 is acknowledged while amount=130 is pending:
assert.deepEqual(await offlineStore.read(storageKey), { amount: 130 });
assert.deepEqual(await offlineStore.read(`${storageKey}:confirmed`), { amount: 100 });
assert.equal((await getQueuedMutations()).at(-1)?.payload.payload.amount, 130);
```

- [ ] Confirm the existing worker changes the effective value back to 100.
- [ ] Implement the acknowledgement under the existing queue lock: reread the latest queue, remove only the acknowledged identity, update confirmed payload/revision, rebase eligible never-attempted successors, and derive effective data from the latest remaining local snapshot. Commit all those records and the queue in one `offlineStore.writeAtomic`.
- [ ] If no successor remains, effective state may become the acknowledged payload. If a protected/conflicted successor remains, keep its local payload and status; do not silently mark it settled.
- [ ] Never rebase an attempted successor's original request. Resolve it through its receipt/conflict path. Prevent a delayed receipt from downgrading a newer confirmed revision.
- [ ] Refactor the worker's end-of-pass `replaceQueue` usage so it cannot restore a processed entry, overwrite a newly enqueued entry, or undo an acknowledgement committed earlier in the pass. Keep the acknowledgement result authoritative on restart.
- [ ] Avoid introducing a deadlock: `persistSnapshot` currently holds a snapshot lock while awaiting sync. The worker must not acquire that same snapshot lock in the opposite order. Queue/storage coordination must use one documented order and hold no queue lock during network I/O.
- [ ] Test cache failure after server acceptance: the queue remains retryable with the same ID; a repeated server acknowledgement completes the local transaction once.
- [ ] Test newer saves during network failure, two queued snapshots, unrelated workspaces, and process interruption before/after the atomic acknowledgement.
- [ ] Run snapshot-sync, queue-policy, reconciliation, and Android-exit tests; review and commit as `fix(sync): preserve newer snapshots during acknowledgement`.

**Acceptance:** Confirmed=100/effective=130/pending=130 is a valid intermediate state. Effective=100/pending=130 is not. Successful acknowledgement and outbox removal are one durable boundary.

### Task 4: Refresh snapshot revision after flushing earlier edits — F5

**Modify:** `frontend/src/lib/repositories/snapshotRepository.ts`.

**Create:** `frontend/tests/snapshot-save.test.ts`; register `test:snapshot-save` and add it to `test:unit`.

**Interfaces:** Keep `persistSnapshot` public signature. Reuse the existing `snapshotPayload` builder after the final durable revision read.

- [ ] Write a test beginning at revision 1 with one pending snapshot. Make its RPC succeed at revision 2, then submit a new save. Assert the next request uses revision 2.

```ts
assert.deepEqual(rpcCalls.map(call => call.expected_revision), [1, 2]);
assert.equal(await offlineStore.read(`${storageKey}:revision`), 3);
```

- [ ] Confirm current behavior sends `[1, 1]` and rejects the second save.
- [ ] After any awaited queue flush, reread the durable revision and confirmed baseline and rebuild the outgoing payload. Do this before either direct submission or queueing a successor. Preserve the user's intended value.
- [ ] Test both Cash Book and Payroll domains, queue remaining conflicted, failed flush, timeout, and a real competing remote change after the refresh.
- [ ] Ensure this fix does not bypass a legitimate concurrent-device conflict or deadlock with Task 3.
- [ ] Run snapshot-save and snapshot-sync tests; review and commit as `fix(snapshots): refresh revision after queued sync`.

**Acceptance:** A save cannot conflict solely because it successfully flushed its own previous change; real remote races still produce conflicts.

### Task 5: Add an atomic, idempotent Truck transaction-batch RPC — F4 server

**Create:** `backend/supabase/migrations/202609190001_atomic_truck_transaction_batches.sql`, `backend/supabase/tests/truck_transaction_batches.sql`.

**Inspect/reuse:** Existing Truck authorization, audit triggers, owner/truck relationships, and transaction constraints from the installed migrations. Do not edit old migrations.

**Proposed server interface:**

```sql
public.write_truck_transaction_batch(
  target_workspace uuid,
  batch_id uuid,
  target_rows jsonb
) returns jsonb
-- Success: {"status":"written","rows":[...accepted database rows...]}
```

- [ ] Add database tests using synthetic users, workspace memberships, trucks, and owners. Test as authenticated owner, permitted editor, read-only member, and unrelated user; service-role-only tests are insufficient.
- [ ] Assert a valid first row plus invalid second row leaves zero inserted rows and no receipt. Cover invalid owner/truck/workspace references and duplicate row IDs.
- [ ] Add a receipt table keyed by `(user_id, workspace_id, batch_id)` containing the original JSON request, accepted response, and timestamp. Keep receipts immutable to clients; enforce access inside the RPC and prevent direct client writes.
- [ ] Implement the RPC as one PostgreSQL transaction. Use explicit `auth.uid()` and `can_edit_workspace_app(target_workspace, 'truck')` checks before receipt access. If using `SECURITY DEFINER`, fix the search path, qualify relations, revoke PUBLIC/anon execution, and grant only authenticated execution.
- [ ] Serialize competing requests for the same receipt identity using a transaction advisory lock or equivalent transactional row lock. Reusing an identity with a different JSON request must fail; matching retries return the original response.
- [ ] Validate the complete request before insertion: nonempty JSON array; unique UUID row/mutation IDs; supported transaction fields and types; same authorized workspace; live parent truck; referenced owners/customers/settlements belong to the correct workspace and truck. Lock referenced parents where needed to prevent a concurrent delete between validation and write. Retain database amount/type constraints and audit triggers.
- [ ] Insert every row and its receipt in the same transaction. Do not catch a row error and continue. Return server-assigned timestamps along with stable IDs.
- [ ] Add concurrent duplicate-request and response-loss retry tests: exactly one batch's rows and one receipt, even after later row edits. Test identity reuse with changed payload and unauthorized receipt replay.
- [ ] Run against the disposable local Supabase stack:

```bash
cd backend
supabase migration up --local
supabase test db supabase/tests/truck_transaction_batches.sql
supabase test db
```

- [ ] Verify both a fresh local database and the existing supported upgrade fixture in CI. Review and commit as `feat(database): add atomic idempotent truck transaction batches`.

**Acceptance:** A batch either commits every row plus its receipt, or commits nothing. Same-ID retries return the same accepted result without duplicate business effects.

### Task 6: Preserve batch identity through online/offline Truck saves — F4 client

**Modify:** `frontend/src/apps/truck/truckRepository.ts`, `frontend/src/lib/syncQueue.ts`, `queuePolicy.ts`, `offlineSync.ts`, and `frontend/src/lib/androidExit.ts` if grouped validation requires it.

**Create:** `frontend/src/lib/truckBatch.ts`, `frontend/tests/truck-batch.test.ts`; register `test:truck-batch` in `test:unit`.

**Interfaces:** Extend queue records with optional fields, retaining ordinary per-row entries for existing replay/UI logic:

```ts
type BatchMetadata = { batchId?: string; batchSize?: number; batchIndex?: number };
// Add BatchMetadata to QueuedMutation and its input/normalization types.
export function writeTruckTransactionBatchOnline(
  workspaceId: string,
  batchId: string,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]>;
```

- [ ] Write a failing batch test that simulates one valid row and one rejected row. Assert the client submits one RPC rather than independent inserts.
- [ ] Allocate batch ID, row IDs, row mutation IDs, and stable ordered request rows once per accepted user operation. Preserve them in the durable queue before the first network attempt. This is a deliberate local-first exception for multi-row financial batches.
- [ ] Persist the complete effective cache plus all grouped queue entries atomically. Guest batches only save locally and never invoke the RPC.
- [ ] For signed-in online batches, attempt immediate sync after durable enqueue. Display saved/sync-pending according to the actual result. If a batch is still pending, UI retries must retry that batch, not invoke creation with new IDs.
- [ ] Group queue entries by user/workspace/batch ID. Require exactly `batchSize` members and unique indexes `0..batchSize-1`. Claim and submit the full group together. Missing members produce a visible integrity error; never fall back to sending the remaining rows separately.
- [ ] Prevent ordinary row coalescing from splitting or replacing a grouped batch. Edits/deletes after a batch is queued remain successors until the batch is acknowledged; do not submit successors ahead of unresolved grouped creates.
- [ ] On success, atomically remove every batch member, update confirmed Truck rows/timestamps, and replay newer remaining row mutations to derive effective cache. On local commit failure retain the same group for receipt-backed retry.
- [ ] Distinguish network uncertainty from permanent validation errors: uncertain batches retry with original identities; rejected batches remain visible for correction/discard as a whole. No partial group discard or single-member retry from the conflict sheet.
- [ ] Verify pending badges, cache refresh, Android-exit verification, retry counters, and mutation totals still work with grouped entries. Ordinary legacy entries continue through the existing per-row path; never infer historical batch membership from timestamps.
- [ ] If the new RPC is unavailable, retain the group and report that server support is required. Never silently return to partial per-row inserts.
- [ ] Run batch/queue/reconciliation/Android-exit tests; review and commit as `fix(truck): persist and synchronize transaction batches atomically`.

**Acceptance:** Online and offline profit distribution use the same durable identities and one server transaction; timeout, restart, and manual retry cannot duplicate payments.

### Task 7: Implement real conflict resolution — F6

**Create:** `frontend/src/lib/conflictResolution.ts`, `frontend/tests/conflict-resolution.test.ts`; register `test:conflict-resolution` in `test:unit`.

**Modify:** `frontend/src/components/SyncIssueSheet.tsx`, `frontend/src/lib/syncQueue.ts`, snapshot and Truck refresh code as needed.

**Proposed interface:**

```ts
export type ConflictChoice = 'keep-local' | 'use-server';
export function resolveQueuedConflict(
  mutationId: string,
  choice: ConflictChoice,
): Promise<void>;
```

- [ ] Write a failure test with expected revision 1 and server revision 2. The current retry resubmits 1; the resolution must fetch 2 and prepare a fresh mutation based on it.
- [ ] Resolve the selected durable queue entry and verify its user/workspace matches the active authorized session. Read the latest server state before any destructive queue replacement. If offline or fetch fails, leave the original change untouched and show a retryable resolution error.
- [ ] For a snapshot keep-local decision, preserve unrelated remote records using the recorded base payload and the user's local changes. Use the newly fetched revision and allocate a new mutation ID; retain the old attempted identity until replacement is durably committed. If the original baseline is missing, require an explicit whole-snapshot replacement choice rather than guessing a delta.
- [ ] For Truck keep-local, use the freshly fetched `updated_at` as the new guard and a fresh mutation ID. If the remote record is missing/deleted, present the concrete outcome instead of treating an update as a create. Creation/restoration requires an explicit choice and existing permission checks.
- [ ] For use-server, fetch first, then atomically remove the selected mutation and rebuild effective data over the confirmed server state. Preserve later unrelated edits; if later edits depend on the selected change, resolve the dependency chain explicitly instead of silently dropping them.
- [ ] Commit the replacement queue, confirmed layer, and effective layer together under the queue lock. Recheck that the selected entry and dependent entries did not change while fetching; if they did, recompute or require review. Hold no queue lock during the fetch.
- [ ] Support Task 6 batches as one resolution unit. Never resolve a single row in an unresolved atomic batch.
- [ ] Make the sheet display failures and remain open when resolution fails. Close only after durable completion. Keep ordinary transient retry separate from conflict resolution; do not call `retryQueuedMutation(id, true)` as the keep-local implementation.
- [ ] Test keep-local, use-server, a second remote edit during resolution, missing rows, offline resolution, permission loss, local write failure, and another local edit while the sheet is open.
- [ ] Run conflict-resolution and existing queue/snapshot/batch tests; review and commit as `fix(sync): resolve conflicts against fresh server versions`.

**Acceptance:** The user's chosen resolution either commits durably against a checked server version or remains visibly unresolved with their local data preserved.

### Task 8: Verify real browser, SQLite, and server behavior

**Modify:** `frontend/tests/e2e/offline-multimodule.spec.ts`, `frontend/tests/e2e/truck.spec.ts`, `frontend/src/testing/androidInstrumentationApi.ts`, `mobile/android/app/src/androidTest/java/com/mathan/erp/OfflineSQLiteInstrumentedTest.java`, `.github/workflows/ci.yml` as necessary.

**Create:** `frontend/tests/e2e/persistence-regressions.spec.ts` and, if needed, a separate Android sync instrumentation class so local durability tests remain distinct from backend-dependent tests.

- [ ] Browser regression scenarios must assert actual persisted state and Supabase rows, not only successful toasts:

| Scenario | Required result |
| --- | --- |
| Offline Truck create→edit→reload→reconnect | One remote row with edited values |
| Offline unattempted create→delete | No queued or remote row |
| Snapshot save during delayed earlier sync | New local value stays visible and durable |
| Save immediately after own offline flush | Uses acknowledged revision and succeeds |
| IndexedDB failure→recovery→successful save→reload | Newest state and queue win |
| Batch validation failure | Zero server rows from the batch |
| Batch committed but response lost→retry | One complete batch, no duplicates |
| Two-device edit conflict→keep-local/use-server | Selected outcome, unrelated records retained |
| Local storage failure | No false saved confirmation |
| Workspace/user switch | No mutation applied under another scope |

- [ ] Reuse `tests/e2e/network.ts` to keep Vite available while blocking backend access. Use controlled deferred responses for races; avoid timing sleeps as the correctness assertion.
- [ ] Strengthen Android tests to invoke the production repository and synchronization functions. Existing `acknowledgeOnce` only removes local queue entries; retain it as a queue test, not proof of backend idempotency.
- [ ] Run native saves, replacements, atomic state+queue commits, restart reads, and simulated failed writes through the real encrypted SQLite plugin. Check the originally reported Truck refresh path on a migrated database.
- [ ] Add a genuine process-restart scenario driven outside the app: save offline, `adb shell am force-stop <test-application-id>`, relaunch, verify data and queue, reconnect, and verify server count and local acknowledgement. Obtain the installed test application ID from Gradle rather than assuming the production ID. Activity recreation alone is not a process-death test.
- [ ] Test APK replacement using a supported previous test APK and the new APK with the same signing key/application ID; preserve application data. Verify existing records, migration markers, and pending work.
- [ ] Provide the emulator a disposable Supabase backend and synthetic authenticated user. Keep credentials and business payloads out of uploaded diagnostics. If backend/emulator access is unavailable, record the gate as unverified rather than substituting a build result.
- [ ] Run required checks after the changes:

```bash
# frontend/
npm test
npm run build
npm run test:e2e

# backend/ — disposable local stack running
supabase test db

# mobile/
npm run build:instrumentation

# mobile/android/ — after the updated bundle is synced
./gradlew testDebugUnitTest lintDebug assembleDebug
./gradlew connectedDebugAndroidTest
```

- [ ] Add the backend-dependent Android scenarios to an appropriate CI job with local Supabase setup; the current Android job does not supply a live backend. Require evidence for the new tests rather than renaming existing simulated checks.
- [ ] Check that production builds exclude test APIs and test auth material. Run `git diff --check` and inspect the final diff.
- [ ] Review and commit test/CI changes as `test(persistence): cover recovery sync races and atomic batches`.

**Acceptance:** All six original reproductions fail before their fixes and pass afterward; browser/server integration and real Android durability evidence exist separately.

### Task 9: Documentation, rollout, and recovery handoff

**Modify:** `docs/offline-storage-integrity.md`, `docs/android-offline-release-checklist.md`.

- [ ] Replace outdated descriptions of local-first saving and proposed SQLite migration with the actual implemented flows. Document the new batch exception, conflict semantics, and known remaining limitations.
- [ ] Review existing pending records in a synthetic copy of a representative old queue. Do not automatically turn every failed update into a create; a missing remote row may have been intentionally deleted. Offer recoverable, explicit repair where historical intent is uncertain.
- [ ] Prepare an additive deployment: deploy the batch RPC/receipt migration first, verify it with test accounts, then release the matching web/Android client. Applying a production migration is a separate deployment action; this plan authorizes neither an automatic production reset nor data cleanup.
- [ ] Pilot with test workspaces: perform offline edits in all three modules, force-stop/relaunch, reconnect, compare totals and remote row counts, then exercise both conflict choices.
- [ ] Stop rollout on any accepted-save/reload mismatch, duplicated financial row, partial batch, queue corruption, or recurring native write failure. Preserve the database and outbox for diagnosis.
- [ ] Do not downgrade to a client that ignores batch metadata while grouped work remains pending. Prefer a forward fix or a compatibility-aware rollback build. Keep the additive server migration and receipts; dropping them would break safe retries.
- [ ] Record exact commit/build, migration versions, devices/API levels, test results, and unresolved checks. Redact sensitive diagnostics.

## 6. Exact files/modules expected to change

Paths are relative to the repository. Create only modules with the responsibilities described here; preserve the current domain boundaries.

| Files | Responsibility / phase |
| --- | --- |
| `frontend/src/lib/localStore.ts` | Recovery selection, cache invalidation, durable commit receipts; 1 |
| `frontend/src/lib/recoveryJournal.ts` (new) | v2 journal parsing, legacy archival and receipt-based selection; 1 |
| `frontend/src/lib/persistenceCoordinator.ts` (new) | Cross-tab writer ownership and explicit lock order; 0–3 |
| `frontend/src/lib/sqliteStore.ts` | Connection-wide serialized transactions and atomic records/receipt writes; 1–3 |
| `frontend/src/lib/queuePolicy.ts` | Scoped transitions, attempt immutability, grouped-entry protection; 2, 6 |
| `frontend/src/lib/syncQueue.ts` | Generation/sequence allocation, claim, acknowledgement, resolution transactions; 2–7 |
| `frontend/src/lib/offlineSync.ts` | One eligible head per entity, actual RPCs, transactional acknowledgement; 3–7 |
| `frontend/src/lib/reconciliation.ts` | Explicit intent-delta application, effective layer derivation, grouped status; 3, 7 |
| `frontend/src/lib/repositories/snapshotRepository.ts` | Post-flush baseline and atomic online acknowledgement; 3–4 |
| `frontend/src/lib/repositories/useSnapshotRepository.ts` | Deliver committed effective state to the UI; no stale async response replacing a newer render; 3–4 |
| `frontend/src/apps/book/cashBookRepository.ts`, `frontend/src/apps/payroll/payrollRepository.ts` | Verify callers preserve base/intended values through save; 4, 7 |
| `frontend/src/apps/truck/truckRepository.ts`, `frontend/src/apps/truck/useTruckMutations.ts` | Group creation, stable operation identity, cache reconciliation and retry UI; 6 |
| `frontend/src/lib/truckBatch.ts` (new) | Batch request contract and response validation; 6 |
| `frontend/src/lib/conflictResolution.ts` (new) | Fetch/check/resolve/commit state machine; 7 |
| `frontend/src/components/SyncIssueSheet.tsx` | Explicit choices and persistent failure messages; 7 |
| `frontend/src/lib/offlinePrefetch.ts`, `frontend/src/lib/androidExit.ts`, `frontend/src/lib/splitStoreRecovery.ts` | Respect v2 identities, pending groups and effective state during refresh/exit/recovery; 2–8 |
| `frontend/src/lib/diagnostics.ts`, `frontend/src/lib/offlineDiagnostics.ts` | Bounded redacted events, user-exportable support diagnostics; 8 |
| `frontend/src/components/DataLayerGate.tsx` | Block unsafe writes on unresolved format/migration conflicts; 1–2 |
| `frontend/package.json` | Register every new unit suite in `test:unit`; 1–8 |
| `frontend/tests/helpers/persistenceHarness.ts` (new) | Deterministic storage, delayed response, crash and failure controls; 0 |
| `frontend/tests/local-store-recovery.test.ts`, `snapshot-sync.test.ts`, `snapshot-save.test.ts`, `truck-batch.test.ts`, `conflict-resolution.test.ts` (all new under tests) | Behavior regressions; 1–7 |
| `frontend/tests/queue-policy.test.ts`, `reconciliation.test.ts`, `sqlite-migration.test.ts`, `sqlite-adapter.test.ts`, `android-exit.test.ts`, `split-store-recovery.test.ts` | Existing-contract extensions; 1–8 |
| `frontend/tests/persistence-coordinator.test.ts`, `persistence-compatibility.test.ts`, `sync-diagnostics.test.ts` (new) | Writer isolation, old-install fixtures, diagnostic redaction; 0–8 |
| `frontend/tests/native-store-lifecycle.test.ts` (new) | Initialization retry, schema preflight, missing keys, typed reads and legacy fallback boundaries; 0A |
| `frontend/tests/e2e/persistence-regressions.spec.ts` (new), `offline-multimodule.spec.ts`, `truck.spec.ts`, `network.ts` | Real IDB and Supabase scenarios; 8 |
| `backend/supabase/migrations/202609190001_atomic_truck_transaction_batches.sql` (new) | Receipt table and transactional batch RPC; 5 |
| `backend/supabase/tests/truck_transaction_batches.sql` (new), `backend/supabase/tests/security_contract.sql`, `backend/supabase/upgrade_tests/legacy_upgrade_contract.sql` | Batch correctness, permissions and supported upgrades; 5, 8 |
| `frontend/src/testing/androidInstrumentationApi.ts` | Test bridge to production repository/worker, not synthetic acknowledgements; 8 |
| `mobile/android/app/src/androidTest/java/com/mathan/erp/OfflineSQLiteInstrumentedTest.java`, `OfflineSyncInstrumentedTest.java` (new beside it) | Local durability and actual backend integration; 8 |
| `frontend/scripts/run-android-offline-scenario.mjs`, `.github/workflows/ci.yml` | External force-stop/relaunch orchestration, backend-enabled emulator job, safe artifacts; 8 |
| `docs/offline-storage-integrity.md`, `docs/android-offline-release-checklist.md` | Actual architecture, compatibility, evidence and recovery procedures; 9 |

## 7. Backend/database changes

Add only the batch RPC/receipt migration defined in task 5. Do not alter previously applied migrations or delete existing Truck rows. Use existing RLS/permission helpers and audit triggers; receipts are not an alternative authorization path.

Receipt identity is `(auth.uid(), target_workspace, batch_id)`. Store canonical request JSON and original response JSON in the receipt transaction. Compare JSON structurally, including ordered rows, rather than trusting a client-provided hash. Serialize identical concurrent requests before checking/inserting the receipt. Revoke client receipt writes and enforce current access before returning a prior response.

An existing receipt is a success only for the exact same request. Changed request under the same identity is a validation error, not an upsert. Invalid rows raise an exception that aborts the entire RPC. A timeout creates no new identity. Successful replies have `status = written`, the original batch identity, and every accepted row including `id`, `updated_at`, and `last_mutation_id`; the client validates row count and identities before clearing its group.

Existing snapshot receipt and Truck `last_mutation_id` paths remain in use for ordinary requests. Test delayed/repeated receipts against newer remote state: a row whose last-mutation marker changed cannot be assumed uncommitted. Keep the uncertain request visible as a conflict unless an authoritative receipt proves it; do not retry it with fresh IDs. This plan guarantees no duplicate insert, not automatic conflict-free completion of every uncertain legacy request.

## 8. Queue/reconciliation algorithm

### Identity and ordering decisions

Use mutation IDs for exact request identity, a monotonic durable `localSequence` for local intent ordering, and server revision/timestamp for concurrency checks. Do not use wall-clock timestamps to decide which local save is newer. `queueGeneration` detects changes during network waits; it is not a server revision.

Keep `sync-queue-v1` as an array so existing diagnostics and legacy data can be read. New entries add optional-at-read fields:

```ts
type QueueEntryV2Fields = {
  formatVersion: 2;
  localSequence: number;
  intentBase?: unknown;
  supersedesMutationId?: string;
  batchId?: string;
  batchSize?: number;
  batchIndex?: number;
};
type QueueMetadataV2 = {
  formatVersion: 2;
  queueGeneration: number;
  nextLocalSequence: number;
};
// Store metadata in records under sync-queue-meta-v2, in the same atomic
// write as sync-queue-v1. Do not use best-effort metadata writes for it.
```

`QueuePolicyEntry` must include optional `userId`, `lastAttemptAt`, `retryCount`, `localSequence` and batch fields for normalized legacy inputs. Enqueue creates all mandatory v2 values under the writer lock. Store a snapshot's prior effective state as `intentBase` for later delta reconstruction; preserve attempted request payloads separately from any UI representation.

### Writer ownership and lock order

1. Browser: hold one origin-scoped Web Lock for each durable read-modify-write sequence. Reread backing storage under the lock; a per-tab memory cache cannot be the authority for queue changes. Broadcast commit generation to other tabs and invalidate affected caches; every authoritative read still checks its generation.
2. If Web Locks are unavailable, do not pretend an in-memory Promise protects multiple tabs. Keep writes disabled with an actionable compatibility message until a tested transactional coordinator is supplied. This limitation must be tested on supported browsers before release.
3. Android: use one connection-wide Promise mutex around each complete `executeTransaction`/read sequence. Do not allow unrelated key locks to interleave BEGIN/run/COMMIT on the same connection. A failed transaction releases the mutex; subsequent operations still run.
4. Lock order is repository intent lock → queue coordinator → storage coordinator → native connection. Worker acknowledgements acquire queue/storage only. Network I/O never holds queue/storage/native locks. Refactor entry points to avoid recursively acquiring a non-reentrant platform lock.
5. Publish memory/UI changes only after durable commit. A failed write leaves the last committed memory version or invalidates it; rollback must not overwrite a newer successful operation's memory.

### Enqueue/claim

1. Under coordinator, load queue and metadata. Normalize legacy fields, validate user/workspace scope, and assign `localSequence = nextLocalSequence++` to new intent.
2. Exact duplicate ID + identical immutable request is one operation; merge only lifecycle information. Same ID + different request is an integrity error: preserve evidence and block automatic sync.
3. Apply task 2 transitions only to known-never-attempted pending entries. An attempted create followed by an edit remains `[original create, successor update]`. A successor must not reach the server first.
4. Atomically persist queue, incremented generation, metadata, and effective record. Persist batch members as one complete group.
5. Claim only the earliest unresolved request per scoped entity, or a complete eligible batch. Claims persist attempt identity and lease before network I/O. A conflicted/uncertain predecessor blocks its successors. Do not claim an entire chain upfront and then mutate already-attempted payloads during rebasing.

### Successful snapshot acknowledgement

Under the queue coordinator, using a freshly loaded queue:

```text
validate response scope + mutation identity + shape
find exact acknowledged mutation M
if M was already settled/superseded: do not change newer intent
C := current confirmed payload/revision
if response.revision > C.revision: C := response payload/revision
if response.revision == C.revision but payload differs: integrity error
if response.revision < C.revision: retain C (delayed receipt)
P := remaining scoped mutations in localSequence order, removing only M
E := C.payload
for N in P:
    E := applyIntentDelta(N.intentBase, N.localIntent, E)
    if N is next eligible, never attempted, and has no conflict:
        update N's request payload to E and expected revision to C.revision
    otherwise preserve N's original request and status
commit C + E + revised P + queue metadata in one durable transaction
publish E and new queue generation
```

For ID-based snapshot collections, `applyIntentDelta(base, intended, target)` removes IDs deleted locally, adds local additions, and applies changed fields to matching target records; untouched remote fields/records remain. A simultaneous remote change to the same field with a different value is a conflict, not an automatic local win. Keep the local intended value visible and mark it unresolved. Explicit keep-local in section 12 authorizes the local choice. Missing legacy baseline forbids guessed rebasing; preserve the latest legacy effective payload and expose the conflict.

An acknowledgement already superseded by a user resolution cannot resurrect its old request. Increment generation and write `supersedesMutationId`/resolution audit evidence as part of the replacement; workers match exact identity before changing state. A duplicate acknowledgement becomes a no-op, not a queue rewrite.

Direct online saves must use the same confirmed/effective commit contract. Repository saves, hydrate/prefetch, worker acknowledgements and UI hydration must not independently overwrite E without checking pending intent and commit generation.

Truck acknowledgements follow the same transaction shape: reconcile the accepted row(s) into confirmed cache, remove exact settled identities, then replay remaining scoped row intent. An unattempted dependent update obtains the acknowledged row's exact server `updated_at`. Attempted successors retain their original timestamp. Financial batch members are removed together.

### Failure handling

- Network failure: keep original identity/request; release lease to retrying and retain E.
- Permanent validation/permission failure: keep intent visible, mark error, block dependent successors.
- Revision/timestamp rejection: store conflict context and keep intent; section 12 resolves it.
- Local commit failure after remote acceptance: retain original queued identity; retry acknowledgement through the receipt path. Do not generate another business operation.
- Remove end-of-pass full-queue replacement from normal worker completion. Update only exact IDs under a fresh generation; a worker's old queue snapshot is never authoritative.

## 9. Recovery-storage lifecycle

### Chosen protocol: transactional supersession receipts

Do not rely on deleting localStorage promptly or comparing timestamps. Keep primary values in their current format. Add a private per-key record in the existing primary `records` store proving which recovery operation has been superseded. A primary write and those proofs commit in the same transaction.

```ts
type RecoveryJournalV2 = {
  formatVersion: 2;
  generation: number;
  entries: Record<string, {
    operationId: string;
    batchId: string;
    value: unknown;
    deleted?: boolean;
  }>;
};
type RecoveryReceipt = { supersededOperationId: string };
// Journal key: mathan_erp_offline_atomic_recovery_v2
// Primary receipt key: __recovery_receipt_v2__:<encoded business key>
```

Deletion uses a tombstone, including a receipt, so an old recovery value cannot recreate a deleted record. Exclude these internal keys from business enumeration, exports, and legacy-import scans. New recovery batches are published through one localStorage assignment, not one assignment per entry. Ordinary single-key fallback and atomic fallback use the same v2 journal path.

### Commit and restart algorithm

1. Under the writer coordinator, read the current journal. If primary storage works, read its values and receipts in a consistent transaction. A journal entry J is obsolete only if the primary receipt for its key equals `J.operationId`. Do not infer obsolescence from equal timestamps or a higher cloud revision.
2. Ignore obsolete J when selecting effective data even if localStorage cleanup never ran. For an unsuperseded J, use its value/tombstone as the latest recovered intent and include it in the next primary commit. Merge a newer incoming operation over that recovered state; never silently lose an outstanding queue update.
3. Commit relevant values/tombstones and receipts matching the journal entries they supersede in one primary transaction. Preserve unrelated pending journal entries. Never acknowledge success on IndexedDB request success alone; wait for transaction completion.
4. Verify values and matching receipts using a consistent backing-store read. Then remove only journal entries whose operation IDs still match the verified receipts. A later journal entry with a new ID must survive cleanup.
5. Cleanup is best effort once the primary transaction and receipts are verified. Failure leaves harmless, provably obsolete entries. Future reads prefer primary through the receipt rule; future cleanup may retry.
6. If the primary transaction aborts, save the complete intended batch in one v2 journal assignment with fresh operation IDs and batch ID. Only report local success after that assignment succeeds. If it also fails, reject and preserve the prior committed state.
7. On restart, reconcile primary/journal before hydrating business repositories or running sync. If primary and receipts are temporarily unreadable, preserve the journal but do not submit or publish potentially obsolete entries as authoritative. Offer a read-only recovery view; retry initialization. Distinguish this from normal offline network mode, where local IndexedDB remains available.

| Crash/failure point | Recovery behavior |
| --- | --- |
| Before primary transaction commits | Transaction rolls back; previous durable state or committed journal remains |
| During localStorage batch assignment | Old or complete new journal; never a deliberately split multi-key batch |
| After primary commit, before verification | Matching receipts identify obsolete recovery; primary wins |
| After verification, before cleanup | Same rule; no stale queue resurrection |
| Cleanup fails | Keep journal; matching receipts still select primary |
| New fallback arrives before an old cleanup attempt | ID mismatch prevents deleting the new fallback |
| Primary and journal both reject writes | Save fails; no false success |
| Primary cannot be read after restart | Preserve sources and block authoritative replay until reconciliation is possible |

All writes touching recovery-related keys, including queue acknowledgements, must use this protocol. Multi-key business saves cannot partially publish memory before commit. On Android, ordinary new business writes still fail if SQLite is unavailable; do not reintroduce transparent IndexedDB writes after migration. Legacy recovery import into SQLite must include equivalent receipts in its transaction.

## 10. Truck atomic-batch design

One logical distribution receives one random UUID `batchId` at durable creation. It is stable across retries; it need not be derived from amounts or dates. Row UUIDs and mutation UUIDs are allocated once, persisted, and reused. Two intentionally separate distributions with equal amounts remain distinct operations.

Use grouped ordinary queue rows with `batchId`, `batchSize`, `batchIndex`. Group by user/workspace/batch ID, enforce completeness, and send one RPC containing ordered rows. Preserve the original group until the server receipt and local acknowledgement transaction settle it.

For the UI, return the logical batch identity and durable persistence state from creation. A pending operation offers retry/status, not a fresh create button for the same submission. A double-click is prevented while the submission is accepted; resume from the persisted batch identity after restart. An explicit new distribution is a new operation.

Retryable timeout → same group/IDs/request. Validation rejection → zero server rows, visible error, correction creates a new reviewed request only after the rejected group is atomically superseded. Unknown outcome must be resolved through the original receipt before cancellation/replacement. A deleted parent or permission loss does not authorize partial submission.

Per-row `Promise.all` is removed from the batch path. No missing-RPC fallback may submit its rows independently. Older ungrouped entries cannot be retroactively declared atomic; preserve their behavior and flag ambiguous historical partial distributions for review rather than guessing membership.

## 11. Revision-handling design

1. Capture the user's intended delta against the currently displayed effective state, not a revision-number-only snapshot.
2. If connected, flush preceding eligible mutations for the scoped entity. Await completion of their local acknowledgement transaction, not just the HTTP response.
3. Reacquire coordinator; reload queue generation, confirmed payload/revision, effective state, and any predecessor statuses. Reapply the user's delta to the reconciled effective state without dropping unrelated changes.
4. If an unresolved predecessor remains, append/coalesce an unattempted successor under task 2 rules. Do not submit it early.
5. If the entity is settled, build the new request using the reloaded confirmed revision. Allocate its request identity once before the first request. Preserve the request for fallback if outcome becomes uncertain.
6. Network loss before submission → atomically queue the prepared intent and E. Loss after submission or timeout → queue the same ID/request, never a newly rebased attempted request.
7. Server accepts → use section 8 acknowledgement. Server rejects a revision → preserve intended value and show a real conflict. A second device may have changed the server after step 3; that rejection is correct.
8. If the queue or local generation changes while preparing, reread/recompute before submission. Do not mix a revision from one generation with a baseline from another.

Run this for both `cash_book:state` and `payroll:state`. A failed queue flush does not force local edits to fail: they can remain durable successors. A failure of local storage does force the save to report failure. The original online-first policy remains; the plan does not claim crash survival for an online request that was never acknowledged locally and never durably queued.

## 12. Conflict-resolution design

The resolver is a state machine: `reviewing → fetching → preparing → durably-queued → syncing → settled`, with `needs-review` or `retry-pending` on failures. The sheet distinguishes local acceptance from confirmed cloud completion.

**Keep my saved change:** Capture selected mutation, scope, sequence, queue generation, original baseline and local delta. Fetch current server data/version without locks. Reacquire coordinator and verify the selected mutation/dependency chain is unchanged. If changed, recompute and keep review visible. Build a new mutation ID with the fresh revision/timestamp, record `supersedesMutationId`, and atomically replace only the reviewed intent chain together with C/E. Submit through the normal worker, and verify acknowledgement/queue removal before reporting cloud resolution.

For snapshots, keep-local chooses the user's values only for fields/records actually changed locally. Preserve unrelated remote changes. Missing baseline requires an explicit warning and whole-snapshot replacement choice; the ordinary keep-local button cannot silently infer that choice. For Truck, pass the exact database timestamp without JS date rounding; never substitute client time as the expected server version. Deleted/missing rows require an explicit restore/create decision, and stable IDs must not be silently recycled into another entity.

**Use server version:** Fetch and validate current state before removing local intent. Atomically replace confirmed data, remove the selected intent, and recompute effective data from remaining independent deltas. If a later edit depends on a locally created record being discarded, present the whole dependent chain as the choice; do not drop it invisibly. A batch is always one choice.

**Uncertain response:** A retrying mutation is not automatically a known rejected conflict. Query/retry its original receipt path before replacing it with a fresh ID. Resolution cannot turn an ambiguous accepted payment into a duplicate new payment.

Both actions retain old entries until the replacement transaction commits. Network fetch failure, permission loss, local storage failure or another remote edit leaves a visible unresolved/pending state. Only known-conflict replacement changes identity; ordinary transient retries keep identity.

## 13. Migration/backward-compatibility strategy

| Existing data | Version decision | Upgrade treatment |
| --- | --- | --- |
| SQLite records/metadata/schema markers | SQLite schema version stays 2 | Existing key/value tables hold new queue metadata and recovery receipts; encrypted connection and keys unchanged |
| IndexedDB records/metadata stores | IndexedDB version stays 2 | Store receipts in existing records store; no object-store upgrade required |
| Array queue `sync-queue-v1` | Entry format v2, new metadata record | Preserve array; assign missing local sequences in existing array order atomically; preserve IDs, timestamps and original requests |
| Queue duplicates | No silent overwrite | Collapse identical same-ID requests; conflicting same-ID payloads are quarantined with both copies preserved |
| Legacy attempted/failed/conflicted entries | Lazy normalization | Preserve attempt evidence and rejected preconditions; resolve only via section 12 |
| Legacy recovery/fallback keys | New recovery journal v2 | Archive original values first; reconcile with primary before activating v2 and recording completion |
| Existing Truck IDs | Unchanged | Never regenerate existing entity/mutation IDs; batch metadata only for newly created groups |
| Existing partially synced distributions | Cannot infer group identity | Retain evidence and require explicit reconciliation; no automatic regrouping or deletion |
| Existing migration metadata | Preserve | New recovery/queue migration markers are separate and written only after verification |

**Legacy recovery ambiguity:** Old primary and recovery values have no reliable local commit ordering. If values are identical, verify primary then mark the recovery superseded. If primary is missing, import the entire internally consistent recovery batch and its queue together. If both exist and differ, preserve both in an immutable recovery archive, mark `recovery-review-required`, and disable automatic sync for affected scope. Do not infer “newer” from cloud revisions, client timestamps, or record count. Show a recovery explanation and explicit choice/export path. This is a necessary limitation of missing historical metadata, not a reason to erase either copy.

Use `__persistence_format_v2__` in durable records with `prepared`/`complete` stages. Preparation archives originals before replacement. Atomically write normalized queue, queue metadata, recovered business data and receipts; verify hashes and identities; then mark complete. Crash before completion resumes idempotently from preserved input. Never clear legacy stores as part of this rollout.

Unknown future format or unsupported required batch feature blocks writes/sync with a compatibility message. The new app can enforce this; already released old clients cannot be made safe by adding a flag they do not read. Upgrade all supported clients/tabs and enforce a minimum supported version where deployment tooling permits. Treat downgrade as a controlled recovery procedure, not a normal install.

Add fixture tests for fresh installs, native v1→v2 schema upgrade followed by format-v2 upgrade, migrated SQLite, healthy IDB, fallback-only data, conflicting legacy recovery, duplicate queue identities, old conflicts, interrupted migration and rerun. Include a synthetic database with each combination; do not test only empty databases.

## 14. Regression-test matrix

Every F1–F6 regression must demonstrably fail on the reviewed baseline and pass with its fix. Failure injection uses deferred promises or controlled browser routes, not arbitrary sleeps. Paths below are relative to `frontend/tests/` unless marked otherwise.

| # | Scenario | Test location | Exact acceptance |
| --- | --- | --- | --- |
| 1 | Truck offline create→edit→reconnect | `queue-policy.test.ts`, `e2e/truck.spec.ts` | One create reaches server, same entity ID, final edited fields |
| 2 | Truck offline create→edit→edit→reconnect | Same | One remote entity with second edit; no orphan update |
| 3 | Truck create→delete before attempt | Same | No queued or remote record; attempted creates do not use this cancellation shortcut |
| 4 | Save 100→send→save 130→old ack | `snapshot-sync.test.ts`, `e2e/persistence-regressions.spec.ts` | C=100, E=130, pending intent=130; reload retains 130 |
| 5 | IDB fail→recovery→new primary save→restart | `local-store-recovery.test.ts`, browser regression | New value wins even if cleanup never happens |
| 6 | Acknowledged queue recovery→restart | Same | Settled mutation does not return or resend |
| 7 | Batch contains one invalid transaction | `truck-batch.test.ts`, backend batch SQL test | Zero business rows and zero receipt |
| 8 | Retry same logical batch | Same plus browser regression | Same row IDs, one receipt, one set of financial effects |
| 9 | Revision 1→flush to 2→new save | `snapshot-save.test.ts` for both domains | RPC versions [1,2], accepted new revision 3 |
| 10 | Conflict→keep-local→fetch→retry | `conflict-resolution.test.ts`, browser regression | New identity, current version guard, selected local delta, successful acknowledgement |
| 11 | Restart after offline edits | Offline E2E and native sync test | Exact local data and queue identities survive actual process restart |
| 12 | Restart after successful sync | Same | Effective/confirmed agree and settled entries remain absent |
| 13 | Network loss during synchronization | Snapshot/Truck tests and real backend E2E | Original request retained, correct pending state, no false cloud success |
| 14 | Server commits but response is lost | Real backend route drops only reply after commit; native equivalent | Retry original identity; server count/effects unchanged; local acknowledgement eventually settles |
| 15 | Failed/attempted create→edit→retry | Queue + Truck E2E | Preserve original request; successor waits and uses acknowledged timestamp |
| 16 | Exact/differing duplicate queue IDs | `persistence-compatibility.test.ts` | Exact duplicate coalesces; differing payload blocks and preserves evidence |
| 17 | Crash at each recovery stage | Recovery unit + browser tests | Receipt selection never resurrects older data |
| 18 | Legacy conflicting recovery and interrupted upgrade | Compatibility + migration + native tests | Both sources preserved; explicit review; idempotent resume |
| 19 | Two tabs enqueue/ack concurrently | Browser regression | No lost operation; generations/order consistent; old memory invalidated |
| 20 | Concurrent native writes / one rollback | Coordinator test + native SQLite test | Transactions do not interleave; later writes still work |
| 21 | Use-server with later dependent intent | Conflict tests and browser regression | Independent changes retained; dependent discard requires explicit review |
| 22 | Delayed receipt older than confirmed state | Snapshot/Truck tests | No confirmed revision downgrade and no restoration of superseded intent |
| 23 | User/workspace switch or permissions revoked | Browser + backend SQL | No cross-scope write/receipt exposure; pending data retained |
| 24 | Log redaction and bounded retention | `sync-diagnostics.test.ts` | No financial values, names, auth secrets, raw payloads, or unbounded log growth |
| 25 | Transient native open failure→retry | `native-store-lifecycle.test.ts`, native bridge tests | One safe retry initializes successfully without reload or data clearing |
| 26 | Existing DB missing table/marker or future version | Lifecycle/migration tests and native fixtures | Reject before any schema recreation or fabricated ready marker |
| 27 | Invalid JSON/native read failure with stale legacy copy | Lifecycle + native tests | Typed failure; no empty snapshot or automatic stale fallback |
| 28 | Existing encrypted DB without accessible original key | Native fixture | Preserve DB; no replacement secret or silent fresh DB |
| 29 | Large embedded attachments and accumulated snapshots | Browser/native capacity tests | Accepted data survives cold read, queue sync and restart; enforce a measured safe policy if not |
| 30 | Final release on 16 KB Android and normal-page devices | Release artifact checks + device/emulator runs | Native libraries load and actual encrypted DB flow succeeds on both |

Register coordinator/compatibility/diagnostics suites in `test:unit` alongside the five new task suites. Run `npm test`, `npm run test:e2e`, local `supabase test db`, and the Android commands from task 8. Record native/runtime checks as unverified if the environment cannot run them; never substitute a compilation success.

## 15. Android/SQLite integration verification

Required end-to-end path:

```text
Actual repository save → encrypted Capacitor SQLite cache + queue
→ production sync worker → local Supabase RPC/table operation
→ real server acknowledgement → SQLite C/P/E transaction
→ external force-stop/relaunch → backing-store read → correct UI/server counts
```

Keep existing durability instrumentation. Add backend-dependent coverage separately, with a disposable Supabase stack, seeded permissions and test authentication. Configure the emulator backend via test-only build settings; use `adb reverse` or the verified emulator host mapping and adjust the test client's URL accordingly. Never ship a test auth bypass or test credential in production.

Drive process death from the host runner because the app cannot reliably kill and verify itself. Persist test scenario identity externally, run prepare/save, force-stop the installed debug application, relaunch, and run verify. Validate the absence of the old process and reload through SQLite, not an existing JS Map. Test APK upgrade with matching signing/application IDs and preserved app data.

Fault injection must include: native write rejection, rollback halfway through a multi-key transaction, delayed acknowledgement, server commit with client reply dropped, and reboot/relaunch after settlement. Fault controls exist only in instrumentation builds; the actual worker, serialization and native adapter are used. Audit current CI artifacts: do not automatically upload private-storage archives containing test auth tokens. Prefer redacted structured traces and test results.

Minimum acceptance includes the originally reported Truck refresh on a migrated database, repeated create/update/refresh cycles, Cash Book and Payroll offline writes, a grouped distribution, and both conflict choices. Record APK/build hash, Android API/device, database schema/format versions, server migrations, actual mutation IDs in protected test evidence and final row counts.

### Android compatibility and capacity gates — A5

- Test the supported minimum Android/API and current target on available representative devices/emulators; record Android System WebView version as well as OS version. Include arm64 hardware and the CI x86_64 emulator. Do not infer WebView compatibility from the API level alone.
- On the final release build, check all packaged native libraries, not only SQLCipher, with Android's ELF/ZIP alignment procedure. Verify AAB packaging if distributing through Play. Run on a verified 16 KB system (`adb shell getconf PAGE_SIZE` reports 16384) and a normal-page device; exercise encryption, writes, migration and restart, not just launch.
- Retain `androidIsEncryption: true`, existing encrypted preferences/key storage, and disabled application backup. Test signed APK replacement with preserved database and keys. Debug `.debug` and release application IDs use different storage; testing one does not inspect the other's existing database.
- Build synthetic Cash Book snapshots with small, 1 MB, 3 MB and near-5 MB attachments, multiple attachments, and a large pending queue. Measure serialized row size, commit/read latency, peak memory, native errors and cold-start success. Base64 and whole-snapshot duplication mean the file-size limit is not a database-row-size limit.
- If supported inputs fail native cold reads or exceed practical memory/storage limits, add a bounded prerequisite: a measured safe attachment limit with explicit UI validation, or a separately reviewed attachment-file storage design. Never silently remove/truncate attachments or report save success for unreadable records. Existing oversized records require a data-preserving recovery/export path.
- Capture the original native error code/cause for the reported Truck refresh. Compare the old no-RETURNING upsert and current replacement statement only in a disposable native test DB. Distinguish parser failure, overlapping transaction, unavailable key, storage exhaustion and read-size failure before assigning a root cause.

Official references checked during the focused review:

- [Capacitor 7 Android migration baseline](https://capacitorjs.com/docs/updating/7-0)
- [Android 16 KB page-size verification](https://developer.android.com/guide/practices/page-sizes)
- [SQLCipher Android 16 KB support](https://www.zetetic.net/blog/2025/06/26/sqlcipher-for-android-16kb-page-size-support/)
- [SQLite plugin encryption configuration](https://github.com/capacitor-community/sqlite/blob/master/docs/DatabaseEncryption.md)
- [Plugin issue #670: SQL parsing involving RETURNING](https://github.com/capacitor-community/sqlite/issues/670)

Evidence limitation: an isolated in-memory schema experiment was blocked by the execution environment's approval service reporting an account usage limit. This is a tooling limitation, not a database error in the application. The schema-order finding remains code-inspection evidence until the planned database/native regression is run. No physical-device verification was completed in that review.

## 16. Observability changes

Implement a bounded structured event recorder in `diagnostics.ts`; keep development console output optional. Proposed events: `save-committed`, `save-rejected`, `recovery-selected`, `recovery-superseded`, `recovery-review-required`, `queue-claimed`, `mutation-attempt`, `mutation-acknowledged`, `reconciliation-committed`, `conflict-opened`, `conflict-resolved`, `batch-rejected`, `migration-completed`.

Allowlisted fields: event time, app/build version, adapter, schema/format version, mutation ID, batch ID, entity type, operation type, local sequence, queue generation, attempt ID, base revision, acknowledged revision, retry count, conflict state, outcome code, duration and counts. Record Truck version comparisons as match/mismatch by default, not raw business timestamps. Use session-local opaque scope labels instead of user names/company names. Mutation/batch IDs are diagnostic identifiers, not permission tokens; exports remain user-controlled.

Never log full payloads, amounts, names, descriptions, attachments, tokens, connection secrets, SQL bind values or unfiltered exception messages. Classify errors into allowlisted codes. Keep at most 500 events and at most seven days, prune on append/startup, and offer explicit export/clear controls. Diagnostic persistence is best effort, outside the business transaction, and cannot block a save or recursively log its own failure.

Test log size/age limits and malicious/error strings containing fake secrets. Useful counters are pending/error/conflict/group counts, retry rate, native write failures, recovery ambiguity, and acknowledgement failures. No telemetry service is added in this scope. Optional remote reporting requires a separate product decision.

## 17. Deployment sequence

1. Finish all phase regressions and compatibility fixtures; review the additive backend migration independently.
2. Apply migration to disposable/staging Supabase, verify permissions and duplicate/rollback cases, then prepare the production migration for the normal authorized deployment workflow.
3. Deploy server RPC/receipt support before any client can create grouped batches. Verify capability using the actual function contract; missing support must not trigger per-row fallback.
4. Pilot the new client on synthetic workspaces and representative existing-install backups. Complete all real-device gates before broad release.
5. Publish the compatible web and Android versions through the existing release workflow. Ensure old web tabs reload; document the minimum compatible Android version and mixed-version limitations.
6. Monitor redacted diagnostics and counts for a pilot period covering offline operation, restart, reconnect and a financial batch. Any definition-of-done failure stops expansion.
7. Update release notes with the data-preserving recovery behavior and contact/support path for ambiguous old recovery entries.

No database migration, app release, commit, push or PR is performed by this planning task.

## 18. Rollback strategy

- Stop rollout on accepted-save loss, duplicate business effects, partial batches, queue/confirmed/effective disagreement, cross-scope replay, or recurring native transaction failure.
- Preserve encrypted local databases, legacy archives, pending identities, receipts and migration markers. Never clear data or sign a user out merely to remove an error.
- Prefer a forward fix or a rollback build that understands entry format v2, receipt-based recovery and batch groups. A previous binary may ignore these fields and send group members separately; it is not a safe blanket rollback.
- Leave the additive backend function and receipt table installed. Disabling new batch creation is safer than dropping support needed by already queued batches.
- Before any controlled older-client downgrade, settle/export pending groups, reconcile recovery data with verified primary state, and validate a conversion in an isolated copy. Do not modify live financial records automatically to make the old app start.
- Restore server backups only through the established incident process, accounting for later legitimate writes and durable client queues. A snapshot restore can invalidate receipt/version assumptions and requires reconciliation before sync resumes.

## 19. Risks

| Risk | Mitigation / release gate |
| --- | --- |
| Old recovery values lack trustworthy ordering | Preserve both; explicit review instead of guessed precedence |
| Changed queue format interpreted by old clients | Compatibility-aware rollout and rollback; grouped batches never sent by old versions |
| Lock inversion or uncoordinated native transaction | Defined lock order, no locks during network, concurrency tests |
| Same-field edits silently overwritten | Delta conflict detection; explicit keep-local selection |
| Full snapshots and `intentBase` increase storage use | Measure representative datasets; retain only needed unresolved baselines; storage failure remains visible |
| localStorage quota rejects fallback batch | Report failed local save; never split an atomic group across keys |
| Supabase request timeout does not cancel server commit | Immutable request identity and real response-loss tests |
| Legacy Truck last-mutation receipt no longer matches | Preserve ambiguous request for review, never invent a replacement payment |
| Batch receipt retention grows | No automatic pruning in this release; size measurement and retention policy required before future cleanup |
| Browser lacks required cross-tab coordinator | Verified support matrix; explicit write-disabled compatibility state |
| Phone error has a cause beyond SQL form | Reproduce actual Truck path and native diagnostics; block release if failure remains |
| Startup disguises missing schema as a healthy empty DB | Existing-schema preflight before creation/upgrade; missing-table native fixture |
| Initialization failure remains cached or retries overlap | Reset retryable failure state; single-flight retry; lifecycle tests |
| Invalid native read falls through to stale legacy data | Typed read failures and explicit migration boundary |
| Large embedded attachments exceed device read/memory capacity | Measured native capacity gate; preserve oversized existing data |
| Existing aligned APK mistaken for final release compatibility | Recheck final APK/AAB and run actual 16 KB device tests |
| Test backend/native infrastructure unavailable | Mark gate unverified; do not claim end-to-end readiness |

This plan is not a full security audit or an attachment-storage redesign. New evidence of another defect that prevents a required invariant becomes a documented bounded prerequisite, not a suppressed test.

## 20. Definition of done

- [ ] F1: offline create/edit synchronizes once with final values.
- [ ] F2: old acknowledgements cannot hide newer accepted local changes.
- [ ] F3: recovery data cannot override a newer successful save after restart.
- [ ] F4: batch atomicity and repeat-request idempotency pass against PostgreSQL.
- [ ] F5: snapshot saves use the revision after preceding synchronization.
- [ ] F6: both conflict choices complete or preserve a visible unresolved change.
- [ ] SQLite native save/restart/upgrade tests pass, including the reported Truck refresh path.
- [ ] A1–A4 pass native transaction, schema-preflight, safe-retry and authoritative-read regressions.
- [ ] A5 attachment-capacity results and final release 16 KB compatibility evidence are recorded; any failing supported scenario is resolved before release.
- [ ] The original phone-error root cause is backed by native runtime evidence; the earlier SQL-parser explanation is not repeated as confirmed without it.
- [ ] Browser and Android guest behavior remains local and usable offline.
- [ ] Existing uncommitted work is preserved and task commits are reviewable.
- [ ] Deployment order, compatibility limits, and rollback procedure are documented.
- [ ] All 14 user-required scenarios and the additional matrix cases have recorded results at the specified test layer.
- [ ] Old-install fixtures survive interrupted migrations; ambiguous recovery is preserved and surfaced.
- [ ] Structured diagnostic redaction, retention and nonblocking behavior are verified.
- [ ] No original financial payload, pending intent or receipt is discarded to make tests pass.
- [ ] Unverified environments, remaining limitations and mixed-client restrictions are explicit in the handoff.
