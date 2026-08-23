-- Treat Truck Equity as a first-class app everywhere permissions are stored,
-- displayed, accepted, backed up, and restored.

alter table public.workspace_invitations
  add column if not exists truck_permission public.app_permission not null default 'none';

drop function if exists public.create_workspace_invitation(uuid, text, public.app_permission, public.app_permission, integer);
create function public.create_workspace_invitation(
  target_workspace uuid,
  target_email text,
  target_book_permission public.app_permission default 'none',
  target_payroll_permission public.app_permission default 'none',
  target_truck_permission public.app_permission default 'none',
  expires_in_days integer default 7
)
returns table (invitation_id uuid, invite_token text, expires_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
declare raw_token text := encode(gen_random_bytes(32), 'hex'); expiry timestamptz := now() + make_interval(days => greatest(1, least(expires_in_days, 30)));
begin
  if not public.is_workspace_owner(target_workspace) then raise exception 'Owner access required'; end if;
  if target_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'A valid email is required'; end if;
  update public.workspace_invitations set status = 'revoked'
    where workspace_id = target_workspace and lower(email) = lower(trim(target_email)) and status = 'pending';
  insert into public.workspace_invitations
    (workspace_id, email, token_hash, invited_by, book_permission, payroll_permission, truck_permission, expires_at)
    values (target_workspace, lower(trim(target_email)), encode(digest(raw_token, 'sha256'), 'hex'), auth.uid(), target_book_permission, target_payroll_permission, target_truck_permission, expiry)
    returning id, workspace_invitations.expires_at into invitation_id, expires_at;
  invite_token := raw_token;
  return next;
end;
$$;

create or replace function public.accept_workspace_invitation(target_token text)
returns public.workspaces language plpgsql security definer set search_path = public, extensions as $$
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
    values (invitation.workspace_id, auth.uid(), 'book', invitation.book_permission),
           (invitation.workspace_id, auth.uid(), 'payroll', invitation.payroll_permission),
           (invitation.workspace_id, auth.uid(), 'truck', invitation.truck_permission)
    on conflict (workspace_id, user_id, app_id) do update set permission = excluded.permission;
  update public.workspace_invitations set status = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = invitation.id;
  select * into result_workspace from public.workspaces where id = invitation.workspace_id;
  return result_workspace;
end;
$$;

drop function if exists public.list_workspace_members(uuid);
create function public.list_workspace_members(target_workspace uuid)
returns table (user_id uuid, email text, role public.workspace_role, display_name text, book_permission public.app_permission, payroll_permission public.app_permission, truck_permission public.app_permission)
language sql security definer set search_path = public as $$
  select m.user_id, u.email, m.role, coalesce(pf.display_name, ''),
    coalesce(pb.permission, case when m.role = 'owner' then 'edit'::public.app_permission else 'none'::public.app_permission end),
    coalesce(pp.permission, case when m.role = 'owner' then 'edit'::public.app_permission else 'none'::public.app_permission end),
    coalesce(pt.permission, case when m.role = 'owner' then 'edit'::public.app_permission else 'none'::public.app_permission end)
  from public.workspace_members m
  join auth.users u on u.id = m.user_id
  left join public.workspace_profiles pf on pf.user_id = m.user_id
  left join public.workspace_member_app_permissions pb on pb.workspace_id = m.workspace_id and pb.user_id = m.user_id and pb.app_id = 'book'
  left join public.workspace_member_app_permissions pp on pp.workspace_id = m.workspace_id and pp.user_id = m.user_id and pp.app_id = 'payroll'
  left join public.workspace_member_app_permissions pt on pt.workspace_id = m.workspace_id and pt.user_id = m.user_id and pt.app_id = 'truck'
  where m.workspace_id = target_workspace and public.is_workspace_owner(target_workspace)
  order by m.role desc, lower(coalesce(pf.display_name, u.email));
$$;

drop function if exists public.list_my_workspace_invitations();
create function public.list_my_workspace_invitations()
returns table (
  invitation_id uuid, workspace_id uuid, workspace_name text, invited_by_name text,
  book_permission public.app_permission, payroll_permission public.app_permission, truck_permission public.app_permission,
  expires_at timestamptz, created_at timestamptz
)
language sql security definer set search_path = public as $$
  select i.id, i.workspace_id, w.name, coalesce(nullif(p.display_name, ''), u.email),
    i.book_permission, i.payroll_permission, i.truck_permission, i.expires_at, i.created_at
  from public.workspace_invitations i
  join public.workspaces w on w.id = i.workspace_id
  join auth.users u on u.id = i.invited_by
  left join public.workspace_profiles p on p.user_id = i.invited_by
  where lower(i.email) = lower(coalesce((select email from auth.users where id = auth.uid()), ''))
    and i.status = 'pending' and i.expires_at > now()
  order by i.created_at desc;
$$;

create or replace function public.respond_to_workspace_invitation(target_invitation uuid, accept_invitation boolean)
returns public.workspaces language plpgsql security definer set search_path = public as $$
declare invitation public.workspace_invitations; result_workspace public.workspaces;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into invitation from public.workspace_invitations
  where id = target_invitation and lower(email) = lower(coalesce((select email from auth.users where id = auth.uid()), ''))
    and status = 'pending' and expires_at > now() for update;
  if invitation.id is null then raise exception 'Invitation is invalid or expired'; end if;
  if accept_invitation then
    insert into public.workspace_members (workspace_id, user_id, role) values (invitation.workspace_id, auth.uid(), 'member') on conflict do nothing;
    insert into public.workspace_member_app_permissions (workspace_id, user_id, app_id, permission)
      values (invitation.workspace_id, auth.uid(), 'book', invitation.book_permission),
             (invitation.workspace_id, auth.uid(), 'payroll', invitation.payroll_permission),
             (invitation.workspace_id, auth.uid(), 'truck', invitation.truck_permission)
      on conflict (workspace_id, user_id, app_id) do update set permission = excluded.permission;
    update public.workspace_invitations set status = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = invitation.id;
  else
    update public.workspace_invitations set status = 'rejected' where id = invitation.id;
  end if;
  select * into result_workspace from public.workspaces where id = invitation.workspace_id;
  return result_workspace;
end;
$$;

create or replace function public.create_workspace_phone_invitation(target_workspace uuid, target_phone text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare target_user uuid; target_email text; invitation_id uuid;
begin
  if not public.is_workspace_owner(target_workspace) then raise exception 'Owner access required'; end if;
  select p.user_id, u.email into target_user, target_email from public.workspace_profiles p join auth.users u on u.id = p.user_id
    where regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(target_phone, ''), '[^0-9]', '', 'g') limit 1;
  if target_user is null or target_email is null then raise exception 'This contact does not have a Mathan ERP account'; end if;
  if exists (select 1 from public.workspace_members where workspace_id = target_workspace and user_id = target_user) then raise exception 'This person is already a member of the company'; end if;
  update public.workspace_invitations set status = 'revoked' where workspace_id = target_workspace and lower(email) = lower(target_email) and status = 'pending';
  insert into public.workspace_invitations (workspace_id, email, token_hash, invited_by, book_permission, payroll_permission, truck_permission, expires_at)
    values (target_workspace, lower(target_email), encode(digest(encode(gen_random_bytes(32), 'hex'), 'sha256'), 'hex'), auth.uid(), 'edit', 'edit', 'edit', now() + interval '7 days')
    returning id into invitation_id;
  return invitation_id;
end;
$$;

drop function if exists public.add_workspace_member_by_phone(uuid, text, public.app_permission);
create function public.add_workspace_member_by_phone(
  target_workspace uuid, target_phone text,
  target_book_permission public.app_permission default 'edit',
  target_payroll_permission public.app_permission default 'edit',
  target_truck_permission public.app_permission default 'edit'
)
returns boolean language plpgsql security definer set search_path = public as $$
declare matched_user uuid;
begin
  if not public.is_workspace_owner(target_workspace) then raise exception 'Only workspace owners can add members'; end if;
  select user_id into matched_user from public.workspace_profiles where phone is not null and regexp_replace(phone, '[^0-9]', '', 'g') = regexp_replace(target_phone, '[^0-9]', '', 'g') limit 1;
  if matched_user is null then return false; end if;
  insert into public.workspace_members (workspace_id, user_id, role) values (target_workspace, matched_user, 'member') on conflict do nothing;
  insert into public.workspace_member_app_permissions (workspace_id, user_id, app_id, permission)
    values (target_workspace, matched_user, 'book', target_book_permission),
           (target_workspace, matched_user, 'payroll', target_payroll_permission),
           (target_workspace, matched_user, 'truck', target_truck_permission)
    on conflict (workspace_id, user_id, app_id) do update set permission = excluded.permission;
  return true;
end;
$$;

grant execute on function public.create_workspace_invitation(uuid, text, public.app_permission, public.app_permission, public.app_permission, integer) to authenticated;
grant execute on function public.accept_workspace_invitation(text) to authenticated;
grant execute on function public.list_workspace_members(uuid) to authenticated;
grant execute on function public.list_my_workspace_invitations() to authenticated;
grant execute on function public.respond_to_workspace_invitation(uuid, boolean) to authenticated;
grant execute on function public.create_workspace_phone_invitation(uuid, text) to authenticated;
grant execute on function public.add_workspace_member_by_phone(uuid, text, public.app_permission, public.app_permission, public.app_permission) to authenticated;

-- Restore Truck Equity rows with fresh identifiers so restoring beside the
-- source company cannot collide with existing primary keys.
create or replace function public.restore_truck_backup(target_workspace uuid, target_backup jsonb)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
declare item jsonb; old_id text; new_id uuid; linked_id uuid; truck_map jsonb := '{}'::jsonb; owner_map jsonb := '{}'::jsonb;
begin
  for item in select value from jsonb_array_elements(coalesce(target_backup->'trucks', '[]'::jsonb)) loop
    old_id := item->>'id'; new_id := gen_random_uuid();
    insert into public.trucks(id, workspace_id, name, unit_number, make_model, vin, cash_on_hand, license_plate, created_at, updated_at)
      values (new_id, target_workspace, coalesce(item->>'name', 'Recovered truck'), coalesce(item->>'unit_number', ''), coalesce(item->>'make_model', ''), coalesce(item->>'vin', ''), greatest(0, coalesce((item->>'cash_on_hand')::numeric, 0)), coalesce(item->>'license_plate', ''), coalesce((item->>'created_at')::timestamptz, now()), coalesce((item->>'updated_at')::timestamptz, now()));
    if old_id is not null then truck_map := truck_map || jsonb_build_object(old_id, new_id::text); end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(target_backup->'truck_owners', '[]'::jsonb)) loop
    old_id := item->>'id'; linked_id := nullif(truck_map->>(item->>'truck_id'), '')::uuid;
    if linked_id is not null then
      new_id := gen_random_uuid();
      insert into public.truck_owners(id, workspace_id, truck_id, user_id, name, start_date, equity_percentage, monthly_draw_rate, avatar_color, created_at, updated_at)
        values (new_id, target_workspace, linked_id, case when nullif(item->>'user_id', '') is not null and exists (select 1 from auth.users where id = (item->>'user_id')::uuid) then (item->>'user_id')::uuid else null end, coalesce(item->>'name', 'Recovered owner'), coalesce((item->>'start_date')::date, current_date), greatest(0, least(100, coalesce((item->>'equity_percentage')::numeric, 0))), greatest(0, coalesce((item->>'monthly_draw_rate')::numeric, 0)), coalesce(item->>'avatar_color', 'bg-slate-800 text-white'), coalesce((item->>'created_at')::timestamptz, now()), coalesce((item->>'updated_at')::timestamptz, now()));
      if old_id is not null then owner_map := owner_map || jsonb_build_object(old_id, new_id::text); end if;
    end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(target_backup->'truck_transactions', '[]'::jsonb)) loop
    linked_id := nullif(truck_map->>(item->>'truck_id'), '')::uuid;
    if linked_id is not null and item->>'transaction_type' in ('INCOME','EXPENSE','CAPITAL_INJECTION','CAPITAL_REPAYMENT','PROFIT_DISTRIBUTION') then
      insert into public.truck_transactions(id, workspace_id, truck_id, owner_id, occurred_on, transaction_type, category, amount, description, reference_no, created_at, updated_at)
        values (gen_random_uuid(), target_workspace, linked_id, nullif(owner_map->>(item->>'owner_id'), '')::uuid, coalesce((item->>'occurred_on')::date, current_date), item->>'transaction_type', coalesce(item->>'category', ''), greatest(0.01, coalesce((item->>'amount')::numeric, 0.01)), coalesce(item->>'description', ''), nullif(item->>'reference_no', ''), coalesce((item->>'created_at')::timestamptz, now()), coalesce((item->>'updated_at')::timestamptz, now()));
    end if;
  end loop;
