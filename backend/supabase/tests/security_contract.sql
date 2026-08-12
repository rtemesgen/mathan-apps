begin;
select plan(10);

select has_function('public', 'can_view_workspace_app', ARRAY['uuid', 'text']);
select has_function('public', 'can_edit_workspace_app', ARRAY['uuid', 'text']);
select has_function('public', 'write_app_state_snapshot', ARRAY['uuid', 'text', 'bigint', 'jsonb', 'text', 'jsonb']);
select has_function('public', 'count_my_workspace_invitations', ARRAY[]::text[]);
select has_function('public', 'restore_workspace_backup', ARRAY['jsonb', 'text']);
select has_policy('public', 'cash_books', 'book viewers read cash books');
select has_policy('public', 'employees', 'payroll viewers read employees');
select has_policy('public', 'app_state_snapshots', 'editors write permitted app snapshots');
select has_policy('public', 'audit_events', 'owners view audit events');
select has_function('public', 'audit_workspace_event', ARRAY['uuid', 'text', 'uuid', 'text', 'jsonb', 'jsonb']);

select * from finish();
rollback;
