-- Final authorization functions: app switches and per-user permissions are
-- evaluated together for every request. Owners are not special-cased here;
-- an owner can be restricted only after ownership is transferred.
create or replace function public.can_view_workspace_app(target_workspace uuid, target_app text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.workspace_app_enabled(target_workspace, target_app) and exists (
    select 1 from public.workspace_members m
    left join public.workspace_member_app_permissions p on p.workspace_id = m.workspace_id and p.user_id = m.user_id and p.app_id = target_app
    where m.workspace_id = target_workspace and m.user_id = auth.uid()
      and coalesce(p.permission, 'none') in ('view', 'edit')
  );
$$;

create or replace function public.can_edit_workspace_app(target_workspace uuid, target_app text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.workspace_app_enabled(target_workspace, target_app) and exists (
    select 1 from public.workspace_members m
    left join public.workspace_member_app_permissions p on p.workspace_id = m.workspace_id and p.user_id = m.user_id and p.app_id = target_app
    where m.workspace_id = target_workspace and m.user_id = auth.uid() and p.permission = 'edit'
  );
$$;

create or replace function public.list_my_workspaces()
returns table (workspace_id uuid, workspace_name text, accent_color text, member_role public.workspace_role, book_enabled boolean, book_permission public.app_permission, payroll_enabled boolean, payroll_permission public.app_permission)
language sql security definer set search_path = public as $$
  select w.id, w.name, w.accent_color, m.role,
    public.workspace_app_enabled(w.id, 'book'), coalesce(pb.permission, 'none'::public.app_permission),
    public.workspace_app_enabled(w.id, 'payroll'), coalesce(pp.permission, 'none'::public.app_permission)
  from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
  left join public.workspace_member_app_permissions pb on pb.workspace_id = w.id and pb.user_id = auth.uid() and pb.app_id = 'book'
  left join public.workspace_member_app_permissions pp on pp.workspace_id = w.id and pp.user_id = auth.uid() and pp.app_id = 'payroll'
  where m.user_id = auth.uid() order by (m.role = 'owner') desc, lower(w.name);
$$;
grant execute on function public.can_view_workspace_app(uuid, text) to authenticated;
grant execute on function public.can_edit_workspace_app(uuid, text) to authenticated;
grant execute on function public.list_my_workspaces() to authenticated;
