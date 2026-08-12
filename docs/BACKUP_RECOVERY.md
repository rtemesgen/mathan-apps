# Backup and recovery runbook

Workspace owners can export a versioned JSON backup from Settings. The file includes workspace metadata, members, app permissions, snapshots, audit summaries, a schema version, and a SHA-256 checksum.

Restore validates the checksum, schema, snapshot domains, revisions, and required fields before calling the server restore function. Restoration always creates a new workspace and never overwrites the active workspace.

Production operations must additionally configure Supabase scheduled backups and retention in the project dashboard. At least once before release, restore a scheduled backup into a non-production project and record the result. Backup files may contain payroll information and must be stored only in approved encrypted storage.