end;
$$;
revoke all on function public.restore_truck_backup(uuid, jsonb) from public, anon, authenticated;

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
    values (new_workspace, auth.uid(), 'book', 'edit'), (new_workspace, auth.uid(), 'payroll', 'edit'), (new_workspace, auth.uid(), 'truck', 'edit')
    on conflict (workspace_id, user_id, app_id) do update set permission = excluded.permission;
  for item in select value from jsonb_array_elements(coalesce(target_backup->'members', '[]'::jsonb)) loop
    restored_user := nullif(item->>'user_id', '')::uuid;
    if restored_user is not null and restored_user <> auth.uid() and exists (select 1 from auth.users where id = restored_user) then
      insert into public.workspace_members(workspace_id, user_id, role) values (new_workspace, restored_user, 'member') on conflict do nothing;
    end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(target_backup->'permissions', '[]'::jsonb)) loop
    restored_user := nullif(item->>'user_id', '')::uuid;
    if restored_user is not null and restored_user <> auth.uid() and exists (select 1 from public.workspace_members where workspace_id = new_workspace and user_id = restored_user) and item->>'app_id' in ('book', 'payroll', 'truck') and item->>'permission' in ('none', 'view', 'edit') then
      insert into public.workspace_member_app_permissions(workspace_id, user_id, app_id, permission) values (new_workspace, restored_user, item->>'app_id', (item->>'permission')::public.app_permission)
        on conflict (workspace_id, user_id, app_id) do update set permission = excluded.permission;
    end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(target_backup->'snapshots', '[]'::jsonb)) loop
    domain_name := item->>'domain';
    if domain_name not in ('cash_book:books','cash_book:transactions','payroll:employees','payroll:transactions','payroll:custom-apps') then raise exception 'Invalid snapshot domain'; end if;
    insert into public.app_state_snapshots(workspace_id, domain, payload, revision) values (new_workspace, domain_name, coalesce(item->'payload', '{}'::jsonb), greatest(1, coalesce((item->>'revision')::bigint, 1)))
      on conflict (workspace_id, domain) do update set payload = excluded.payload, revision = excluded.revision;
  end loop;
  perform public.restore_truck_backup(new_workspace, target_backup);
  for item in select value from jsonb_array_elements(coalesce(target_backup->'audit_events', '[]'::jsonb)) loop
    insert into public.audit_events(workspace_id, actor_id, record_type, record_id, action, previous_data, next_data, created_at)
      values (new_workspace, case when (item->>'actor_id') is not null and exists (select 1 from auth.users where id = (item->>'actor_id')::uuid) then (item->>'actor_id')::uuid else null end, coalesce(item->>'record_type', 'backup'), nullif(item->>'record_id', '')::uuid, coalesce(item->>'action', 'restored'), item->'previous_data', item->'next_data', coalesce((item->>'created_at')::timestamptz, now()));
  end loop;
  return new_workspace;
