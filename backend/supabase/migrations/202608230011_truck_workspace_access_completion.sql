-- Complete the remaining generic workspace access paths so Truck Equity is
-- returned and granted alongside Cash Book and Payroll.
drop function if exists public.list_my_workspaces();
create function public.list_my_workspaces()
returns table (
  workspace_id uuid, workspace_name text, accent_color text,
  member_role public.workspace_role,
  book_enabled boolean, book_permission public.app_permission,
  payroll_enabled boolean, payroll_permission public.app_permission,
  truck_enabled boolean, truck_permission public.app_permission
)
language sql security definer set search_path = public as $$
  select w.id, w.name, w.accent_color, m.role,
    coalesce(ab.enabled, true),
    coalesce(pb.permission, case when m.role = 'owner' then 'edit'::public.app_permission else 'none'::public.app_permission end),
    coalesce(ap.enabled, true),
    coalesce(pp.permission, case when m.role = 'owner' then 'edit'::public.app_permission else 'none'::public.app_permission end),
    coalesce(at.enabled, true),
    coalesce(pt.permission, case when m.role = 'owner' then 'edit'::public.app_permission else 'none'::public.app_permission end)
  from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id
  left join public.workspace_apps ab on ab.workspace_id = w.id and ab.app_id = 'book'
  left join public.workspace_apps ap on ap.workspace_id = w.id and ap.app_id = 'payroll'
  left join public.workspace_apps at on at.workspace_id = w.id and at.app_id = 'truck'
  left join public.workspace_member_app_permissions pb on pb.workspace_id = w.id and pb.user_id = auth.uid() and pb.app_id = 'book'
  left join public.workspace_member_app_permissions pp on pp.workspace_id = w.id and pp.user_id = auth.uid() and pp.app_id = 'payroll'
  left join public.workspace_member_app_permissions pt on pt.workspace_id = w.id and pt.user_id = auth.uid() and pt.app_id = 'truck'
  where m.user_id = auth.uid() and w.deletion_status = 'active'
  order by (m.role = 'owner') desc, lower(w.name);
$$;

create or replace function public.set_member_workspace_access(target_workspace uuid, target_user uuid, enabled boolean, approval_id uuid default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_workspace_owner(target_workspace) then raise exception 'Only workspace owners can change company access'; end if;
  if not public.approval_is_granted(target_workspace, 'change_permissions', target_user, approval_id) then raise exception 'Owner approval is required before changing access'; end if;
  if target_user = auth.uid() and not enabled then raise exception 'Company owners cannot remove themselves'; end if;
  if enabled then
    insert into public.workspace_members (workspace_id, user_id, role)
      values (target_workspace, target_user, 'member') on conflict (workspace_id, user_id) do nothing;
    insert into public.workspace_member_app_permissions (workspace_id, user_id, app_id, permission)
      values (target_workspace, target_user, 'book', 'edit'),
             (target_workspace, target_user, 'payroll', 'edit'),
             (target_workspace, target_user, 'truck', 'edit')
      on conflict (workspace_id, user_id, app_id) do nothing;
  else
    delete from public.workspace_members where workspace_id = target_workspace and user_id = target_user and role <> 'owner';
  end if;
  return enabled;
end; $$;

create or replace function public.set_member_workspace_access(target_workspace uuid, target_user uuid, enabled boolean)
returns boolean language sql security definer set search_path = public as $$
  select public.set_member_workspace_access(target_workspace, target_user, enabled, null);
$$;

grant execute on function public.list_my_workspaces() to authenticated;
grant execute on function public.set_member_workspace_access(uuid, uuid, boolean, uuid) to authenticated;
grant execute on function public.set_member_workspace_access(uuid, uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
