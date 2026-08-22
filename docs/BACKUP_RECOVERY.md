# Backup and recovery runbook

Workspace owners can export a versioned JSON backup from Settings. The file includes workspace metadata, members, app permissions, snapshots, audit summaries, a schema version, and a SHA-256 checksum.

Restore validates the checksum, schema, snapshot domains, revisions, and required fields before calling the server restore function. Restoration always creates a new workspace and never overwrites the active workspace.

Production operations must additionally configure Supabase scheduled backups and retention in the project dashboard. At least once before release, restore a scheduled backup into a non-production project and record the result. Backup files may contain payroll information and must be stored only in approved encrypted storage.

## System administrator archives

Named system administrators have an additional application-wide backup in Admin > Backup & Restore. It exports the user directory (never passwords or tokens), profiles, companies, memberships, app permissions, canonical snapshots, invitations, workspace and system audit records, backup history, attachment metadata, and the referenced private attachment objects.

- The first visit on a device asks for a recovery passphrase of at least 12 characters. PBKDF2-SHA-256 derives a non-exportable AES-GCM key that remains in the device's IndexedDB. The passphrase is never sent to Supabase.
- One automatic archive runs per calendar day per device when a system administrator opens Admin. Manual archives can be started at any time.
- Android writes the completed archive to Downloads. Browsers retain the encrypted archive in IndexedDB and attempt a normal file download; use **Download latest local backup** if browser download policy blocks the automatic save.
- Keep the passphrase separately from the backup. Neither Mathan ERP nor Supabase can recover a lost passphrase.

### Safe restore

1. Deploy all database migrations and the `system-admin` Edge Function to the healthy or replacement Supabase project.
2. Configure `ADMIN_BOOTSTRAP_EMAILS`, sign in as that verified account, and open Admin.
3. Select the encrypted `.meb.json` file and enter its recovery passphrase.
4. Review the checksum-verified contents and select the companies to recover.
5. Start recovery. Each company is recreated with a new workspace ID; live workspaces are never overwritten. Attachments use short-lived signed upload tokens.
6. Copy the generated seven-day recovery invitation links for missing users. Existing users are matched by normalized email; passwords and administrator grants are never restored from the archive.

Application archives are not exact PostgreSQL backups. Keep Supabase scheduled backups/PITR enabled, and periodically test a platform-level restore. Database backups do not restore deleted Storage objects, which is why the application archive includes referenced attachments separately.
