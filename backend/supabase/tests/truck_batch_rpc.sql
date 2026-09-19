begin;
select plan(13);

select ok(to_regclass('public.truck_transaction_batch_receipts') is not null, 'batch receipt table is available');

set local role postgres;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'batch-owner@example.test', 'not-used', now(), '{}', '{}')
on conflict (id) do nothing;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('77777777-7777-7777-7777-777777777777', 'authenticated', 'authenticated', 'batch-editor@example.test', 'not-used', now(), '{}', '{}'),
  ('88888888-8888-8888-8888-888888888888', 'authenticated', 'authenticated', 'batch-readonly@example.test', 'not-used', now(), '{}', '{}'),
  ('99999999-9999-9999-9999-999999999999', 'authenticated', 'authenticated', 'batch-unrelated@example.test', 'not-used', now(), '{}', '{}')
on conflict (id) do nothing;
insert into public.workspaces (id, name, created_by)
values ('22222222-2222-2222-2222-222222222222', 'Batch Test Workspace', '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;
insert into public.workspace_members (workspace_id, user_id, role)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'owner')
on conflict do nothing;
insert into public.workspace_members (workspace_id, user_id, role)
values
  ('22222222-2222-2222-2222-222222222222', '77777777-7777-7777-7777-777777777777', 'member'),
  ('22222222-2222-2222-2222-222222222222', '88888888-8888-8888-8888-888888888888', 'member')
on conflict do nothing;
insert into public.workspace_apps (workspace_id, app_id, enabled)
values ('22222222-2222-2222-2222-222222222222', 'truck', true)
on conflict do nothing;
insert into public.workspace_member_app_permissions (workspace_id, user_id, app_id, permission)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'truck', 'edit')
on conflict (workspace_id, user_id, app_id) do update set permission = 'edit';
insert into public.workspace_member_app_permissions (workspace_id, user_id, app_id, permission)
values
  ('22222222-2222-2222-2222-222222222222', '77777777-7777-7777-7777-777777777777', 'truck', 'edit'),
  ('22222222-2222-2222-2222-222222222222', '88888888-8888-8888-8888-888888888888', 'truck', 'view')
on conflict (workspace_id, user_id, app_id) do update set permission = excluded.permission;
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

set local role authenticated;
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);
select is((select result.status from public.write_truck_transaction_batch(
  '22222222-2222-2222-2222-222222222222',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '[{"id":"55555555-5555-5555-5555-555555555553","mutation_id":"66666666-6666-6666-6666-666666666663","workspace_id":"22222222-2222-2222-2222-222222222222","truck_id":"33333333-3333-3333-3333-333333333333","occurred_on":"2026-09-19","transaction_type":"INCOME","category":"Editor batch","amount":7,"description":"Editor"}]'::jsonb
 ) result), 'written', 'permitted editor can submit a batch');

select set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', true);
select throws_ok($$select * from public.write_truck_transaction_batch(
  '22222222-2222-2222-2222-222222222222',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '[{"id":"55555555-5555-5555-5555-555555555554","mutation_id":"66666666-6666-6666-6666-666666666664","workspace_id":"22222222-2222-2222-2222-222222222222","truck_id":"33333333-3333-3333-3333-333333333333","occurred_on":"2026-09-19","transaction_type":"INCOME","category":"Read only","amount":7,"description":"Should reject"}]'::jsonb
)$$, '42501', 'Truck edit access required', 'read-only member cannot submit a batch');

select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
select throws_ok($$select * from public.write_truck_transaction_batch(
  '22222222-2222-2222-2222-222222222222',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '[{"id":"55555555-5555-5555-5555-555555555555","mutation_id":"66666666-6666-6666-6666-666666666665","workspace_id":"22222222-2222-2222-2222-222222222222","truck_id":"33333333-3333-3333-3333-333333333333","occurred_on":"2026-09-19","transaction_type":"INCOME","category":"Unrelated","amount":7,"description":"Should reject"}]'::jsonb
)$$, '42501', 'Truck edit access required', 'unrelated user cannot submit a batch');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select throws_ok($$select * from public.write_truck_transaction_batch(
  '22222222-2222-2222-2222-222222222222',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  '[{"id":"55555555-5555-5555-5555-555555555556","mutation_id":"66666666-6666-6666-6666-666666666666","workspace_id":"22222222-2222-2222-2222-222222222222","truck_id":"33333333-3333-3333-3333-333333333333","occurred_on":"2026-09-19","transaction_type":"INCOME","category":"Valid first","amount":7,"description":"Valid"},{"id":"55555555-5555-5555-5555-555555555557","mutation_id":"66666666-6666-6666-6666-666666666667","workspace_id":"22222222-2222-2222-2222-222222222222","truck_id":"00000000-0000-0000-0000-000000000000","occurred_on":"2026-09-19","transaction_type":"INCOME","category":"Invalid second","amount":7,"description":"Must rollback"}]'::jsonb
)$$, '23503', 'Batch references a missing or unauthorized truck', 'invalid second row rejects the whole batch');
select is((select count(*)::integer from public.truck_transactions where id in ('55555555-5555-5555-5555-555555555556', '55555555-5555-5555-5555-555555555557')), 0, 'invalid batch inserts no rows');
set local role postgres;
select is((select count(*)::integer from public.truck_transaction_batch_receipts where batch_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'), 0, 'invalid batch writes no receipt');
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

select throws_ok($$select * from public.write_truck_transaction_batch(
  '22222222-2222-2222-2222-222222222222',
  '44444444-4444-4444-4444-444444444444',
  '[{"id":"55555555-5555-5555-5555-555555555551","mutation_id":"66666666-6666-6666-6666-666666666661","workspace_id":"22222222-2222-2222-2222-222222222222","truck_id":"33333333-3333-3333-3333-333333333333","occurred_on":"2026-09-19","transaction_type":"INCOME","category":"Changed request","amount":999,"description":"Identity reuse must reject"}]'::jsonb
)$$, '23505', 'Batch identity was reused with a different request', 'changed request under a receipt identity is rejected');

select * from finish();
rollback;
