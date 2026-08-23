-- Lifecycle, backup, and contract tests use the service role to verify imports.
grant select, insert, update, delete on public.guest_workspace_import_receipts to service_role;
