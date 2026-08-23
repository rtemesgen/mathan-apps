-- Safe owner-controlled workspace deletion with a 30-day recovery window.
alter table public.workspaces
  add column if not exists deletion_status text not null default 'active'
    check (deletion_status in ('active', 'scheduled')),
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_scheduled_for timestamptz,
  add column if not exists deletion_requested_by uuid references auth.users(id) on delete set null;

create index if not exists workspaces_deletion_idx
  on public.workspaces (deletion_status, deletion_scheduled_for);

create or replace function public.request_workspace_deletion(target_workspace uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  scheduled_at timestamptz := now() + interval '30 days';
  auth_time bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  auth_time := nullif((auth.jwt() ->> 'auth_time'), '')::bigint;
  if auth_time is null or to_timestamp(auth_time) < now() - interval '15 minutes' then
    raise exception 'Recent authentication required';
  end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace and user_id = auth.uid() and role = 'owner'
  ) then raise exception 'Only the company owner can schedule deletion'; end if;
  update public.workspaces
    set deletion_status = 'scheduled', deletion_requested_at = now(),
        deletion_scheduled_for = scheduled_at, deletion_requested_by = auth.uid(), updated_at = now()
    where id = target_workspace and deletion_status = 'active';
  if not found then raise exception 'Company is already scheduled for deletion'; end if;
  perform public.audit_workspace_event(target_workspace, 'workspace', target_workspace, 'workspace_deletion_scheduled', jsonb_build_object('scheduled_for', scheduled_at), null);
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
        deletion_scheduled_for = null, deletion_requested_by = null, updated_at = now()
    where id = target_workspace and deletion_status = 'scheduled' and deletion_scheduled_for > now();
  if not found then raise exception 'Company is not awaiting deletion or its recovery window has expired'; end if;
  perform public.audit_workspace_event(target_workspace, 'workspace', target_workspace, 'workspace_deletion_cancelled', null, null);
  return true;
end;
$$;

create or replace function public.get_workspace_deletion_status(target_workspace uuid)
returns table(status text, scheduled_for timestamptz, days_remaining integer)
language sql
security definer
set search_path = public
as $$
  select w.deletion_status, w.deletion_scheduled_for,
    case when w.deletion_scheduled_for is null then null
         else greatest(0, ceil(extract(epoch from (w.deletion_scheduled_for - now())) / 86400.0)::integer)
    end
  from public.workspaces w
  where w.id = target_workspace
    and exists (select 1 from public.workspace_members m where m.workspace_id = w.id and m.user_id = auth.uid() and m.role = 'owner');
$$;

grant execute on function public.request_workspace_deletion(uuid) to authenticated;
grant execute on function public.cancel_workspace_deletion(uuid) to authenticated;
grant execute on function public.get_workspace_deletion_status(uuid) to authenticated;

create or replace function public.can_view_workspace_app(target_workspace uuid, target_app text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspaces w where w.id = target_workspace and w.deletion_status = 'active')
    and public.workspace_app_enabled(target_workspace, target_app)
    and exists (select 1 from public.workspace_members m left join public.workspace_member_app_permissions p on p.workspace_id = m.workspace_id and p.user_id = m.user_id and p.app_id = target_app where m.workspace_id = target_workspace and m.user_id = auth.uid() and coalesce(p.permission, 'none') in ('view', 'edit'));
$$;
create or replace function public.can_edit_workspace_app(target_workspace uuid, target_app text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspaces w where w.id = target_workspace and w.deletion_status = 'active')
    and public.workspace_app_enabled(target_workspace, target_app)
    and exists (select 1 from public.workspace_members m left join public.workspace_member_app_permissions p on p.workspace_id = m.workspace_id and p.user_id = m.user_id and p.app_id = target_app where m.workspace_id = target_workspace and m.user_id = auth.uid() and coalesce(p.permission, 'none') = 'edit');
$$;
grant execute on function public.can_view_workspace_app(uuid, text) to authenticated;
grant execute on function public.can_edit_workspace_app(uuid, text) to authenticated;

-- Scheduled companies must not be returned to ordinary workspace pickers.
create or replace function public.list_my_workspaces()
returns table (
  workspace_id uuid, workspace_name text, accent_color text,
  member_role public.workspace_role, book_enabled boolean, book_permission public.app_permission,
  payroll_enabled boolean, payroll_permission public.app_permission
)
language sql security definer set search_path = public as $$
  select w.id, w.name, w.accent_color, m.role,
    coalesce(ab.enabled, true),
    coalesce(pb.permission, case when m.role = 'owner' then 'edit'::public.app_permission else 'none'::public.app_permission end),
    coalesce(ap.enabled, true),
    coalesce(pp.permission, case when m.role = 'owner' then 'edit'::public.app_permission else 'none'::public.app_permission end)
  from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id
  left join public.workspace_apps ab on ab.workspace_id = w.id and ab.app_id = 'book'
  left join public.workspace_apps ap on ap.workspace_id = w.id and ap.app_id = 'payroll'
  left join public.workspace_member_app_permissions pb on pb.workspace_id = w.id and pb.user_id = auth.uid() and pb.app_id = 'book'
  left join public.workspace_member_app_permissions pp on pp.workspace_id = w.id and pp.user_id = auth.uid() and pp.app_id = 'payroll'
  where m.user_id = auth.uid() and w.deletion_status = 'active'
  order by (m.role = 'owner') desc, lower(w.name);
$$;

create or replace function public.list_my_workspace_deletions()
returns table(workspace_id uuid, workspace_name text, accent_color text, member_role public.workspace_role, deletion_status text, deletion_scheduled_for timestamptz)
language sql security definer set search_path = public as $$
  select w.id, w.name, w.accent_color, m.role, w.deletion_status, w.deletion_scheduled_for
  from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
  where m.user_id = auth.uid() and m.role = 'owner' and w.deletion_status = 'scheduled'
  order by w.deletion_scheduled_for;
$$;
grant execute on function public.list_my_workspace_deletions() to authenticated;

-- Called by the lifecycle function using the service role after the recovery window.
create or replace function public.list_expired_workspace_deletions(target_limit integer default 100)
returns table(workspace_id uuid)
language sql security definer set search_path = public as $$
  select id from public.workspaces
  where deletion_status = 'scheduled' and deletion_scheduled_for <= now()
  order by deletion_scheduled_for
  limit greatest(1, least(target_limit, 500));
$$;
revoke all on function public.list_expired_workspace_deletions(integer) from public, anon, authenticated;
grant execute on function public.list_expired_workspace_deletions(integer) to service_role;
