alter table public.workspace_profiles add column if not exists phone text;

create or replace function public.sync_workspace_profile_phone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.workspace_profiles (user_id, phone)
    values (new.user_id, (select raw_user_meta_data ->> 'phone' from auth.users where id = new.user_id))
    on conflict (user_id) do update set phone = coalesce(public.workspace_profiles.phone, excluded.phone);
  return new;
end;
$$;

drop trigger if exists workspace_member_profile_phone on public.workspace_members;
create trigger workspace_member_profile_phone after insert on public.workspace_members
for each row execute function public.sync_workspace_profile_phone();

create or replace function public.seed_workspace_apps()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.workspace_apps (workspace_id, app_id) values (new.id, 'book'), (new.id, 'payroll');
  insert into public.workspace_profiles (user_id, display_name, phone)
    values (new.created_by, coalesce((select raw_user_meta_data ->> 'name' from auth.users where id = new.created_by), ''), (select raw_user_meta_data ->> 'phone' from auth.users where id = new.created_by))
    on conflict (user_id) do update set phone = coalesce(public.workspace_profiles.phone, excluded.phone);
  return new;
end;
$$;

create or replace function public.lookup_workspace_contacts(target_workspace uuid, target_phones text[])
returns table (phone text, user_id uuid, display_name text, already_member boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_workspace_owner(target_workspace) then raise exception 'Only workspace owners can look up contacts'; end if;
  return query
  select pf.phone, u.id, coalesce(pf.display_name, u.raw_user_meta_data ->> 'name', u.email, pf.phone),
    exists (select 1 from public.workspace_members wm where wm.workspace_id = target_workspace and wm.user_id = u.id)
  from public.workspace_profiles pf join auth.users u on u.id = pf.user_id
  where pf.phone is not null and regexp_replace(pf.phone, '[^0-9]', '', 'g') in (select regexp_replace(value, '[^0-9]', '', 'g') from unnest(target_phones) as value);
end;
$$;

create or replace function public.add_workspace_member_by_phone(target_workspace uuid, target_phone text, target_book_permission public.app_permission default 'edit')
returns boolean language plpgsql security definer set search_path = public as $$
declare matched_user uuid;
begin
  if not public.is_workspace_owner(target_workspace) then raise exception 'Only workspace owners can add members'; end if;
  select user_id into matched_user from public.workspace_profiles where phone is not null and regexp_replace(phone, '[^0-9]', '', 'g') = regexp_replace(target_phone, '[^0-9]', '', 'g') limit 1;
  if matched_user is null then return false; end if;
  insert into public.workspace_members (workspace_id, user_id, role) values (target_workspace, matched_user, 'member') on conflict do nothing;
  insert into public.workspace_member_app_permissions (workspace_id, user_id, app_id, permission) values (target_workspace, matched_user, 'book', target_book_permission) on conflict (workspace_id, user_id, app_id) do update set permission = excluded.permission;
  return true;
end;
$$;

grant select, insert, update, delete on public.workspace_profiles to authenticated;
grant execute on function public.lookup_workspace_contacts(uuid, text[]) to authenticated;
grant execute on function public.add_workspace_member_by_phone(uuid, text, public.app_permission) to authenticated;
