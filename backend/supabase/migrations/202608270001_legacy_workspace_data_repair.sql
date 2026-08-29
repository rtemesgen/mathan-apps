-- Preserve pre-snapshot company data and pre-permission member access.
--
-- The original schema stored Cash Book and Payroll in relational tables. The
-- later snapshot repository did not backfill those rows, so an older company
-- could successfully return no snapshot and appear empty. Explicit app
-- permissions also initially seeded owners only, although every member had
-- access to Book and Payroll under the preceding RLS contract. Truck was
-- introduced later with owner-only defaults, so it must not be granted to a
-- legacy non-owner here. This migration repairs only missing state: existing
-- snapshots and explicit permissions always win.

insert into public.workspace_apps (workspace_id, app_id, enabled)
select workspace.id, app.app_id, true
from public.workspaces as workspace
cross join (values ('book'), ('payroll'), ('truck')) as app(app_id)
on conflict (workspace_id, app_id) do nothing;

insert into public.workspace_member_app_permissions (workspace_id, user_id, app_id, permission)
select member.workspace_id, member.user_id, app.app_id, 'edit'::public.app_permission
from public.workspace_members as member
cross join lateral (
  select candidate.app_id
  from (values ('book'), ('payroll'), ('truck')) as candidate(app_id)
  where candidate.app_id <> 'truck' or member.role = 'owner'
) as app
left join public.workspace_member_app_permissions as permission
  on permission.workspace_id = member.workspace_id
 and permission.user_id = member.user_id
 and permission.app_id = app.app_id
where permission.workspace_id is null
on conflict (workspace_id, user_id, app_id) do nothing;

create temporary table legacy_snapshot_migration_targets (
  workspace_id uuid not null,
  domain text not null,
  source_count bigint not null,
  primary key (workspace_id, domain)
) on commit drop;

insert into legacy_snapshot_migration_targets (workspace_id, domain, source_count)
select book.workspace_id, 'cash_book:books', count(*)
from public.cash_books as book
where book.deleted_at is null
  and not exists (
    select 1 from public.app_state_snapshots as snapshot
    where snapshot.workspace_id = book.workspace_id and snapshot.domain = 'cash_book:books'
  )
group by book.workspace_id;

insert into legacy_snapshot_migration_targets (workspace_id, domain, source_count)
select transaction.workspace_id, 'cash_book:transactions', count(*)
from public.cash_transactions as transaction
where transaction.deleted_at is null
  and not exists (
    select 1 from public.app_state_snapshots as snapshot
    where snapshot.workspace_id = transaction.workspace_id and snapshot.domain = 'cash_book:transactions'
  )
group by transaction.workspace_id;

insert into legacy_snapshot_migration_targets (workspace_id, domain, source_count)
select employee.workspace_id, 'payroll:employees', count(*)
from public.employees as employee
where employee.deleted_at is null
  and not exists (
    select 1 from public.app_state_snapshots as snapshot
    where snapshot.workspace_id = employee.workspace_id and snapshot.domain = 'payroll:employees'
  )
group by employee.workspace_id;

insert into legacy_snapshot_migration_targets (workspace_id, domain, source_count)
select transaction.workspace_id, 'payroll:transactions', count(*)
from public.payroll_transactions as transaction
where transaction.deleted_at is null
  and not exists (
    select 1 from public.app_state_snapshots as snapshot
    where snapshot.workspace_id = transaction.workspace_id and snapshot.domain = 'payroll:transactions'
  )
group by transaction.workspace_id;

insert into public.app_state_snapshots (workspace_id, domain, payload, revision, updated_at)
select target.workspace_id, target.domain,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', book.id,
      'name', book.name,
      'description', book.description,
      'currency', book.currency,
      'category', book.category,
      'openingBalance', 0,
      'createdAt', book.created_at,
      'updatedAt', book.updated_at
    ) order by book.created_at desc)
    from public.cash_books as book
    where book.workspace_id = target.workspace_id and book.deleted_at is null
  ), '[]'::jsonb), 1, now()
