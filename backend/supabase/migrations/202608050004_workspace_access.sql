create type public.app_permission as enum ('none', 'view', 'edit');

create table public.workspace_apps (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  app_id text not null check (app_id in ('book', 'payroll')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, app_id)
);

create table public.workspace_member_app_permissions (
  workspace_id uuid not null,
  user_id uuid not null,
  app_id text not null check (app_id in ('book', 'payroll')),
  permission public.app_permission not null default 'none',
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id, app_id),
  foreign key (workspace_id, user_id) references public.workspace_members(workspace_id, user_id) on delete cascade
);

create table public.workspace_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 120),
  updated_at timestamptz not null default now()
);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (char_length(trim(email)) between 3 and 320),
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id) on delete restrict,
  book_permission public.app_permission not null default 'none',
  payroll_permission public.app_permission not null default 'none',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create index workspace_invitations_workspace_idx on public.workspace_invitations(workspace_id, created_at desc);

create function public.is_workspace_owner(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace and user_id = auth.uid() and role = 'owner'
  );
$$;

create function public.workspace_app_enabled(target_workspace uuid, target_app text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from public.workspace_apps where workspace_id = target_workspace and app_id = target_app), true);
$$;

create function public.can_view_workspace_app(target_workspace uuid, target_app text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.workspace_app_enabled(target_workspace, target_app) and exists (
    select 1 from public.workspace_members m
    left join public.workspace_member_app_permissions p
      on p.workspace_id = m.workspace_id and p.user_id = m.user_id and p.app_id = target_app
    where m.workspace_id = target_workspace and m.user_id = auth.uid()
      and (m.role = 'owner' or coalesce(p.permission, 'none') in ('view', 'edit'))
  );
$$;

create function public.can_edit_workspace_app(target_workspace uuid, target_app text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.workspace_app_enabled(target_workspace, target_app) and exists (
    select 1 from public.workspace_members m
    left join public.workspace_member_app_permissions p
      on p.workspace_id = m.workspace_id and p.user_id = m.user_id and p.app_id = target_app
    where m.workspace_id = target_workspace and m.user_id = auth.uid()
      and (m.role = 'owner' or coalesce(p.permission, 'none') = 'edit')
  );
$$;

create function public.seed_workspace_apps()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.workspace_apps (workspace_id, app_id) values (new.id, 'book'), (new.id, 'payroll');
  insert into public.workspace_profiles (user_id, display_name)
    values (new.created_by, coalesce((select raw_user_meta_data ->> 'name' from auth.users where id = new.created_by), ''))
    on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger workspace_access_defaults after insert on public.workspaces
for each row execute function public.seed_workspace_apps();

insert into public.workspace_apps (workspace_id, app_id)
select w.id, apps.app_id
from public.workspaces w cross join (values ('book'), ('payroll')) as apps(app_id)
on conflict do nothing;

insert into public.workspace_profiles (user_id)
select distinct user_id from public.workspace_members
on conflict do nothing;

insert into public.workspace_member_app_permissions (workspace_id, user_id, app_id, permission)
select workspace_id, user_id, apps.app_id, 'edit'
from public.workspace_members cross join (values ('book'), ('payroll')) as apps(app_id)
where role = 'owner'
on conflict do nothing;

alter table public.workspace_apps enable row level security;
alter table public.workspace_member_app_permissions enable row level security;
alter table public.workspace_profiles enable row level security;
alter table public.workspace_invitations enable row level security;

create policy "members view enabled apps" on public.workspace_apps for select using (public.is_workspace_member(workspace_id));
create policy "owners manage enabled apps" on public.workspace_apps for all using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));

create policy "members view own app permissions" on public.workspace_member_app_permissions for select using (user_id = auth.uid() or public.is_workspace_owner(workspace_id));
create policy "owners manage app permissions" on public.workspace_member_app_permissions for all using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));

create policy "users manage own profile" on public.workspace_profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "owners view invitations" on public.workspace_invitations for select using (public.is_workspace_owner(workspace_id));
create policy "owners manage invitations" on public.workspace_invitations for all using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));

create policy "owners update workspace" on public.workspaces for update using (public.is_workspace_owner(id)) with check (public.is_workspace_owner(id));

drop policy if exists "members access app snapshots" on public.app_state_snapshots;
create policy "members view permitted app snapshots" on public.app_state_snapshots for select using (
  public.can_view_workspace_app(workspace_id, case split_part(domain, ':', 1) when 'cash_book' then 'book' else 'payroll' end)
);
create policy "editors write permitted app snapshots" on public.app_state_snapshots for insert with check (
  public.can_edit_workspace_app(workspace_id, case split_part(domain, ':', 1) when 'cash_book' then 'book' else 'payroll' end)
);
create policy "editors update permitted app snapshots" on public.app_state_snapshots for update using (
  public.can_edit_workspace_app(workspace_id, case split_part(domain, ':', 1) when 'cash_book' then 'book' else 'payroll' end)
) with check (public.can_edit_workspace_app(workspace_id, case split_part(domain, ':', 1) when 'cash_book' then 'book' else 'payroll' end));
create policy "editors delete permitted app snapshots" on public.app_state_snapshots for delete using (
  public.can_edit_workspace_app(workspace_id, case split_part(domain, ':', 1) when 'cash_book' then 'book' else 'payroll' end)
);

