alter table public.workspace_invitations
  drop constraint if exists workspace_invitations_status_check;

alter table public.workspace_invitations
  add constraint workspace_invitations_status_check
  check (status in ('pending', 'accepted', 'rejected', 'revoked', 'expired'));

create or replace function public.list_my_workspace_invitations()
returns table (
  invitation_id uuid,
  workspace_id uuid,
  workspace_name text,
  invited_by_name text,
  book_permission public.app_permission,
  payroll_permission public.app_permission,
  expires_at timestamptz,
  created_at timestamptz
)
language sql security definer set search_path = public as $$
  select i.id, i.workspace_id, w.name,
    coalesce(nullif(p.display_name, ''), u.email),
    i.book_permission, i.payroll_permission, i.expires_at, i.created_at
  from public.workspace_invitations i
  join public.workspaces w on w.id = i.workspace_id
  join auth.users u on u.id = i.invited_by
  left join public.workspace_profiles p on p.user_id = i.invited_by
  where lower(i.email) = lower(coalesce((select email from auth.users where id = auth.uid()), ''))
    and i.status = 'pending' and i.expires_at > now()
  order by i.created_at desc;
$$;

create or replace function public.respond_to_workspace_invitation(target_invitation uuid, accept_invitation boolean)
returns public.workspaces
language plpgsql security definer set search_path = public as $$
declare invitation public.workspace_invitations; result_workspace public.workspaces;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into invitation from public.workspace_invitations
  where id = target_invitation
    and lower(email) = lower(coalesce((select email from auth.users where id = auth.uid()), ''))
    and status = 'pending' and expires_at > now() for update;
  if invitation.id is null then raise exception 'Invitation is invalid or expired'; end if;
  if accept_invitation then
    insert into public.workspace_members (workspace_id, user_id, role)
      values (invitation.workspace_id, auth.uid(), 'member') on conflict do nothing;
    insert into public.workspace_member_app_permissions (workspace_id, user_id, app_id, permission)
      values (invitation.workspace_id, auth.uid(), 'book', invitation.book_permission),
             (invitation.workspace_id, auth.uid(), 'payroll', invitation.payroll_permission)
      on conflict (workspace_id, user_id, app_id) do update set permission = excluded.permission;
    update public.workspace_invitations set status = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = invitation.id;
  else
    update public.workspace_invitations set status = 'rejected' where id = invitation.id;
  end if;
  select * into result_workspace from public.workspaces where id = invitation.workspace_id;
  return result_workspace;
end;
$$;

create or replace function public.leave_workspace(target_workspace uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.workspace_members where workspace_id = target_workspace and user_id = auth.uid() and role = 'owner') then
    raise exception 'Company owners cannot remove themselves';
  end if;
  delete from public.workspace_members where workspace_id = target_workspace and user_id = auth.uid();
  return found;
end;
$$;

create or replace function public.create_workspace_phone_invitation(target_workspace uuid, target_phone text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare target_user uuid; target_email text; invitation_id uuid;
begin
  if not public.is_workspace_owner(target_workspace) then raise exception 'Owner access required'; end if;
  select p.user_id, u.email into target_user, target_email
  from public.workspace_profiles p join auth.users u on u.id = p.user_id
  where regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(target_phone, ''), '[^0-9]', '', 'g')
  limit 1;
  if target_user is null or target_email is null then raise exception 'This contact does not have a Mathan ERP account'; end if;
  if exists (select 1 from public.workspace_members where workspace_id = target_workspace and user_id = target_user) then raise exception 'This person is already a member of the company'; end if;
  update public.workspace_invitations set status = 'revoked'
    where workspace_id = target_workspace and lower(email) = lower(target_email) and status = 'pending';
  insert into public.workspace_invitations (workspace_id, email, token_hash, invited_by, book_permission, payroll_permission, expires_at)
    values (target_workspace, lower(target_email), encode(digest(encode(gen_random_bytes(32), 'hex'), 'sha256'), 'hex'), auth.uid(), 'edit', 'edit', now() + interval '7 days')
    returning id into invitation_id;
  return invitation_id;
end;
$$;

grant execute on function public.list_my_workspace_invitations() to authenticated;
grant execute on function public.respond_to_workspace_invitation(uuid, boolean) to authenticated;
grant execute on function public.leave_workspace(uuid) to authenticated;
grant execute on function public.create_workspace_phone_invitation(uuid, text) to authenticated;