end;
$$;
grant execute on function public.restore_workspace_backup(jsonb, text) to authenticated;

create or replace function public.system_admin_restore_workspace(target_admin uuid, target_backup jsonb, target_name text)
returns uuid language plpgsql security definer set search_path = public, auth, extensions as $$
declare new_workspace uuid; item jsonb; matched_user uuid; restored_email text; domain_name text;
begin
  if not exists (select 1 from public.system_admins where user_id = target_admin) then raise exception 'System administrator access required'; end if;
  if char_length(trim(target_name)) not between 2 and 120 then raise exception 'Recovery workspace name is invalid'; end if;
  insert into public.workspaces(name, accent_color, created_by) values (trim(target_name), coalesce(target_backup->'workspace'->>'accent_color', '#54623E'), target_admin) returning id into new_workspace;
  insert into public.workspace_members(workspace_id, user_id, role) values (new_workspace, target_admin, 'owner') on conflict do nothing;
  insert into public.workspace_member_app_permissions(workspace_id, user_id, app_id, permission)
    values (new_workspace, target_admin, 'book', 'edit'), (new_workspace, target_admin, 'payroll', 'edit'), (new_workspace, target_admin, 'truck', 'edit')
    on conflict (workspace_id, user_id, app_id) do update set permission = excluded.permission;
  for item in select value from jsonb_array_elements(coalesce(target_backup->'members', '[]'::jsonb)) loop
    restored_email := lower(trim(item->>'email')); select id into matched_user from auth.users where lower(email) = restored_email limit 1;
    if matched_user is not null and matched_user <> target_admin then insert into public.workspace_members(workspace_id, user_id, role) values (new_workspace, matched_user, 'member') on conflict do nothing; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(target_backup->'permissions', '[]'::jsonb)) loop
    restored_email := lower(trim(item->>'email')); select id into matched_user from auth.users where lower(email) = restored_email limit 1;
    if matched_user is not null and exists (select 1 from public.workspace_members where workspace_id = new_workspace and user_id = matched_user) and item->>'app_id' in ('book', 'payroll', 'truck') and item->>'permission' in ('none', 'view', 'edit') then
      insert into public.workspace_member_app_permissions(workspace_id, user_id, app_id, permission) values (new_workspace, matched_user, item->>'app_id', (item->>'permission')::public.app_permission)
        on conflict (workspace_id, user_id, app_id) do update set permission = excluded.permission;
    end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(target_backup->'apps', '[]'::jsonb)) loop
    if item->>'app_id' in ('book', 'payroll', 'truck') then insert into public.workspace_apps(workspace_id, app_id, enabled) values (new_workspace, item->>'app_id', coalesce((item->>'enabled')::boolean, true)) on conflict (workspace_id, app_id) do update set enabled = excluded.enabled; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(target_backup->'snapshots', '[]'::jsonb)) loop
    domain_name := item->>'domain';
    if domain_name not in ('cash_book:books','cash_book:transactions','payroll:employees','payroll:transactions','payroll:custom-apps') then raise exception 'Invalid snapshot domain'; end if;
    insert into public.app_state_snapshots(workspace_id, domain, payload, revision) values (new_workspace, domain_name, coalesce(item->'payload', '{}'::jsonb), greatest(1, coalesce((item->>'revision')::bigint, 1))) on conflict (workspace_id, domain) do update set payload = excluded.payload, revision = excluded.revision;
  end loop;
  perform public.restore_truck_backup(new_workspace, target_backup);
  for item in select value from jsonb_array_elements(coalesce(target_backup->'audit_events', '[]'::jsonb)) loop
    insert into public.audit_events(workspace_id, actor_id, record_type, record_id, action, previous_data, next_data, created_at)
      values (new_workspace, null, coalesce(nullif(item->>'record_type', ''), 'recovered'), nullif(item->>'record_id', '')::uuid, coalesce(nullif(item->>'action', ''), 'recovered'), item->'previous_data', item->'next_data', coalesce((item->>'created_at')::timestamptz, now()));
  end loop;
  for item in select value from jsonb_array_elements(coalesce(target_backup->'invitations', '[]'::jsonb)) loop
    if char_length(trim(item->>'email')) between 3 and 320 then
      insert into public.workspace_invitations(workspace_id, email, token_hash, invited_by, book_permission, payroll_permission, truck_permission, status, expires_at, created_at)
        values (new_workspace, lower(trim(item->>'email')), encode(gen_random_bytes(32), 'hex'), target_admin,
          case when item->>'book_permission' in ('none','view','edit') then (item->>'book_permission')::public.app_permission else 'none' end,
          case when item->>'payroll_permission' in ('none','view','edit') then (item->>'payroll_permission')::public.app_permission else 'none' end,
          case when item->>'truck_permission' in ('none','view','edit') then (item->>'truck_permission')::public.app_permission else 'none' end,
          'expired', now() - interval '1 second', coalesce((item->>'created_at')::timestamptz, now()));
    end if;
  end loop;
  insert into public.system_admin_audit_events(actor_id, action, target_workspace_id, result, next_data) values (target_admin, 'workspace_restored', new_workspace, 'success', jsonb_build_object('source_workspace_id', target_backup->'workspace'->>'id'));
  return new_workspace;
end;
$$;
revoke all on function public.system_admin_restore_workspace(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.system_admin_restore_workspace(uuid, jsonb, text) to service_role;

notify pgrst, 'reload schema';
