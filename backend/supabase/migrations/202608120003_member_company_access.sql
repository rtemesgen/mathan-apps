create or replace function public.list_member_company_access(target_user uuid)
returns table (workspace_id uuid, workspace_name text, is_member boolean, member_role public.workspace_role)
language plpgsql security definer set search_path = public as $$
begin
  return query
  select w.id, w.name,
    exists (select 1 from public.workspace_members tm where tm.workspace_id = w.id and tm.user_id = target_user),
    (select tm.role from public.workspace_members tm where tm.workspace_id = w.id and tm.user_id = target_user limit 1)
  from public.workspaces w
  join public.workspace_members owner_members on owner_members.workspace_id = w.id
    and owner_members.user_id = auth.uid() and owner_members.role = 'owner'
  order by w.name;
end;
$$;

create or replace function public.set_member_workspace_access(target_workspace uuid, target_user uuid, enabled boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_workspace_owner(target_workspace) then
    raise exception 'Only workspace owners can change company access';
  end if;
  if target_user = auth.uid() and not enabled then
    raise exception 'Company owners cannot remove themselves';
  end if;

  if enabled then
    insert into public.workspace_members (workspace_id, user_id, role)
      values (target_workspace, target_user, 'member')
      on conflict (workspace_id, user_id) do nothing;
    insert into public.workspace_member_app_permissions (workspace_id, user_id, app_id, permission)
      values (target_workspace, target_user, 'book', 'edit'), (target_workspace, target_user, 'payroll', 'edit')
      on conflict (workspace_id, user_id, app_id) do nothing;
  else
    delete from public.workspace_members
      where workspace_id = target_workspace and user_id = target_user and role <> 'owner';
  end if;
  return enabled;
end;
$$;

grant execute on function public.list_member_company_access(uuid) to authenticated;
grant execute on function public.set_member_workspace_access(uuid, uuid, boolean) to authenticated;