from legacy_snapshot_migration_targets as target
where target.domain = 'cash_book:books'
on conflict (workspace_id, domain) do nothing;

insert into public.app_state_snapshots (workspace_id, domain, payload, revision, updated_at)
select target.workspace_id, target.domain,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', transaction.id,
      'bookId', transaction.book_id,
      'type', transaction.type,
      'amount', transaction.amount,
      'remark', transaction.remark,
      'category', transaction.category,
      'paymentMode', transaction.payment_mode,
      'dateTime', to_char(transaction.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI'),
      'createdAt', transaction.created_at
    ) order by transaction.occurred_at desc, transaction.created_at desc)
    from public.cash_transactions as transaction
    where transaction.workspace_id = target.workspace_id and transaction.deleted_at is null
  ), '[]'::jsonb), 1, now()
from legacy_snapshot_migration_targets as target
where target.domain = 'cash_book:transactions'
on conflict (workspace_id, domain) do nothing;

insert into public.app_state_snapshots (workspace_id, domain, payload, revision, updated_at)
select target.workspace_id, target.domain,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', employee.id,
      'name', employee.name,
      'department', employee.department,
      'position', employee.position,
      'startDate', employee.start_date,
      'initialSalary', employee.initial_salary,
      'salaryHistory', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', change.id,
          'effectiveDate', change.effective_date,
          'newMonthlySalary', change.new_monthly_salary,
          'reason', change.reason,
          'createdAt', change.created_at
        ) order by change.effective_date, change.created_at)
        from public.salary_changes as change
        where change.workspace_id = employee.workspace_id
          and change.employee_id = employee.id
          and change.deleted_at is null
      ), '[]'::jsonb),
      'status', employee.status,
      'createdAt', employee.created_at
    ) order by employee.created_at desc)
    from public.employees as employee
    where employee.workspace_id = target.workspace_id and employee.deleted_at is null
  ), '[]'::jsonb), 1, now()
from legacy_snapshot_migration_targets as target
where target.domain = 'payroll:employees'
on conflict (workspace_id, domain) do nothing;

insert into public.app_state_snapshots (workspace_id, domain, payload, revision, updated_at)
select target.workspace_id, target.domain,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', transaction.id,
      'employeeId', transaction.employee_id,
      'employeeName', employee.name,
      'amount', transaction.amount,
      'date', transaction.transaction_date,
      'type', transaction.type,
      'paymentMethod', transaction.payment_method,
      'referenceNo', transaction.reference_no,
      'notes', transaction.notes,
      'createdAt', transaction.created_at
    ) order by transaction.transaction_date desc, transaction.created_at desc)
    from public.payroll_transactions as transaction
    left join public.employees as employee
      on employee.id = transaction.employee_id and employee.workspace_id = transaction.workspace_id
    where transaction.workspace_id = target.workspace_id and transaction.deleted_at is null
  ), '[]'::jsonb), 1, now()
from legacy_snapshot_migration_targets as target
where target.domain = 'payroll:transactions'
on conflict (workspace_id, domain) do nothing;

do $$
declare mismatch record;
begin
  select target.workspace_id, target.domain, target.source_count,
         jsonb_array_length(snapshot.payload) as migrated_count
    into mismatch
  from legacy_snapshot_migration_targets as target
  join public.app_state_snapshots as snapshot
    on snapshot.workspace_id = target.workspace_id and snapshot.domain = target.domain
  where jsonb_typeof(snapshot.payload) <> 'array'
     or jsonb_array_length(snapshot.payload) <> target.source_count
  limit 1;

  if found then
    raise exception 'Legacy snapshot migration verification failed for workspace %, domain %: expected %, found %',
      mismatch.workspace_id, mismatch.domain, mismatch.source_count, mismatch.migrated_count;
  end if;
end;
$$;

notify pgrst, 'reload schema';
