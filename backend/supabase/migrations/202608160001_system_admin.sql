-- System-wide administration is deliberately separated from workspace ownership.
-- Browser clients can only ask whether the current user is an administrator;
-- all privileged reads and writes are performed by the system-admin Edge Function.

create type public.system_account_status as enum ('active', 'suspended', 'blocked', 'purge_pending');

create table public.system_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.system_user_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status public.system_account_status not null default 'active',
  suspended_until timestamptz,
  reason text check (reason is null or char_length(reason) <= 500),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check ((status = 'suspended' and suspended_until is not null) or (status <> 'suspended' and suspended_until is null))
);

create table public.system_admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_workspace_id uuid references public.workspaces(id) on delete set null,
  result text not null check (result in ('success', 'failure')),
  previous_data jsonb,
  next_data jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table public.system_backup_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null,
  backup_kind text not null check (backup_kind in ('automatic', 'manual', 'restore')),
  status text not null check (status in ('started', 'completed', 'failed', 'cancelled')),
  record_count bigint not null default 0,
  attachment_count bigint not null default 0,
  size_bytes bigint not null default 0,
  checksum text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.system_restore_operations (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'started' check (status in ('started', 'completed', 'failed', 'cancelled')),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.system_restore_workspaces (
  operation_id uuid not null references public.system_restore_operations(id) on delete cascade,
  source_workspace_id uuid not null,
  target_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  primary key (operation_id, source_workspace_id),
  unique (operation_id, target_workspace_id)
);

create index system_admin_audit_created_idx on public.system_admin_audit_events(created_at desc);
create index system_admin_audit_target_user_idx on public.system_admin_audit_events(target_user_id, created_at desc);
create index system_backup_runs_created_idx on public.system_backup_runs(created_at desc);

alter table public.system_admins enable row level security;
alter table public.system_user_controls enable row level security;
alter table public.system_admin_audit_events enable row level security;
alter table public.system_backup_runs enable row level security;
alter table public.system_restore_operations enable row level security;
alter table public.system_restore_workspaces enable row level security;

revoke all on public.system_admins, public.system_user_controls,
  public.system_admin_audit_events, public.system_backup_runs,
  public.system_restore_operations, public.system_restore_workspaces from public, anon, authenticated;

-- PostgREST still requires table privileges even when service_role bypasses
-- row-level security. Keep this list explicit so elevated access is granted
-- only to the server-side resources used by the Admin Edge Function.
grant select, insert, update, delete on
  public.workspaces,
  public.workspace_members,
  public.workspace_profiles,
  public.workspace_apps,
  public.workspace_member_app_permissions,
  public.workspace_invitations,
  public.app_state_snapshots,
  public.audit_events,
  public.record_attachments,
  public.cash_transaction_attachments,
  public.system_admins,
  public.system_user_controls,
  public.system_admin_audit_events,
  public.system_backup_runs,
  public.system_restore_operations,
  public.system_restore_workspaces
to service_role;

create or replace function public.is_system_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.system_admins where user_id = auth.uid()
  );
$$;

revoke all on function public.is_system_admin() from public;
grant execute on function public.is_system_admin() to authenticated;

-- Restore one archived workspace as a new recovery workspace. The Edge Function
-- validates the archive and calls this function with its already-authenticated
-- system administrator. Existing workspaces are never updated by this function.
create or replace function public.system_admin_restore_workspace(
  target_admin uuid,
  target_backup jsonb,
  target_name text
)
returns uuid
language plpgsql security definer set search_path = public, auth, extensions
as $$
declare
  new_workspace uuid;
  item jsonb;
  matched_user uuid;
  restored_email text;
  domain_name text;
