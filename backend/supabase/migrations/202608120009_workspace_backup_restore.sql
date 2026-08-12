create or replace function public.restore_workspace_backup(target_backup jsonb, target_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_workspace uuid; item jsonb; domain_name text; restored_user uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(target_backup->>'schema_version', '') <> '1' then raise exception 'Unsupported backup schema'; end if;
  if char_length(trim(target_name)) not between 2 and 120 then raise exception 'Workspace name must be between 2 and 120 characters'; end if;
  insert into public.workspaces(name, created_by) values (trim(target_name), auth.uid()) returning id into new_workspace;
  insert into public.workspace_members(workspace_id, user_id, role) values (new_workspace, auth.uid(), 'owner');
  insert into public.workspace_member_app_permissions(workspace_id, user_id, app_id, permission)
    values (new_workspace, auth.uid(), 'book', 'edit'), (new_workspace, auth.uid(), 'payroll', 'edit');
  for item in select value from jsonb_array_elements(coalesce(target_backup->'members', '[]'::jsonb)) loop
    restored_user := nullif(item->>'user_id', '')::uuid;
    if restored_user is not null and restored_user <> auth.uid() and exists (select 1 from auth.users where id = restored_user) then
      insert into public.workspace_members(workspace_id, user_id, role)
        values (new_workspace, restored_user, case when item->>'role' = 'owner' then 'member'::public.workspace_role else 'member'::public.workspace_role end)
        on conflict do nothing;
    end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(target_backup->'permissions', '[]'::jsonb)) loop
    restored_user := nullif(item->>'user_id', '')::uuid;
    if restored_user is not null and restored_user <> auth.uid() and exists (select 1 from public.workspace_members where workspace_id = new_workspace and user_id = restored_user) and item->>'app_id' in ('book', 'payroll') and item->>'permission' in ('none', 'view', 'edit') then
      insert into public.workspace_member_app_permissions(workspace_id, user_id, app_id, permission)
        values (new_workspace, restored_user, item->>'app_id', (item->>'permission')::public.app_permission)
        on conflict (workspace_id, user_id, app_id) do update set permission = excluded.permission;
    end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(target_backup->'snapshots', '[]'::jsonb)) loop
    domain_name := item->>'domain';
    if domain_name not in ('cash_book:books','cash_book:transactions','payroll:employees','payroll:transactions','payroll:custom-apps') then raise exception 'Invalid snapshot domain'; end if;
    insert into public.app_state_snapshots(workspace_id, domain, payload, revision)
      values (new_workspace, domain_name, coalesce(item->'payload', '{}'::jsonb), greatest(1, coalesce((item->>'revision')::bigint, 1)))
      on conflict (workspace_id, domain) do update set payload = excluded.payload, revision = excluded.revision;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(target_backup->'audit_events', '[]'::jsonb)) loop
    insert into public.audit_events(workspace_id, actor_id, record_type, record_id, action, previous_data, next_data, created_at)
      values (new_workspace, case when (item->>'actor_id') is not null and exists (select 1 from auth.users where id = (item->>'actor_id')::uuid) then (item->>'actor_id')::uuid else null end,
        coalesce(item->>'record_type', 'backup'), nullif(item->>'record_id', '')::uuid, coalesce(item->>'action', 'restored'), item->'previous_data', item->'next_data', coalesce((item->>'created_at')::timestamptz, now()));
  end loop;
  return new_workspace;
exception when others then
  raise;
end;
$$;
grant execute on function public.restore_workspace_backup(jsonb, text) to authenticated;

insert into storage.buckets (id, name, public) values ('workspace-backups', 'workspace-backups', false) on conflict do nothing;
drop policy if exists "workspace backup owner access" on storage.objects;
create policy "workspace backup owner access" on storage.objects for all using (
  bucket_id = 'workspace-backups' and public.is_workspace_owner((storage.foldername(name))[1]::uuid)
) with check (
  bucket_id = 'workspace-backups' and public.is_workspace_owner((storage.foldername(name))[1]::uuid)
);
