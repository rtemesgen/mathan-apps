# Offline storage integrity review

## Current behavior

- Cash Book books and transactions use `useCloudSnapshot`. Every accepted state change is written to the local offline store first and queued for cloud synchronization when the user is signed in.
- The browser build stores records in IndexedDB (`mathan-erp-offline`, schema version 2) and uses a receipt-backed `localStorage` recovery journal only while an IndexedDB commit is pending or unavailable.
- The Android build uses the encrypted Capacitor SQLite adapter after a verified migration marker is present. Native failures are surfaced as typed recovery errors rather than silently falling back to stale browser data.
- Guest/standalone data remains device-local until it is explicitly imported. Signed-in data is retried when connectivity returns and uses server revisions to detect conflicting edits.
- Cash Book's normal **Save** and **Save & Add New** paths both add a transaction through the same state update, so both follow the same offline persistence path.

## Integrity issue found and fixed

The fallback previously had a split-brain failure mode: a failed IndexedDB write was saved to `localStorage`, but after a reload a healthy IndexedDB read returned “missing” without checking that fallback. This could make a successfully accepted offline edit appear lost. Reads now consult the fallback when IndexedDB has no record, key enumeration merges both stores, deletes clear both stores, and writes wait for the IndexedDB transaction to commit rather than only for the individual request to succeed.

The browser integrity tests previously opened an obsolete schema version explicitly. Once the application upgrades the database, that request can fail with `VersionError`. Tests now open the current database version without forcing an obsolete version.

## IndexedDB and SQLite storage boundary

Do not replace IndexedDB with SQLite in the web build: browsers do not expose a portable native SQLite API, and IndexedDB is the appropriate durable browser store. SQLite is useful for the Capacitor Android build, where a native SQLite plugin can provide transactions, constraints, and indexed queries.

A safe migration boundary is implemented as follows:

1. `OfflineStore` provides one atomic write contract for the browser IndexedDB adapter and the Android SQLite adapter.
2. Android initialization checks the named database, schema version, required tables, migration markers, and encryption key before selecting SQLite. Recognized legacy data is migrated transactionally and verified before the native-ready marker is written.
3. Native records use `records(key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL)` and `metadata(key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`; the durable queue remains a JSON record in the same adapter.
4. Browser recovery entries use format-v2 receipts. The primary record and receipt are committed together, so cleanup failure cannot make an obsolete journal win after reload.
5. Android instrumentation covers encrypted local writes, restart reads, interrupted migration recovery, failed writes, and force-stop queue recovery. Backend-connected Android and physical-device capacity/page-size evidence is supplied by CI/release runs, not inferred from this document.

SQLite does not replace the cloud database or sync conflict rules; it replaces only the device-side persistence adapter. Attachments currently stored as data URLs also need an explicit size policy before migration because large blobs can exhaust either browser quota or a SQLite database quickly.

## Remaining risks and recommended checks

- State snapshots are whole arrays. Two devices editing the same Cash Book concurrently can produce a revision conflict that requires user resolution; moving books and transactions to normalized server rows would enable finer-grained merging.
- The UI waits for repository persistence before publishing normal snapshot state and reports storage failures. Embedded attachments remain bounded by the shared 5 MB validator because base64 data is duplicated in snapshots and queues.
- Run the Playwright Cash Book flow online, offline, across a page reload, and after reconnection against the local Supabase stack. Confirm that the transaction appears once locally and once remotely.
- The 5 MB attachment policy has unit coverage. Physical API 30 instrumentation also measured 1 MB, 3 MB and 4.9 MB single attachments plus a 4.9 MB record split across three attachments with two queued copies. The constrained 16 KB emulator keeps a 1 MB SQLite/WebView smoke check and intentionally skips the large JSON bridge matrix; the full matrix remains required on normal Android/physical release validation. Broader queue-depth, peak-memory, signed-release and 16 KB release-artifact evidence is still required before raising or removing that bound.
