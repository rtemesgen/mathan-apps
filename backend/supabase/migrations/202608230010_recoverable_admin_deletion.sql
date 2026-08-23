-- Make company and administrator-initiated user deletion recoverable and
-- distinguish independently restorable deletion operations.
alter table public.workspaces
  add column if not exists deletion_origin text not null default 'owner'
    check (deletion_origin in ('owner', 'admin_workspace', 'admin_user')),
  add column if not exists deletion_subject_user_id uuid references auth.users(id) on delete set null;

alter table public.account_deletion_requests
  add column if not exists requested_by uuid references auth.users(id) on delete set null,
  add column if not exists request_source text not null default 'self'
    check (request_source in ('self', 'admin'));

grant select, insert, update, delete on public.account_deletion_requests to service_role;

update public.account_deletion_requests
set requested_by = user_id
where requested_by is null and request_source = 'self';

create or replace function public.request_workspace_deletion(target_workspace uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, auth
as $$
declare scheduled_at timestamptz := now() + interval '30 days';
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace and user_id = auth.uid() and role = 'owner'
  ) then raise exception 'Only the company owner can schedule deletion'; end if;
  update public.workspaces
    set deletion_status = 'scheduled', deletion_requested_at = now(),
        deletion_scheduled_for = scheduled_at, deletion_requested_by = auth.uid(),
        deletion_origin = 'owner', deletion_subject_user_id = null, updated_at = now()
    where id = target_workspace and deletion_status = 'active';
  if not found then raise exception 'Company is already scheduled for deletion'; end if;
  perform public.audit_workspace_event(target_workspace, 'workspace', target_workspace, 'workspace_deletion_scheduled', jsonb_build_object('scheduled_for', scheduled_at, 'origin', 'owner'), null);
  return scheduled_at;
end;
$$;

create or replace function public.cancel_workspace_deletion(target_workspace uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace and user_id = auth.uid() and role = 'owner'
  ) then raise exception 'Only the company owner can restore this company'; end if;
  update public.workspaces
    set deletion_status = 'active', deletion_requested_at = null,
        deletion_scheduled_for = null, deletion_requested_by = null,
        deletion_origin = 'owner', deletion_subject_user_id = null, updated_at = now()
    where id = target_workspace and deletion_status = 'scheduled'
      and deletion_scheduled_for > now() and deletion_origin = 'owner';
  if not found then raise exception 'This company must be restored by a system administrator or its recovery window has expired'; end if;
  perform public.audit_workspace_event(target_workspace, 'workspace', target_workspace, 'workspace_deletion_cancelled', null, null);
  return true;
end;
$$;

create or replace function public.request_account_deletion(delete_owned_workspaces boolean default false)
returns public.account_deletion_requests language plpgsql security definer set search_path = public as $$
declare request public.account_deletion_requests;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not delete_owned_workspaces and exists (select 1 from public.workspace_members where user_id = auth.uid() and role = 'owner') then
    raise exception 'Transfer workspace ownership before deleting your account';
  end if;
  insert into public.account_deletion_requests(user_id, delete_owned_workspaces, requested_by, request_source)
    values (auth.uid(), delete_owned_workspaces, auth.uid(), 'self')
    on conflict (user_id) do update set status = 'pending', requested_at = now(), scheduled_for = now() + interval '30 days',
      cancelled_at = null, completed_at = null, delete_owned_workspaces = excluded.delete_owned_workspaces,
      requested_by = auth.uid(), request_source = 'self'
    returning * into request;
  return request;
end; $$;

create or replace function public.system_admin_schedule_workspace_deletion(target_admin uuid, target_workspace uuid)
returns timestamptz language plpgsql security definer set search_path = public, auth as $$
declare scheduled_at timestamptz := now() + interval '30 days'; owner_id uuid;
begin
  if not exists (select 1 from public.system_admins where user_id = target_admin) then raise exception 'System administrator access required'; end if;
  update public.workspaces set deletion_status = 'scheduled', deletion_requested_at = now(), deletion_scheduled_for = scheduled_at,
    deletion_requested_by = target_admin, deletion_origin = 'admin_workspace', deletion_subject_user_id = null, updated_at = now()
    where id = target_workspace and deletion_status = 'active';
  if not found then raise exception 'Company is already scheduled for deletion or does not exist'; end if;
  select user_id into owner_id from public.workspace_members where workspace_id = target_workspace and role = 'owner' limit 1;
  if owner_id is not null then
    insert into public.notifications(user_id, workspace_id, notification_type, title, body, route)
      values (owner_id, target_workspace, 'workspace_deletion_scheduled', 'Company deletion scheduled',
        'A system administrator scheduled this company for deletion in 30 days.', '/settings');
  end if;
  return scheduled_at;
end; $$;

