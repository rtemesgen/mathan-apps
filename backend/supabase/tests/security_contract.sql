begin;
select plan(18);

select has_function('public', 'can_view_workspace_app', ARRAY['uuid', 'text']);
select has_function('public', 'can_edit_workspace_app', ARRAY['uuid', 'text']);
select has_function('public', 'write_app_state_snapshot', ARRAY['uuid', 'text', 'bigint', 'jsonb', 'text', 'jsonb']);
select has_function('public', 'count_my_workspace_invitations', ARRAY[]::text[]);
select has_function('public', 'restore_workspace_backup', ARRAY['jsonb', 'text']);
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'cash_books' and policyname = 'book viewers read cash books'), 'cash book read policy exists');
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'employees' and policyname = 'payroll viewers read employees'), 'payroll employee read policy exists');
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'app_state_snapshots' and policyname = 'editors write permitted app snapshots'), 'snapshot editor policy exists');
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_events' and policyname = 'owners view audit events'), 'owner audit policy exists');
select has_function('public', 'audit_workspace_event', ARRAY['uuid', 'text', 'uuid', 'text', 'jsonb', 'jsonb']);
select ok(to_regclass('public.system_admins') is not null, 'system_admins table exists');
select ok(to_regclass('public.system_user_controls') is not null, 'system_user_controls table exists');
select ok(to_regclass('public.system_admin_audit_events') is not null, 'system_admin_audit_events table exists');
select ok(to_regclass('public.system_backup_runs') is not null, 'system_backup_runs table exists');
select has_function('public', 'is_system_admin', ARRAY[]::text[]);
select has_function('public', 'system_admin_restore_workspace', ARRAY['uuid', 'jsonb', 'text']);
select ok(to_regclass('public.system_restore_operations') is not null, 'system_restore_operations table exists');
select ok(to_regclass('public.system_restore_workspaces') is not null, 'system_restore_workspaces table exists');

select * from finish();
rollback;
