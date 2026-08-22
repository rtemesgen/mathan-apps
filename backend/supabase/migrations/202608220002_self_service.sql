create table if not exists public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','cancelled','completed')),
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null default (now() + interval '30 days'),
  cancelled_at timestamptz,
  completed_at timestamptz
);
alter table public.account_deletion_requests add column if not exists delete_owned_workspaces boolean not null default false;
alter table public.account_deletion_requests enable row level security;
drop policy if exists "users read own deletion request" on public.account_deletion_requests;
create policy "users read own deletion request" on public.account_deletion_requests for select using (user_id = auth.uid());
revoke all on public.account_deletion_requests from authenticated;
grant select on public.account_deletion_requests to authenticated;

create or replace function public.request_account_deletion(delete_owned_workspaces boolean default false)
returns public.account_deletion_requests language plpgsql security definer set search_path = public as $$
declare request public.account_deletion_requests;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not delete_owned_workspaces and exists (select 1 from public.workspace_members where user_id = auth.uid() and role = 'owner') then
    raise exception 'Transfer workspace ownership before deleting your account';
  end if;
  insert into public.account_deletion_requests(user_id, delete_owned_workspaces) values (auth.uid(), delete_owned_workspaces)
    on conflict (user_id) do update set status = 'pending', requested_at = now(), scheduled_for = now() + interval '30 days', cancelled_at = null, completed_at = null, delete_owned_workspaces = excluded.delete_owned_workspaces
    returning * into request;
  return request;
end; $$;

create or replace function public.cancel_account_deletion()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.account_deletion_requests set status = 'cancelled', cancelled_at = now() where user_id = auth.uid() and status = 'pending';
  return found;
end; $$;
grant execute on function public.request_account_deletion(boolean) to authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;

create or replace function public.transfer_workspace_ownership(target_workspace uuid, target_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.workspace_members where workspace_id = target_workspace and user_id = auth.uid() and role = 'owner') then raise exception 'Only the current owner can transfer ownership'; end if;
  if not exists (select 1 from public.workspace_members where workspace_id = target_workspace and user_id = target_user) then raise exception 'The new owner must already be a company member'; end if;
  if target_user = auth.uid() then raise exception 'Choose another company member'; end if;
  update public.workspace_members set role = 'member' where workspace_id = target_workspace and user_id = auth.uid();
  update public.workspace_members set role = 'owner' where workspace_id = target_workspace and user_id = target_user;
  perform public.audit_workspace_event(target_workspace, 'workspace', target_workspace, 'ownership_transferred', jsonb_build_object('from_user_id', auth.uid()), jsonb_build_object('to_user_id', target_user));
  return true;
end; $$;
grant execute on function public.transfer_workspace_ownership(uuid, uuid) to authenticated;