create or replace function public.create_workspace_invitation(
  target_workspace uuid,
  target_email text,
  target_book_permission public.app_permission default 'none',
  target_payroll_permission public.app_permission default 'none',
  expires_in_days integer default 7
)
returns table (invitation_id uuid, invite_token text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare raw_token text := encode(gen_random_bytes(32), 'hex'); expiry timestamptz := now() + make_interval(days => greatest(1, least(expires_in_days, 30)));
begin
  if not public.is_workspace_owner(target_workspace) then raise exception 'Owner access required'; end if;
  if target_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'A valid email is required'; end if;
  update public.workspace_invitations set status = 'revoked'
    where workspace_id = target_workspace and lower(email) = lower(trim(target_email)) and status = 'pending';
  insert into public.workspace_invitations
    (workspace_id, email, token_hash, invited_by, book_permission, payroll_permission, expires_at)
    values (target_workspace, lower(trim(target_email)), encode(digest(raw_token, 'sha256'), 'hex'), auth.uid(), target_book_permission, target_payroll_permission, expiry)
    returning id, expires_at into invitation_id, expires_at;
  invite_token := raw_token;
  return next;
end;
$$;

create or replace function public.revoke_workspace_invitation(target_invitation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.workspace_invitations set status = 'revoked'
  where id = target_invitation and public.is_workspace_owner(workspace_id) and status = 'pending';
end;
$$;

create or replace function public.accept_workspace_invitation(target_token text)
returns public.workspaces language plpgsql security definer set search_path = public as $$
declare invitation public.workspace_invitations; current_email text; result_workspace public.workspaces;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into invitation from public.workspace_invitations
    where token_hash = encode(digest(target_token, 'sha256'), 'hex') and status = 'pending' and expires_at > now() for update;
  if invitation.id is null then raise exception 'Invitation is invalid or expired'; end if;
  select email into current_email from auth.users where id = auth.uid();
  if lower(coalesce(current_email, '')) <> lower(invitation.email) then raise exception 'Sign in with the invited email address'; end if;
  insert into public.workspace_members (workspace_id, user_id, role) values (invitation.workspace_id, auth.uid(), 'member') on conflict do nothing;
  insert into public.workspace_member_app_permissions (workspace_id, user_id, app_id, permission)
    values (invitation.workspace_id, auth.uid(), 'book', invitation.book_permission), (invitation.workspace_id, auth.uid(), 'payroll', invitation.payroll_permission)
    on conflict (workspace_id, user_id, app_id) do update set permission = excluded.permission;
  update public.workspace_invitations set status = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = invitation.id;
  select * into result_workspace from public.workspaces where id = invitation.workspace_id;
  return result_workspace;
end;
$$;

create or replace function public.remove_workspace_member(target_workspace uuid, target_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_workspace_owner(target_workspace) then raise exception 'Owner access required'; end if;
  delete from public.workspace_members where workspace_id = target_workspace and user_id = target_user and role <> 'owner';
end;
$$;

create or replace function public.list_workspace_members(target_workspace uuid)
returns table (user_id uuid, email text, role public.workspace_role, display_name text, book_permission public.app_permission, payroll_permission public.app_permission)
language sql security definer set search_path = public as $$
  select m.user_id, u.email, m.role, coalesce(pf.display_name, ''),
    coalesce(pb.permission, case when m.role = 'owner' then 'edit'::public.app_permission else 'none'::public.app_permission end),
    coalesce(pp.permission, case when m.role = 'owner' then 'edit'::public.app_permission else 'none'::public.app_permission end)
  from public.workspace_members m
  join auth.users u on u.id = m.user_id
  left join public.workspace_profiles pf on pf.user_id = m.user_id
  left join public.workspace_member_app_permissions pb on pb.workspace_id = m.workspace_id and pb.user_id = m.user_id and pb.app_id = 'book'
  left join public.workspace_member_app_permissions pp on pp.workspace_id = m.workspace_id and pp.user_id = m.user_id and pp.app_id = 'payroll'
  where m.workspace_id = target_workspace and public.is_workspace_owner(target_workspace)
  order by m.role desc, lower(coalesce(pf.display_name, u.email));
$$;

grant select, insert, update, delete on public.workspace_apps to authenticated;
grant select, insert, update, delete on public.workspace_member_app_permissions to authenticated;
grant select, insert, update, delete on public.workspace_profiles to authenticated;
grant select, insert, update, delete on public.workspace_invitations to authenticated;
grant execute on function public.is_workspace_owner(uuid) to authenticated;
grant execute on function public.workspace_app_enabled(uuid, text) to authenticated;
grant execute on function public.can_view_workspace_app(uuid, text) to authenticated;
grant execute on function public.can_edit_workspace_app(uuid, text) to authenticated;
grant execute on function public.create_workspace_invitation(uuid, text, public.app_permission, public.app_permission, integer) to authenticated;
grant execute on function public.revoke_workspace_invitation(uuid) to authenticated;
grant execute on function public.accept_workspace_invitation(text) to authenticated;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;
grant execute on function public.list_workspace_members(uuid) to authenticated;
