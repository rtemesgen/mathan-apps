-- Durable notifications and owner approvals.  The existing snapshot client and
-- system-admin Edge Function remain compatible with these additive contracts.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  notification_type text not null check (char_length(trim(notification_type)) between 2 and 80),
  title text not null check (char_length(trim(title)) between 1 and 160),
  body text not null check (char_length(trim(body)) between 1 and 1000),
  route text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications" on public.notifications for select using (user_id = auth.uid());
drop policy if exists "users update own notifications" on public.notifications;
create policy "users update own notifications" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.notifications from authenticated;
grant select, update on public.notifications to authenticated;

create or replace function public.mark_notification_read(target_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.notifications set read_at = coalesce(read_at, now()) where id = target_id and user_id = auth.uid();
  return found;
end; $$;
create or replace function public.mark_all_notifications_read()
returns integer language plpgsql security definer set search_path = public as $$
declare changed integer;
begin
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null;
  get diagnostics changed = row_count;
  return changed;
end; $$;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

create or replace function public.notify_user(target_user uuid, target_type text, target_title text, target_body text, target_route text default null, target_workspace uuid default null, target_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare notification_id uuid;
begin
  insert into public.notifications(user_id, workspace_id, notification_type, title, body, route, metadata)
    values (target_user, target_workspace, target_type, trim(target_title), trim(target_body), target_route, coalesce(target_metadata, '{}'::jsonb))
    returning id into notification_id;
  return notification_id;
end; $$;
revoke all on function public.notify_user(uuid, text, text, text, text, uuid, jsonb) from public, authenticated;

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  approver_id uuid references auth.users(id) on delete set null,
  action_type text not null check (char_length(trim(action_type)) between 2 and 80),
  target_record_type text not null check (char_length(trim(target_record_type)) between 2 and 80),
  target_record_id uuid,
  reason text not null check (char_length(trim(reason)) between 2 and 1000),
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','expired')),
  decision_comment text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days')
);
create index if not exists approval_requests_workspace_status_idx on public.approval_requests(workspace_id, status, created_at desc);
alter table public.approval_requests enable row level security;
drop policy if exists "members view approval requests" on public.approval_requests;
create policy "members view approval requests" on public.approval_requests for select using (public.is_workspace_member(workspace_id) and (requester_id = auth.uid() or public.is_workspace_owner(workspace_id)));
revoke all on public.approval_requests from authenticated;
grant select on public.approval_requests to authenticated;

create or replace function public.create_approval_request(target_workspace uuid, target_action text, target_record_type text, target_record_id uuid, target_reason text, target_metadata jsonb default '{}'::jsonb)
returns public.approval_requests language plpgsql security definer set search_path = public as $$
declare request public.approval_requests; owner_row record;
begin
  if auth.uid() is null or not public.is_workspace_member(target_workspace) then raise exception 'Workspace access required'; end if;
  insert into public.approval_requests(workspace_id, requester_id, action_type, target_record_type, target_record_id, reason, metadata)
    values (target_workspace, auth.uid(), trim(target_action), trim(target_record_type), target_record_id, trim(target_reason), coalesce(target_metadata, '{}'::jsonb)) returning * into request;
  for owner_row in select user_id from public.workspace_members where workspace_id = target_workspace and role = 'owner' and user_id <> auth.uid() loop
    perform public.notify_user(owner_row.user_id, 'approval_requested', 'Approval requested', 'A workspace action needs your approval.', '/settings?section=approvals', target_workspace, jsonb_build_object('approval_id', request.id));
  end loop;
  return request;
end; $$;

create or replace function public.decide_approval_request(target_request uuid, target_decision text, target_comment text default null)
returns public.approval_requests language plpgsql security definer set search_path = public as $$
declare request public.approval_requests;
begin
  select * into request from public.approval_requests where id = target_request for update;
  if request.id is null or not public.is_workspace_owner(request.workspace_id) then raise exception 'Approval access required'; end if;
  if request.requester_id = auth.uid() then raise exception 'The requester cannot approve their own action'; end if;
  if request.status <> 'pending' or request.expires_at <= now() then raise exception 'Approval is no longer pending'; end if;
  if target_decision not in ('approved','rejected') then raise exception 'Invalid approval decision'; end if;
  update public.approval_requests set status = target_decision, approver_id = auth.uid(), decision_comment = nullif(trim(target_comment), ''), decided_at = now() where id = target_request returning * into request;
  perform public.notify_user(request.requester_id, 'approval_decided', 'Approval decision', 'Your workspace action was ' || target_decision || '.', '/settings?section=approvals', request.workspace_id, jsonb_build_object('approval_id', request.id, 'status', request.status));
  return request;
end; $$;
grant execute on function public.create_approval_request(uuid, text, text, uuid, text, jsonb) to authenticated;
grant execute on function public.decide_approval_request(uuid, text, text) to authenticated;

create or replace function public.list_my_notifications(target_limit integer default 50)
returns setof public.notifications language sql security definer set search_path = public as $$
  select * from public.notifications where user_id = auth.uid() order by created_at desc limit greatest(1, least(target_limit, 100));
$$;
grant execute on function public.list_my_notifications(integer) to authenticated;

-- Notify an already-registered recipient when an email invitation is created.
create or replace function public.notify_invitation_recipient()
returns trigger language plpgsql security definer set search_path = public as $$
declare recipient uuid; workspace_name text;
begin
  select id into recipient from auth.users where lower(email) = lower(new.email) limit 1;
  select name into workspace_name from public.workspaces where id = new.workspace_id;
  if recipient is not null then
    perform public.notify_user(recipient, 'invitation', 'New company invitation', 'You were invited to join ' || coalesce(workspace_name, 'a company') || '.', '/settings?section=invites', new.workspace_id, jsonb_build_object('invitation_id', new.id));
  end if;
  return new;
end; $$;
drop trigger if exists notify_invitation_recipient on public.workspace_invitations;
create trigger notify_invitation_recipient after insert on public.workspace_invitations for each row execute function public.notify_invitation_recipient();

-- Legacy relational records already use soft deletion in the main data tables.
-- Extend the same 30-day recovery contract to attachments and invitations.
alter table public.salary_changes add column if not exists deleted_at timestamptz;
alter table public.record_attachments add column if not exists deleted_at timestamptz;
alter table public.workspace_invitations add column if not exists deleted_at timestamptz;
create index if not exists salary_changes_trash_idx on public.salary_changes(workspace_id, deleted_at) where deleted_at is not null;
create index if not exists record_attachments_trash_idx on public.record_attachments(workspace_id, deleted_at) where deleted_at is not null;
create index if not exists workspace_invitations_trash_idx on public.workspace_invitations(workspace_id, deleted_at) where deleted_at is not null;

create or replace function public.list_workspace_trash(target_workspace uuid)
returns table(source_table text, record_id uuid, label text, deleted_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_workspace_owner(target_workspace) then raise exception 'Owner access required'; end if;
  return query
    select 'cash_books', id, name, cash_books.deleted_at from public.cash_books where workspace_id = target_workspace and cash_books.deleted_at is not null
    union all select 'cash_transactions', id, remark, cash_transactions.deleted_at from public.cash_transactions where workspace_id = target_workspace and cash_transactions.deleted_at is not null
    union all select 'employees', id, name, employees.deleted_at from public.employees where workspace_id = target_workspace and employees.deleted_at is not null
    union all select 'payroll_transactions', id, coalesce(notes, reference_no, type::text), payroll_transactions.deleted_at from public.payroll_transactions where workspace_id = target_workspace and payroll_transactions.deleted_at is not null
    union all select 'salary_changes', id, reason, salary_changes.deleted_at from public.salary_changes where workspace_id = target_workspace and salary_changes.deleted_at is not null
    union all select 'record_attachments', id, file_name, record_attachments.deleted_at from public.record_attachments where workspace_id = target_workspace and record_attachments.deleted_at is not null
    union all select 'workspace_invitations', id, email, workspace_invitations.deleted_at from public.workspace_invitations where workspace_id = target_workspace and workspace_invitations.deleted_at is not null
    order by deleted_at desc;
end; $$;

create or replace function public.restore_workspace_trash(target_table text, target_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare target_workspace uuid; restored_count integer := 0;
begin
  if target_table = 'cash_books' then select workspace_id into target_workspace from public.cash_books where id = target_id;
  elsif target_table = 'cash_transactions' then select workspace_id into target_workspace from public.cash_transactions where id = target_id;
  elsif target_table = 'employees' then select workspace_id into target_workspace from public.employees where id = target_id;
  elsif target_table = 'payroll_transactions' then select workspace_id into target_workspace from public.payroll_transactions where id = target_id;
  elsif target_table = 'salary_changes' then select workspace_id into target_workspace from public.salary_changes where id = target_id;
  elsif target_table = 'record_attachments' then select workspace_id into target_workspace from public.record_attachments where id = target_id;
  elsif target_table = 'workspace_invitations' then select workspace_id into target_workspace from public.workspace_invitations where id = target_id;
  else raise exception 'Unsupported trash record'; end if;
  if target_workspace is null or not public.is_workspace_owner(target_workspace) then raise exception 'Owner access required'; end if;
  execute format('update public.%I set deleted_at = null where id = $1', target_table) using target_id;
  get diagnostics restored_count = row_count;
  if restored_count > 0 then perform public.audit_workspace_event(target_workspace, target_table, target_id, 'restored_from_trash'); end if;
  return restored_count > 0;
end; $$;

create or replace function public.purge_expired_workspace_trash(target_workspace uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare removed integer := 0; count_removed integer;
begin
  if not public.is_workspace_owner(target_workspace) then raise exception 'Owner access required'; end if;
  delete from public.cash_transactions where workspace_id = target_workspace and deleted_at < now() - interval '30 days'; get diagnostics count_removed = row_count; removed := removed + count_removed;
  delete from public.cash_books where workspace_id = target_workspace and deleted_at < now() - interval '30 days'; get diagnostics count_removed = row_count; removed := removed + count_removed;
  delete from public.employees where workspace_id = target_workspace and deleted_at < now() - interval '30 days'; get diagnostics count_removed = row_count; removed := removed + count_removed;
  delete from public.payroll_transactions where workspace_id = target_workspace and deleted_at < now() - interval '30 days'; get diagnostics count_removed = row_count; removed := removed + count_removed;
  delete from public.salary_changes where workspace_id = target_workspace and deleted_at < now() - interval '30 days'; get diagnostics count_removed = row_count; removed := removed + count_removed;
  delete from public.record_attachments where workspace_id = target_workspace and deleted_at < now() - interval '30 days'; get diagnostics count_removed = row_count; removed := removed + count_removed;
  delete from public.workspace_invitations where workspace_id = target_workspace and deleted_at < now() - interval '30 days'; get diagnostics count_removed = row_count; removed := removed + count_removed;
  return removed;
end; $$;
grant execute on function public.list_workspace_trash(uuid) to authenticated;
grant execute on function public.restore_workspace_trash(text, uuid) to authenticated;
grant execute on function public.purge_expired_workspace_trash(uuid) to authenticated;