begin
  if not exists (select 1 from public.system_admins where user_id = target_admin) then
    raise exception 'System administrator access required';
  end if;
  if char_length(trim(target_name)) not between 2 and 120 then
    raise exception 'Recovery workspace name is invalid';
  end if;

  insert into public.workspaces(name, accent_color, created_by)
    values (trim(target_name), coalesce(target_backup->'workspace'->>'accent_color', '#54623E'), target_admin)
    returning id into new_workspace;
  insert into public.workspace_members(workspace_id, user_id, role)
    values (new_workspace, target_admin, 'owner') on conflict do nothing;
  insert into public.workspace_member_app_permissions(workspace_id, user_id, app_id, permission)
    values (new_workspace, target_admin, 'book', 'edit'), (new_workspace, target_admin, 'payroll', 'edit')
    on conflict (workspace_id, user_id, app_id) do update set permission = excluded.permission;

  for item in select value from jsonb_array_elements(coalesce(target_backup->'members', '[]'::jsonb)) loop
    restored_email := lower(trim(item->>'email'));
    select id into matched_user from auth.users where lower(email) = restored_email limit 1;
    if matched_user is not null and matched_user <> target_admin then
      insert into public.workspace_members(workspace_id, user_id, role)
        values (new_workspace, matched_user, 'member') on conflict do nothing;
    end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(target_backup->'permissions', '[]'::jsonb)) loop
    restored_email := lower(trim(item->>'email'));
    select id into matched_user from auth.users where lower(email) = restored_email limit 1;
    if matched_user is not null
      and exists (select 1 from public.workspace_members where workspace_id = new_workspace and user_id = matched_user)
      and item->>'app_id' in ('book', 'payroll')
      and item->>'permission' in ('none', 'view', 'edit') then
      insert into public.workspace_member_app_permissions(workspace_id, user_id, app_id, permission)
        values (new_workspace, matched_user, item->>'app_id', (item->>'permission')::public.app_permission)
        on conflict (workspace_id, user_id, app_id) do update set permission = excluded.permission;
    end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(target_backup->'apps', '[]'::jsonb)) loop
    if item->>'app_id' in ('book', 'payroll') then
      insert into public.workspace_apps(workspace_id, app_id, enabled)
        values (new_workspace, item->>'app_id', coalesce((item->>'enabled')::boolean, true))
        on conflict (workspace_id, app_id) do update set enabled = excluded.enabled;
    end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(target_backup->'snapshots', '[]'::jsonb)) loop
    domain_name := item->>'domain';
    if domain_name not in ('cash_book:books','cash_book:transactions','payroll:employees','payroll:transactions','payroll:custom-apps') then
      raise exception 'Invalid snapshot domain';
    end if;
    insert into public.app_state_snapshots(workspace_id, domain, payload, revision)
      values (new_workspace, domain_name, coalesce(item->'payload', '{}'::jsonb), greatest(1, coalesce((item->>'revision')::bigint, 1)))
      on conflict (workspace_id, domain) do update set payload = excluded.payload, revision = excluded.revision;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(target_backup->'audit_events', '[]'::jsonb)) loop
    insert into public.audit_events(workspace_id, actor_id, record_type, record_id, action, previous_data, next_data, created_at)
      values (new_workspace, null, coalesce(nullif(item->>'record_type', ''), 'recovered'), nullif(item->>'record_id', '')::uuid,
        coalesce(nullif(item->>'action', ''), 'recovered'), item->'previous_data', item->'next_data', coalesce((item->>'created_at')::timestamptz, now()));
  end loop;

  -- Invitation secrets are deliberately not recoverable. Preserve invitation
  -- history as expired rows; missing accounts are invited again from Admin.
  for item in select value from jsonb_array_elements(coalesce(target_backup->'invitations', '[]'::jsonb)) loop
    if char_length(trim(item->>'email')) between 3 and 320 then
      insert into public.workspace_invitations(workspace_id, email, token_hash, invited_by, book_permission, payroll_permission, status, expires_at, created_at)
        values (new_workspace, lower(trim(item->>'email')), encode(gen_random_bytes(32), 'hex'), target_admin,
          case when item->>'book_permission' in ('none','view','edit') then (item->>'book_permission')::public.app_permission else 'none' end,
          case when item->>'payroll_permission' in ('none','view','edit') then (item->>'payroll_permission')::public.app_permission else 'none' end,
          'expired', now() - interval '1 second', coalesce((item->>'created_at')::timestamptz, now()));
    end if;
  end loop;

  insert into public.system_admin_audit_events(actor_id, action, target_workspace_id, result, next_data)
    values (target_admin, 'workspace_restored', new_workspace, 'success', jsonb_build_object('source_workspace_id', target_backup->'workspace'->>'id'));
  return new_workspace;
end;
$$;

revoke all on function public.system_admin_restore_workspace(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.system_admin_restore_workspace(uuid, jsonb, text) to service_role;

notify pgrst, 'reload schema';
