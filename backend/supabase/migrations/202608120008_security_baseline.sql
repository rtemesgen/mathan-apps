-- Security baseline: enforce app permissions on every legacy data path and add
-- optimistic concurrency/auditing for the canonical JSON snapshots.

create or replace function public.audit_workspace_event(
  target_workspace uuid,
  target_record_type text,
  target_record_id uuid,
  target_action text,
  target_previous jsonb default null,
  target_next jsonb default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare event_id uuid;
begin
  if auth.uid() is null or not public.is_workspace_member(target_workspace) then
    raise exception 'Workspace access required';
  end if;
  insert into public.audit_events(workspace_id, actor_id, record_type, record_id, action, previous_data, next_data)
    values (target_workspace, auth.uid(), target_record_type, target_record_id, target_action, target_previous, target_next)
    returning id into event_id;
  return event_id;
end;
$$;

revoke all on public.audit_events from authenticated;
drop policy if exists "members view audit events" on public.audit_events;
create policy "owners view audit events" on public.audit_events for select
  using (public.is_workspace_owner(workspace_id));
grant select on public.audit_events to authenticated;
grant execute on function public.audit_workspace_event(uuid, text, uuid, text, jsonb, jsonb) to authenticated;

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare workspace uuid; action_name text; before_data jsonb; after_data jsonb;
begin
  workspace := coalesce((to_jsonb(new)->>'workspace_id')::uuid, (to_jsonb(old)->>'workspace_id')::uuid);
  action_name := lower(tg_op);
  before_data := case when tg_op in ('UPDATE','DELETE') then jsonb_build_object('id', old.id) else null end;
  after_data := case when tg_op in ('INSERT','UPDATE') then jsonb_build_object('id', new.id) else null end;
  if workspace is not null then
    insert into public.audit_events(workspace_id, actor_id, record_type, record_id, action, previous_data, next_data)
      values (workspace, auth.uid(), tg_table_name, coalesce(new.id, old.id), action_name, before_data, after_data);
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.audit_membership_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_events(workspace_id, actor_id, record_type, record_id, action, previous_data, next_data)
    values (coalesce(new.workspace_id, old.workspace_id), auth.uid(), 'workspace_member', coalesce(new.user_id, old.user_id), lower(tg_op),
      case when tg_op in ('UPDATE','DELETE') then jsonb_build_object('user_id', old.user_id, 'role', old.role) end,
      case when tg_op in ('INSERT','UPDATE') then jsonb_build_object('user_id', new.user_id, 'role', new.role) end);
  return coalesce(new, old);
end;
$$;

create or replace function public.audit_permission_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_events(workspace_id, actor_id, record_type, record_id, action, previous_data, next_data)
    values (coalesce(new.workspace_id, old.workspace_id), auth.uid(), 'app_permission', new.user_id,
      'permission_' || lower(tg_op),
      case when tg_op in ('UPDATE','DELETE') then jsonb_build_object('app_id', old.app_id, 'permission', old.permission) end,
      case when tg_op in ('INSERT','UPDATE') then jsonb_build_object('app_id', new.app_id, 'permission', new.permission) end);
  return coalesce(new, old);
end;
$$;

create or replace function public.audit_invitation_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_events(workspace_id, actor_id, record_type, record_id, action, previous_data, next_data)
    values (coalesce(new.workspace_id, old.workspace_id), auth.uid(), 'workspace_invitation', coalesce(new.id, old.id),
      case when tg_op = 'INSERT' then 'invitation_created' else 'invitation_' || lower(coalesce(new.status, old.status)) end,
      case when tg_op in ('UPDATE','DELETE') then jsonb_build_object('status', old.status) end,
      case when tg_op in ('INSERT','UPDATE') then jsonb_build_object('status', new.status) end);
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_workspace_members on public.workspace_members;
create trigger audit_workspace_members after insert or update or delete on public.workspace_members
  for each row execute function public.audit_membership_change();
drop trigger if exists audit_workspace_permissions on public.workspace_member_app_permissions;
create trigger audit_workspace_permissions after insert or update or delete on public.workspace_member_app_permissions
  for each row execute function public.audit_permission_change();
drop trigger if exists audit_workspace_invitations on public.workspace_invitations;
create trigger audit_workspace_invitations after insert or update or delete on public.workspace_invitations
  for each row execute function public.audit_invitation_change();

-- Legacy tables are retained for compatibility, but the snapshot-based client
-- must not be able to use them as an authorization bypass.
revoke select, insert, update, delete on public.cash_books, public.cash_transactions, public.employees,
  public.salary_changes, public.payroll_transactions, public.record_attachments,
  public.cash_transaction_attachments from authenticated;

drop policy if exists "members access cash books" on public.cash_books;
drop policy if exists "members access cash transactions" on public.cash_transactions;
drop policy if exists "members access employees" on public.employees;
drop policy if exists "members access salary changes" on public.salary_changes;
drop policy if exists "members access payroll transactions" on public.payroll_transactions;
drop policy if exists "members access attachments" on public.record_attachments;
drop policy if exists "members access cash transaction attachments" on public.cash_transaction_attachments;

create policy "book viewers read cash books" on public.cash_books for select using (public.can_view_workspace_app(workspace_id, 'book'));
create policy "book viewers read cash transactions" on public.cash_transactions for select using (
  public.can_view_workspace_app(cash_transactions.workspace_id, 'book') and exists (select 1 from public.cash_books b where b.id = cash_transactions.book_id and b.workspace_id = cash_transactions.workspace_id)
);
create policy "payroll viewers read employees" on public.employees for select using (public.can_view_workspace_app(workspace_id, 'payroll'));
create policy "payroll viewers read salary changes" on public.salary_changes for select using (
  public.can_view_workspace_app(salary_changes.workspace_id, 'payroll') and exists (select 1 from public.employees e where e.id = salary_changes.employee_id and e.workspace_id = salary_changes.workspace_id)
);
create policy "payroll viewers read payroll transactions" on public.payroll_transactions for select using (
  public.can_view_workspace_app(payroll_transactions.workspace_id, 'payroll') and exists (select 1 from public.employees e where e.id = payroll_transactions.employee_id and e.workspace_id = payroll_transactions.workspace_id)
);
create policy "book viewers read attachments" on public.record_attachments for select using (public.can_view_workspace_app(workspace_id, case when record_type like 'payroll%' then 'payroll' else 'book' end));
create policy "book viewers read transaction attachments" on public.cash_transaction_attachments for select using (
  exists (select 1 from public.cash_transactions t where t.id = cash_transaction_id and public.can_view_workspace_app(t.workspace_id, 'book'))
);

-- Explicit write policies remain in place for a future verified compatibility
-- client. Authenticated grants are revoked above, so the current snapshot
-- client cannot use these tables as a second write path.
create policy "book editors write cash books" on public.cash_books for insert with check (public.can_edit_workspace_app(workspace_id, 'book'));
create policy "book editors update cash books" on public.cash_books for update using (public.can_edit_workspace_app(cash_books.workspace_id, 'book')) with check (public.can_edit_workspace_app(workspace_id, 'book'));
create policy "book editors delete cash books" on public.cash_books for delete using (public.can_edit_workspace_app(workspace_id, 'book'));
create policy "book editors write cash transactions" on public.cash_transactions for insert with check (
  public.can_edit_workspace_app(cash_transactions.workspace_id, 'book') and exists (select 1 from public.cash_books b where b.id = cash_transactions.book_id and b.workspace_id = cash_transactions.workspace_id)
);
create policy "book editors update cash transactions" on public.cash_transactions for update using (public.can_edit_workspace_app(cash_transactions.workspace_id, 'book')) with check (
  public.can_edit_workspace_app(cash_transactions.workspace_id, 'book') and exists (select 1 from public.cash_books b where b.id = cash_transactions.book_id and b.workspace_id = cash_transactions.workspace_id)
);
create policy "book editors delete cash transactions" on public.cash_transactions for delete using (public.can_edit_workspace_app(workspace_id, 'book'));
create policy "payroll editors write employees" on public.employees for insert with check (public.can_edit_workspace_app(workspace_id, 'payroll'));
create policy "payroll editors update employees" on public.employees for update using (public.can_edit_workspace_app(employees.workspace_id, 'payroll')) with check (public.can_edit_workspace_app(workspace_id, 'payroll'));
create policy "payroll editors delete employees" on public.employees for delete using (public.can_edit_workspace_app(workspace_id, 'payroll'));
create policy "payroll editors write salary changes" on public.salary_changes for insert with check (
  public.can_edit_workspace_app(salary_changes.workspace_id, 'payroll') and exists (select 1 from public.employees e where e.id = salary_changes.employee_id and e.workspace_id = salary_changes.workspace_id)
);
create policy "payroll editors update salary changes" on public.salary_changes for update using (public.can_edit_workspace_app(salary_changes.workspace_id, 'payroll')) with check (
  public.can_edit_workspace_app(salary_changes.workspace_id, 'payroll') and exists (select 1 from public.employees e where e.id = salary_changes.employee_id and e.workspace_id = salary_changes.workspace_id)
);
create policy "payroll editors delete salary changes" on public.salary_changes for delete using (public.can_edit_workspace_app(workspace_id, 'payroll'));
create policy "payroll editors write payroll transactions" on public.payroll_transactions for insert with check (
  public.can_edit_workspace_app(payroll_transactions.workspace_id, 'payroll') and exists (select 1 from public.employees e where e.id = payroll_transactions.employee_id and e.workspace_id = payroll_transactions.workspace_id)
);
create policy "payroll editors update payroll transactions" on public.payroll_transactions for update using (public.can_edit_workspace_app(payroll_transactions.workspace_id, 'payroll')) with check (
  public.can_edit_workspace_app(payroll_transactions.workspace_id, 'payroll') and exists (select 1 from public.employees e where e.id = payroll_transactions.employee_id and e.workspace_id = payroll_transactions.workspace_id)
);
create policy "payroll editors delete payroll transactions" on public.payroll_transactions for delete using (public.can_edit_workspace_app(workspace_id, 'payroll'));
create policy "app editors write attachments" on public.record_attachments for insert with check (public.can_edit_workspace_app(workspace_id, case when record_type like 'payroll%' then 'payroll' else 'book' end));
create policy "app editors update attachments" on public.record_attachments for update using (public.can_edit_workspace_app(record_attachments.workspace_id, case when record_type like 'payroll%' then 'payroll' else 'book' end)) with check (public.can_edit_workspace_app(workspace_id, case when record_type like 'payroll%' then 'payroll' else 'book' end));
create policy "app editors delete attachments" on public.record_attachments for delete using (public.can_edit_workspace_app(workspace_id, case when record_type like 'payroll%' then 'payroll' else 'book' end));
create policy "book editors write transaction attachments" on public.cash_transaction_attachments for insert with check (
  exists (select 1 from public.cash_transactions t where t.id = cash_transaction_id and public.can_edit_workspace_app(t.workspace_id, 'book'))
);
create policy "book editors update transaction attachments" on public.cash_transaction_attachments for update using (
  exists (select 1 from public.cash_transactions t where t.id = cash_transaction_id and public.can_edit_workspace_app(t.workspace_id, 'book'))
) with check (
  exists (select 1 from public.cash_transactions t where t.id = cash_transaction_id and public.can_edit_workspace_app(t.workspace_id, 'book'))
);
create policy "book editors delete transaction attachments" on public.cash_transaction_attachments for delete using (
  exists (select 1 from public.cash_transactions t where t.id = cash_transaction_id and public.can_edit_workspace_app(t.workspace_id, 'book'))
);

-- Remove the legacy direct phone-add path. The invitation RPC remains the only
-- supported way to add an existing account by phone.
revoke execute on function public.add_workspace_member_by_phone(uuid, text, public.app_permission) from authenticated;
drop function if exists public.add_workspace_member_by_phone(uuid, text, public.app_permission);

create or replace function public.write_app_state_snapshot(
  target_workspace uuid,
  target_domain text,
  expected_revision bigint,
  target_payload jsonb,
  audit_action text default 'snapshot_written',
  affected_client_ids jsonb default '[]'::jsonb
)
returns table(status text, revision bigint, payload jsonb, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare current_row public.app_state_snapshots;
declare app_name text := case split_part(target_domain, ':', 1) when 'cash_book' then 'book' else 'payroll' end;
begin
  if not public.can_edit_workspace_app(target_workspace, app_name) then raise exception 'Edit permission required'; end if;
  if target_domain not in ('cash_book:books','cash_book:transactions','payroll:employees','payroll:transactions','payroll:custom-apps') then raise exception 'Invalid snapshot domain'; end if;
  select * into current_row from public.app_state_snapshots where workspace_id = target_workspace and domain = target_domain for update;
  if current_row.workspace_id is not null and current_row.revision <> coalesce(expected_revision, 0) then
    return query select 'conflict', current_row.revision, current_row.payload, current_row.updated_at;
    return;
  end if;
  if current_row.workspace_id is null then
    insert into public.app_state_snapshots(workspace_id, domain, payload, revision)
      values (target_workspace, target_domain, target_payload, 1)
      returning app_state_snapshots.* into current_row;
  else
    update public.app_state_snapshots set payload = target_payload, revision = current_row.revision + 1, updated_at = now()
      where workspace_id = target_workspace and domain = target_domain
      returning app_state_snapshots.* into current_row;
  end if;
  insert into public.audit_events(workspace_id, actor_id, record_type, record_id, action, next_data)
    values (target_workspace, auth.uid(), 'app_state_snapshot', null, audit_action,
      jsonb_build_object('domain', target_domain, 'revision', current_row.revision, 'affected_client_ids', affected_client_ids));
  return query select 'written', current_row.revision, current_row.payload, current_row.updated_at;
end;
$$;
grant execute on function public.write_app_state_snapshot(uuid, text, bigint, jsonb, text, jsonb) to authenticated;

create or replace function public.count_my_workspace_invitations()
returns bigint language sql security definer set search_path = public as $$
  select count(*) from public.workspace_invitations
  where lower(email) = lower(coalesce((select email from auth.users where id = auth.uid()), ''))
    and status = 'pending' and expires_at > now();
$$;
grant execute on function public.count_my_workspace_invitations() to authenticated;

notify pgrst, 'reload schema';
