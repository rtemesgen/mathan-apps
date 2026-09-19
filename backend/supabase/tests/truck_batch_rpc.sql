begin;
select plan(6);

select ok(to_regclass('public.truck_transaction_batch_receipts') is not null, 'batch receipt table is available');

set local role postgres;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'batch-owner@example.test', 'not-used', now(), '{}', '{}')
on conflict (id) do nothing;
insert into public.workspaces (id, name, created_by)
values ('22222222-2222-2222-2222-222222222222', 'Batch Test Workspace', '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;
insert into public.workspace_members (workspace_id, user_id, role)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'owner')
on conflict do nothing;
insert into public.workspace_apps (workspace_id, app_id, enabled)
values ('22222222-2222-2222-2222-222222222222', 'truck', true)
on conflict do nothing;
insert into public.workspace_member_app_permissions (workspace_id, user_id, app_id, permission)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'truck', 'edit')
on conflict (workspace_id, user_id, app_id) do update set permission = 'edit';
insert into public.trucks (id, workspace_id, name)
values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Batch Test Truck')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

select is((select result.status from public.write_truck_transaction_batch(
  '22222222-2222-2222-2222-222222222222',
  '44444444-4444-4444-4444-444444444444',
  '[
    {"id":"55555555-5555-5555-5555-555555555551","mutation_id":"66666666-6666-6666-6666-666666666661","workspace_id":"22222222-2222-2222-2222-222222222222","truck_id":"33333333-3333-3333-3333-333333333333","occurred_on":"2026-09-19","transaction_type":"INCOME","category":"Batch one","amount":10,"description":"First"},
    {"id":"55555555-5555-5555-5555-555555555552","mutation_id":"66666666-6666-6666-6666-666666666662","workspace_id":"22222222-2222-2222-2222-222222222222","truck_id":"33333333-3333-3333-3333-333333333333","occurred_on":"2026-09-19","transaction_type":"EXPENSE","category":"Batch two","amount":4,"description":"Second"}
  ]'::jsonb
 ) result), 'written', 'first batch request writes atomically');
select is((select count(*)::integer from public.truck_transactions where id in ('55555555-5555-5555-5555-555555555551', '55555555-5555-5555-5555-555555555552')), 2, 'both batch rows are inserted');
set local role postgres;
select is((select count(*)::integer from public.truck_transaction_batch_receipts where batch_id = '44444444-4444-4444-4444-444444444444'), 1, 'one receipt is written');
set local role authenticated;
select is((select result.status from public.write_truck_transaction_batch(
  '22222222-2222-2222-2222-222222222222',
  '44444444-4444-4444-4444-444444444444',
  '[
    {"id":"55555555-5555-5555-5555-555555555551","mutation_id":"66666666-6666-6666-6666-666666666661","workspace_id":"22222222-2222-2222-2222-222222222222","truck_id":"33333333-3333-3333-3333-333333333333","occurred_on":"2026-09-19","transaction_type":"INCOME","category":"Batch one","amount":10,"description":"First"},
    {"id":"55555555-5555-5555-5555-555555555552","mutation_id":"66666666-6666-6666-6666-666666666662","workspace_id":"22222222-2222-2222-2222-222222222222","truck_id":"33333333-3333-3333-3333-333333333333","occurred_on":"2026-09-19","transaction_type":"EXPENSE","category":"Batch two","amount":4,"description":"Second"}
  ]'::jsonb
 ) result), 'already_applied', 'same batch retry returns the receipt');
select is((select count(*)::integer from public.truck_transactions where id in ('55555555-5555-5555-5555-555555555551', '55555555-5555-5555-5555-555555555552')), 2, 'same batch retry does not duplicate rows');

select * from finish();
rollback;
