insert into auth.users (id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');

insert into public.workspaces (id, name, created_by) values
  ('20000000-0000-4000-8000-000000000001', 'Legacy upgrade fixture', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'Existing snapshot fixture', '10000000-0000-4000-8000-000000000001');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'member');
insert into public.workspace_member_app_permissions (workspace_id, user_id, app_id, permission)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'book', 'view');

insert into public.cash_books (id, workspace_id, name, description, currency, category, deleted_at) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Legacy book', 'Preserve me', 'UGX', 'Shop', null),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Deleted book', null, 'UGX', null, now());
insert into public.cash_transactions (id, workspace_id, book_id, type, amount, remark, category, payment_mode, occurred_at, deleted_at) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'in', 125, 'Legacy payment', 'Sale', 'Cash', '2026-08-20 10:30:00+00', null),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'out', 5, 'Deleted payment', null, null, now(), now());

insert into public.employees (id, workspace_id, name, department, position, start_date, initial_salary, status, deleted_at) values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Legacy employee', 'Ops', 'Driver', '2025-01-02', 900000, 'active', null),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Deleted employee', null, null, '2025-01-02', 1, 'inactive', now());
insert into public.salary_changes (id, workspace_id, employee_id, effective_date, new_monthly_salary, reason, deleted_at) values
  ('60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '2026-01-01', 1000000, 'Annual review', null),
  ('60000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '2026-02-01', 2, 'Deleted change', now());
insert into public.payroll_transactions (id, workspace_id, employee_id, amount, transaction_date, type, payment_method, reference_no, notes, deleted_at) values
  ('70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 250000, '2026-08-21', 'advance', 'Cash', 'REF-1', 'Legacy advance', null),
  ('70000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 1, '2026-08-22', 'adjustment', null, null, 'Deleted payroll', now());

insert into public.app_state_snapshots (workspace_id, domain, payload, revision)
values ('20000000-0000-4000-8000-000000000002', 'cash_book:books', '[{"sentinel":"must-win"}]', 9);
