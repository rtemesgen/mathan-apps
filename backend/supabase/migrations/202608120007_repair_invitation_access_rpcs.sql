-- Repair migration for environments where the invitation/access migrations were
-- not applied completely or PostgREST has an older schema cache.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.list_member_company_access(target_user uuid)
returns table (workspace_id uuid, workspace_name text, is_member boolean, member_role public.workspace_role)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_workspace_owner((select workspace_id from public.workspace_members where user_id = auth.uid() and role = 'owner' limit 1)) then
    raise exception 'Only workspace owners can view company access';
  end if;
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

-- Explicit grants are repeated intentionally: this is safe and repairs projects
-- where a prior migration created the function but did not grant RPC execution.
grant usage on schema public to authenticated;
grant execute on function public.list_member_company_access(uuid) to authenticated;
grant execute on function public.set_member_workspace_access(uuid, uuid, boolean) to authenticated;
grant execute on function public.list_workspace_members(uuid) to authenticated;
grant execute on function public.create_workspace_invitation(uuid, text, public.app_permission, public.app_permission, integer) to authenticated;
grant execute on function public.revoke_workspace_invitation(uuid) to authenticated;
grant execute on function public.accept_workspace_invitation(text) to authenticated;
grant execute on function public.list_my_workspace_invitations() to authenticated;
grant execute on function public.respond_to_workspace_invitation(uuid, boolean) to authenticated;
grant execute on function public.create_workspace_phone_invitation(uuid, text) to authenticated;
grant execute on function public.lookup_workspace_contacts(uuid, text[]) to authenticated;

-- Ask PostgREST to refresh its function schema cache after this migration.
notify pgrst, 'reload schema';
