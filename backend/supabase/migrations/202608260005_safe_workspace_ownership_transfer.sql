-- Ownership transfer must preserve every app's access and company data.
-- The previous implementation changed the old owner first and relied on a
-- Truck-only trigger, which could leave the new owner without snapshot access
-- and made a partial transfer possible if a later statement failed.
create or replace function public.transfer_workspace_ownership(target_workspace uuid, target_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare current_owner uuid;
begin
  select user_id into current_owner
  from public.workspace_members
  where workspace_id = target_workspace and role = 'owner'
  for update;

  if current_owner is null or current_owner <> auth.uid() then
    raise exception 'Only the current owner can transfer ownership';
  end if;
  if target_user = auth.uid() then raise exception 'Choose another company member'; end if;
  perform 1 from public.workspace_members
    where workspace_id = target_workspace and user_id = target_user
    for update;
  if not found then raise exception 'The new owner must already be a company member'; end if;

  -- Grant the new owner complete access before changing roles. This covers
  -- both snapshot apps and Truck, regardless of how they originally joined.
  insert into public.workspace_member_app_permissions(workspace_id, user_id, app_id, permission)
    values
      (target_workspace, target_user, 'book', 'edit'),
      (target_workspace, target_user, 'payroll', 'edit'),
      (target_workspace, target_user, 'truck', 'edit')
    on conflict (workspace_id, user_id, app_id)
    do update set permission = 'edit';

  update public.workspace_members
    set role = 'owner'
    where workspace_id = target_workspace and user_id = target_user;
  update public.workspace_members
    set role = 'member'
    where workspace_id = target_workspace and user_id = current_owner;

  perform public.audit_workspace_event(
    target_workspace, 'workspace', target_workspace, 'ownership_transferred',
    jsonb_build_object('from_user_id', current_owner),
    jsonb_build_object('to_user_id', target_user)
  );
  return true;
end;
$$;

grant execute on function public.transfer_workspace_ownership(uuid, uuid) to authenticated;