create or replace function public.system_admin_restore_workspace_deletion(target_admin uuid, target_workspace uuid)
returns boolean language plpgsql security definer set search_path = public, auth as $$
begin
  if not exists (select 1 from public.system_admins where user_id = target_admin) then raise exception 'System administrator access required'; end if;
  update public.workspaces set deletion_status = 'active', deletion_requested_at = null, deletion_scheduled_for = null,
    deletion_requested_by = null, deletion_origin = 'owner', deletion_subject_user_id = null, updated_at = now()
    where id = target_workspace and deletion_status = 'scheduled' and deletion_scheduled_for > now()
      and deletion_origin <> 'admin_user';
  if not found then raise exception 'Restore the deleted user to recover companies scheduled with that account'; end if;
  return true;
end; $$;

create or replace function public.system_admin_schedule_user_deletion(target_admin uuid, target_user uuid, scheduled_at timestamptz)
returns integer language plpgsql security definer set search_path = public, auth as $$
declare affected integer;
begin
  if not exists (select 1 from public.system_admins where user_id = target_admin) then raise exception 'System administrator access required'; end if;
  if target_admin = target_user then raise exception 'You cannot delete your own administrator account'; end if;
  if exists (select 1 from public.system_admins where user_id = target_user) then raise exception 'Protected system administrator accounts cannot be deleted'; end if;
  if scheduled_at <= now() then raise exception 'The recovery deadline must be in the future'; end if;
  insert into public.account_deletion_requests(user_id, status, requested_at, scheduled_for, cancelled_at, completed_at, delete_owned_workspaces, requested_by, request_source)
    values (target_user, 'pending', now(), scheduled_at, null, null, true, target_admin, 'admin')
    on conflict (user_id) do update set status = 'pending', requested_at = now(), scheduled_for = excluded.scheduled_for,
      cancelled_at = null, completed_at = null, delete_owned_workspaces = true, requested_by = target_admin, request_source = 'admin';
  update public.workspaces w set deletion_status = 'scheduled', deletion_requested_at = now(), deletion_scheduled_for = scheduled_at,
    deletion_requested_by = target_admin, deletion_origin = 'admin_user', deletion_subject_user_id = target_user, updated_at = now()
    where w.deletion_status = 'active' and exists (
      select 1 from public.workspace_members m where m.workspace_id = w.id and m.user_id = target_user and m.role = 'owner'
    );
  get diagnostics affected = row_count;
  insert into public.system_user_controls(user_id, status, suspended_until, reason, updated_by, updated_at)
    values (target_user, 'purge_pending', null, 'Scheduled for deletion by a system administrator', target_admin, now())
    on conflict (user_id) do update set status = 'purge_pending', suspended_until = null,
      reason = excluded.reason, updated_by = target_admin, updated_at = now();
  return affected;
end; $$;

create or replace function public.system_admin_restore_user_deletion(target_admin uuid, target_user uuid)
returns integer language plpgsql security definer set search_path = public, auth as $$
declare restored integer;
begin
  if not exists (select 1 from public.system_admins where user_id = target_admin) then raise exception 'System administrator access required'; end if;
  update public.account_deletion_requests set status = 'cancelled', cancelled_at = now()
    where user_id = target_user and status = 'pending' and request_source = 'admin';
  if not found then raise exception 'This user has no administrator-scheduled deletion to restore'; end if;
  update public.workspaces set deletion_status = 'active', deletion_requested_at = null, deletion_scheduled_for = null,
    deletion_requested_by = null, deletion_origin = 'owner', deletion_subject_user_id = null, updated_at = now()
    where deletion_status = 'scheduled' and deletion_origin = 'admin_user' and deletion_subject_user_id = target_user
      and deletion_scheduled_for > now();
  get diagnostics restored = row_count;
  insert into public.system_user_controls(user_id, status, suspended_until, reason, updated_by, updated_at)
    values (target_user, 'active', null, null, target_admin, now())
    on conflict (user_id) do update set status = 'active', suspended_until = null, reason = null, updated_by = target_admin, updated_at = now();
  return restored;
end; $$;

revoke all on function public.system_admin_schedule_workspace_deletion(uuid, uuid) from public, anon, authenticated;
revoke all on function public.system_admin_restore_workspace_deletion(uuid, uuid) from public, anon, authenticated;
revoke all on function public.system_admin_schedule_user_deletion(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.system_admin_restore_user_deletion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.system_admin_schedule_workspace_deletion(uuid, uuid) to service_role;
grant execute on function public.system_admin_restore_workspace_deletion(uuid, uuid) to service_role;
grant execute on function public.system_admin_schedule_user_deletion(uuid, uuid, timestamptz) to service_role;
grant execute on function public.system_admin_restore_user_deletion(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
