# Offline storage integrity review

## Current behavior

- Cash Book books and transactions use `useCloudSnapshot`. Every accepted state change is written to the local offline store first and queued for cloud synchronization when the user is signed in.
- The browser build stores records in IndexedDB (`mathan-erp-offline`, schema version 2) and uses `localStorage` only when IndexedDB is unavailable.
- Guest/standalone data remains device-local until it is explicitly imported. Signed-in data is retried when connectivity returns and uses server revisions to detect conflicting edits.
- Cash Book's normal **Save** and **Save & Add New** paths both add a transaction through the same state update, so both follow the same offline persistence path.

## Integrity issue found and fixed

The fallback previously had a split-brain failure mode: a failed IndexedDB write was saved to `localStorage`, but after a reload a healthy IndexedDB read returned “missing” without checking that fallback. This could make a successfully accepted offline edit appear lost. Reads now consult the fallback when IndexedDB has no record, key enumeration merges both stores, deletes clear both stores, and writes wait for the IndexedDB transaction to commit rather than only for the individual request to succeed.

The browser integrity tests also opened schema version 1 explicitly. Once the application upgraded the database to version 2, that request could fail with `VersionError`. Tests now open the current database version without forcing an obsolete version.

## IndexedDB to SQLite migration

Do not replace IndexedDB with SQLite in the web build: browsers do not expose a portable native SQLite API, and IndexedDB is the appropriate durable browser store. SQLite is useful for the Capacitor Android build, where a native SQLite plugin can provide transactions, constraints, and indexed queries.

A safe migration plan is:

1. Introduce an `OfflineStore` interface (`get`, `put`, `delete`, `keys`, and atomic batch write) and keep the current IndexedDB implementation for web.
2. Add a Capacitor SQLite implementation for native builds. Initialize it only after `Capacitor.isNativePlatform()` confirms a native runtime.
3. Use tables such as `records(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)` and `metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL)`. Keep the sync queue payload format unchanged.
4. On first native launch, read all IndexedDB records, insert them in one SQLite transaction, verify record counts and content hashes, then set a migration-complete marker. Do not delete IndexedDB until a later release.
5. Exercise upgrade, rollback, offline restart, storage-full, interrupted transaction, conflict, and multi-company isolation cases before switching the native implementation by default.

SQLite does not replace the cloud database or sync conflict rules; it replaces only the device-side persistence adapter. Attachments currently stored as data URLs also need an explicit size policy before migration because large blobs can exhaust either browser quota or a SQLite database quickly.

## Remaining risks and recommended checks

- State snapshots are whole arrays. Two devices editing the same Cash Book concurrently can produce a revision conflict that requires user resolution; moving books and transactions to normalized server rows would enable finer-grained merging.
- The UI accepts a save before the asynchronous device write finishes. Add a surfaced persistence-error state (and avoid success messaging until durable completion) if storage-full handling must be guaranteed to the user.
- Run the Playwright Cash Book flow online, offline, across a page reload, and after reconnection against the local Supabase stack. Confirm that the transaction appears once locally and once remotely.
- Add attachment quota tests and avoid large data URLs in snapshot payloads for production-scale books.
