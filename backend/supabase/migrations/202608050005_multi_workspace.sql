alter table public.workspaces
  add column if not exists accent_color text not null default '#54623E'
  check (accent_color ~ '^#[0-9A-Fa-f]{6}$');

create or replace function public.create_workspace(workspace_name text)
returns public.workspaces language plpgsql security definer set search_path = public as $$
declare created_workspace public.workspaces;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.workspaces (name, created_by, accent_color)
    values (trim(workspace_name), auth.uid(), '#54623E') returning * into created_workspace;
  insert into public.workspace_members (workspace_id, user_id, role)
    values (created_workspace.id, auth.uid(), 'owner');
  insert into public.workspace_member_app_permissions (workspace_id, user_id, app_id, permission)
    values (created_workspace.id, auth.uid(), 'book', 'edit'), (created_workspace.id, auth.uid(), 'payroll', 'edit');
  return created_workspace;
end;
$$;

create or replace function public.list_my_workspaces()
returns table (
  workspace_id uuid,
  workspace_name text,
  accent_color text,
  member_role public.workspace_role,
  book_enabled boolean,
  book_permission public.app_permission,
  payroll_enabled boolean,
  payroll_permission public.app_permission
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
  where m.user_id = auth.uid()
  order by (m.role = 'owner') desc, lower(w.name);
$$;

grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.list_my_workspaces() to authenticated;
