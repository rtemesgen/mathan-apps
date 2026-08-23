-- Workspace owners can turn protection on per action. The check lives in the
-- security-definer functions, so clients cannot bypass it by forging requests.
create table if not exists public.workspace_approval_settings (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  action_type text not null check (action_type in ('delete_transaction','run_payroll','change_permissions','transfer_ownership','remove_member')),
  required boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, action_type)
);
alter table public.workspace_approval_settings enable row level security;
revoke all on public.workspace_approval_settings from authenticated;

create or replace function public.set_workspace_approval_required(target_workspace uuid, target_action text, enabled boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_workspace_owner(target_workspace) then raise exception 'Owner access required'; end if;
  if target_action not in ('delete_transaction','run_payroll','change_permissions','transfer_ownership','remove_member') then raise exception 'Unsupported protected action'; end if;
  insert into public.workspace_approval_settings(workspace_id, action_type, required)
    values (target_workspace, target_action, enabled)
    on conflict (workspace_id, action_type) do update set required = excluded.required, updated_at = now();
  return enabled;
end; $$;

create or replace function public.approval_is_granted(target_workspace uuid, target_action text, target_record uuid, approval_id uuid default null)
returns boolean language sql security definer set search_path = public as $$
  select not exists (select 1 from public.workspace_approval_settings s where s.workspace_id = target_workspace and s.action_type = target_action and s.required)
    or exists (select 1 from public.approval_requests a where a.id = approval_id and a.workspace_id = target_workspace and a.action_type = target_action and a.target_record_id = target_record and a.status = 'approved');
$$;

create or replace function public.remove_workspace_member(target_workspace uuid, target_user uuid, approval_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_workspace_owner(target_workspace) then raise exception 'Owner access required'; end if;
  if not public.approval_is_granted(target_workspace, 'remove_member', target_user, approval_id) then raise exception 'Owner approval is required before removing this member'; end if;
  delete from public.workspace_members where workspace_id = target_workspace and user_id = target_user and role <> 'owner';
end; $$;

-- Preserve the existing client signatures while applying the same guard.
create or replace function public.remove_workspace_member(target_workspace uuid, target_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_workspace_owner(target_workspace) then raise exception 'Owner access required'; end if;
  if not public.approval_is_granted(target_workspace, 'remove_member', target_user, null) then raise exception 'Owner approval is required before removing this member'; end if;
  delete from public.workspace_members where workspace_id = target_workspace and user_id = target_user and role <> 'owner';
end; $$;

create or replace function public.set_member_workspace_access(target_workspace uuid, target_user uuid, enabled boolean, approval_id uuid default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_workspace_owner(target_workspace) then raise exception 'Only workspace owners can change company access'; end if;
  if not public.approval_is_granted(target_workspace, 'change_permissions', target_user, approval_id) then raise exception 'Owner approval is required before changing access'; end if;
  if target_user = auth.uid() and not enabled then raise exception 'Company owners cannot remove themselves'; end if;
  if enabled then
    insert into public.workspace_members (workspace_id, user_id, role) values (target_workspace, target_user, 'member') on conflict (workspace_id, user_id) do nothing;
    insert into public.workspace_member_app_permissions (workspace_id, user_id, app_id, permission) values (target_workspace, target_user, 'book', 'edit'), (target_workspace, target_user, 'payroll', 'edit') on conflict (workspace_id, user_id, app_id) do nothing;
  else
    delete from public.workspace_members where workspace_id = target_workspace and user_id = target_user and role <> 'owner';
  end if;
  return enabled;
end; $$;

create or replace function public.set_member_workspace_access(target_workspace uuid, target_user uuid, enabled boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_workspace_owner(target_workspace) then raise exception 'Only workspace owners can change company access'; end if;
  if not public.approval_is_granted(target_workspace, 'change_permissions', target_user, null) then raise exception 'Owner approval is required before changing access'; end if;
  if target_user = auth.uid() and not enabled then raise exception 'Company owners cannot remove themselves'; end if;
  if enabled then
    insert into public.workspace_members (workspace_id, user_id, role) values (target_workspace, target_user, 'member') on conflict (workspace_id, user_id) do nothing;
    insert into public.workspace_member_app_permissions (workspace_id, user_id, app_id, permission) values (target_workspace, target_user, 'book', 'edit'), (target_workspace, target_user, 'payroll', 'edit') on conflict (workspace_id, user_id, app_id) do nothing;
  else
    delete from public.workspace_members where workspace_id = target_workspace and user_id = target_user and role <> 'owner';
  end if;
  return enabled;
end; $$;

grant execute on function public.set_workspace_approval_required(uuid, text, boolean) to authenticated;
grant execute on function public.approval_is_granted(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.remove_workspace_member(uuid, uuid, uuid) to authenticated;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;
grant execute on function public.set_member_workspace_access(uuid, uuid, boolean, uuid) to authenticated;
grant execute on function public.set_member_workspace_access(uuid, uuid, boolean) to authenticated;
