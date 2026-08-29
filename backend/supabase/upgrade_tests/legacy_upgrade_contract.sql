begin;
select plan(12);

select is((select count(*) from public.workspace_apps where workspace_id = '20000000-0000-4000-8000-000000000001'), 3::bigint, 'all current apps are enabled for a legacy company');
select is((select permission::text from public.workspace_member_app_permissions where workspace_id = '20000000-0000-4000-8000-000000000001' and user_id = '10000000-0000-4000-8000-000000000002' and app_id = 'book'), 'view', 'an explicit legacy permission wins');
select is((select count(*) from public.workspace_member_app_permissions where workspace_id = '20000000-0000-4000-8000-000000000001' and user_id = '10000000-0000-4000-8000-000000000002'), 2::bigint, 'only missing legacy Book and Payroll permissions are backfilled');
select is((select count(*) from public.app_state_snapshots where workspace_id = '20000000-0000-4000-8000-000000000001'), 4::bigint, 'all four legacy domains become snapshots');
select is((select jsonb_array_length(payload) from public.app_state_snapshots where workspace_id = '20000000-0000-4000-8000-000000000001' and domain = 'cash_book:books'), 1, 'deleted books are excluded');
select is((select payload #>> '{0,name}' from public.app_state_snapshots where workspace_id = '20000000-0000-4000-8000-000000000001' and domain = 'cash_book:books'), 'Legacy book', 'book fields are preserved');
select is((select payload #>> '{0,bookId}' from public.app_state_snapshots where workspace_id = '20000000-0000-4000-8000-000000000001' and domain = 'cash_book:transactions'), '30000000-0000-4000-8000-000000000001', 'cash transaction keeps its book relationship');
select is((select payload #>> '{0,remark}' from public.app_state_snapshots where workspace_id = '20000000-0000-4000-8000-000000000001' and domain = 'cash_book:transactions'), 'Legacy payment', 'cash transaction fields are preserved');
select is((select jsonb_array_length(payload #> '{0,salaryHistory}') from public.app_state_snapshots where workspace_id = '20000000-0000-4000-8000-000000000001' and domain = 'payroll:employees'), 1, 'only active salary changes are nested');
select is((select payload #>> '{0,salaryHistory,0,reason}' from public.app_state_snapshots where workspace_id = '20000000-0000-4000-8000-000000000001' and domain = 'payroll:employees'), 'Annual review', 'salary history fields are preserved');
select is((select payload #>> '{0,employeeName}' from public.app_state_snapshots where workspace_id = '20000000-0000-4000-8000-000000000001' and domain = 'payroll:transactions'), 'Legacy employee', 'payroll transaction keeps its employee relationship');
select is((select payload from public.app_state_snapshots where workspace_id = '20000000-0000-4000-8000-000000000002' and domain = 'cash_book:books'), '[{"sentinel":"must-win"}]'::jsonb, 'an existing current snapshot is never overwritten');

select * from finish();
rollback;
