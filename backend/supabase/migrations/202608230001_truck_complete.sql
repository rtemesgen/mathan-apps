-- Truck Equity app: schema, access, recovery, and deletion safeguards.

create table if not exists public.trucks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  unit_number text not null default '', make_model text not null default '', vin text not null default '',
  cash_on_hand numeric(14,2) not null default 0 check (cash_on_hand >= 0), license_plate text not null default '',
  deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists trucks_workspace_idx on public.trucks(workspace_id, created_at desc) where deleted_at is null;

create table if not exists public.truck_owners (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  truck_id uuid not null references public.trucks(id) on delete cascade, user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 160), start_date date not null default current_date,
  equity_percentage numeric(6,3) not null default 0 check (equity_percentage >= 0 and equity_percentage <= 100),
  monthly_draw_rate numeric(14,2) not null default 0 check (monthly_draw_rate >= 0), avatar_color text not null default 'bg-slate-800 text-white',
  deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists truck_owners_workspace_idx on public.truck_owners(workspace_id, truck_id) where deleted_at is null;

create table if not exists public.truck_transactions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  truck_id uuid not null references public.trucks(id) on delete cascade, owner_id uuid references public.truck_owners(id) on delete set null,
  occurred_on date not null default current_date,
  transaction_type text not null check (transaction_type in ('INCOME','EXPENSE','CAPITAL_INJECTION','CAPITAL_REPAYMENT','PROFIT_DISTRIBUTION')),
  category text not null default '', amount numeric(14,2) not null check (amount > 0), description text not null default '', reference_no text,
  deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists truck_transactions_workspace_idx on public.truck_transactions(workspace_id, truck_id, occurred_on desc) where deleted_at is null;

alter table public.workspace_apps drop constraint if exists workspace_apps_app_id_check;
alter table public.workspace_apps add constraint workspace_apps_app_id_check check (app_id in ('book','payroll','truck'));
alter table public.workspace_member_app_permissions drop constraint if exists workspace_member_app_permissions_app_id_check;
alter table public.workspace_member_app_permissions add constraint workspace_member_app_permissions_app_id_check check (app_id in ('book','payroll','truck'));
insert into public.workspace_apps(workspace_id, app_id, enabled) select id, 'truck', true from public.workspaces on conflict (workspace_id, app_id) do nothing;
insert into public.workspace_member_app_permissions(workspace_id, user_id, app_id, permission)
select workspace_id, user_id, 'truck', 'edit' from public.workspace_members where role = 'owner' on conflict (workspace_id, user_id, app_id) do nothing;

alter table public.trucks enable row level security;
alter table public.truck_owners enable row level security;
alter table public.truck_transactions enable row level security;
create policy "truck viewers read trucks" on public.trucks for select using (public.can_view_workspace_app(workspace_id, 'truck'));
create policy "truck editors insert trucks" on public.trucks for insert with check (public.can_edit_workspace_app(workspace_id, 'truck'));
create policy "truck editors update trucks" on public.trucks for update using (public.can_edit_workspace_app(workspace_id, 'truck')) with check (public.can_edit_workspace_app(workspace_id, 'truck'));
create policy "truck viewers read owners" on public.truck_owners for select using (public.can_view_workspace_app(workspace_id, 'truck'));
create policy "truck editors insert owners" on public.truck_owners for insert with check (public.can_edit_workspace_app(workspace_id, 'truck'));
create policy "truck editors update owners" on public.truck_owners for update using (public.can_edit_workspace_app(workspace_id, 'truck')) with check (public.can_edit_workspace_app(workspace_id, 'truck'));
create policy "truck viewers read transactions" on public.truck_transactions for select using (public.can_view_workspace_app(workspace_id, 'truck'));
create policy "truck editors insert transactions" on public.truck_transactions for insert with check (public.can_edit_workspace_app(workspace_id, 'truck'));
create policy "truck editors update transactions" on public.truck_transactions for update using (public.can_edit_workspace_app(workspace_id, 'truck')) with check (public.can_edit_workspace_app(workspace_id, 'truck'));

create or replace function public.list_my_truck_access()
returns table(workspace_id uuid, truck_enabled boolean, truck_permission public.app_permission)
language sql security definer set search_path = public as $$
  select m.workspace_id, coalesce(a.enabled, true), coalesce(p.permission, case when m.role = 'owner' then 'edit'::public.app_permission else 'none'::public.app_permission end)
  from public.workspace_members m
  left join public.workspace_apps a on a.workspace_id = m.workspace_id and a.app_id = 'truck'
  left join public.workspace_member_app_permissions p on p.workspace_id = m.workspace_id and p.user_id = m.user_id and p.app_id = 'truck'
  where m.user_id = auth.uid();
$$;
grant execute on function public.list_my_truck_access() to authenticated;

create or replace function public.seed_workspace_apps()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.workspace_apps (workspace_id, app_id) values (new.id, 'book'), (new.id, 'payroll'), (new.id, 'truck') on conflict do nothing;
  insert into public.workspace_profiles (user_id, display_name) values (new.created_by, coalesce((select raw_user_meta_data ->> 'name' from auth.users where id = new.created_by), '')) on conflict (user_id) do nothing;
  return new;
end;
$$;
create or replace function public.seed_truck_owner_access()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'owner' then
    insert into public.workspace_member_app_permissions(workspace_id, user_id, app_id, permission) values (new.workspace_id, new.user_id, 'truck', 'edit') on conflict (workspace_id, user_id, app_id) do update set permission = 'edit';
  end if;
  return new;
end;
$$;
drop trigger if exists workspace_truck_owner_access on public.workspace_members;
create trigger workspace_truck_owner_access after insert or update of role on public.workspace_members for each row execute function public.seed_truck_owner_access();

create or replace function public.delete_truck_transaction(target_workspace uuid, target_transaction uuid, approval_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_workspace_app(target_workspace, 'truck') then raise exception 'Truck edit access required'; end if;
  if not public.approval_is_granted(target_workspace, 'delete_transaction', target_transaction, approval_id) then raise exception 'Owner approval is required before deleting this transaction'; end if;
  update public.truck_transactions set deleted_at = now(), updated_at = now() where id = target_transaction and workspace_id = target_workspace and deleted_at is null;
  if not found then raise exception 'Truck transaction not found'; end if;
end;
$$;
revoke all on function public.delete_truck_transaction(uuid, uuid, uuid) from public, anon;
grant execute on function public.delete_truck_transaction(uuid, uuid, uuid) to authenticated;

-- Extend the existing system-admin recovery function with Truck resources.
alter function public.system_admin_restore_workspace(uuid, jsonb, text) rename to system_admin_restore_workspace_legacy;
create or replace function public.system_admin_restore_workspace(target_admin uuid, target_backup jsonb, target_name text)
returns uuid language plpgsql security definer set search_path = public, auth, extensions as $$
declare restored_workspace uuid; item jsonb; new_truck uuid; new_owner uuid; source_user uuid;
begin
  restored_workspace := public.system_admin_restore_workspace_legacy(target_admin, target_backup, target_name);
  create temporary table if not exists truck_restore_map(source_id uuid primary key, target_id uuid) on commit drop;
  create temporary table if not exists truck_owner_restore_map(source_id uuid primary key, target_id uuid) on commit drop;
  for item in select value from jsonb_array_elements(coalesce(target_backup->'trucks', '[]'::jsonb)) loop
    insert into public.trucks(workspace_id, name, unit_number, make_model, vin, cash_on_hand, license_plate) values (restored_workspace, coalesce(item->>'name','Recovered truck'), coalesce(item->>'unit_number',''), coalesce(item->>'make_model',''), coalesce(item->>'vin',''), coalesce((item->>'cash_on_hand')::numeric,0), coalesce(item->>'license_plate','')) returning id into new_truck;
    insert into truck_restore_map values ((item->>'id')::uuid, new_truck) on conflict do nothing;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(target_backup->'truck_owners', '[]'::jsonb)) loop
    select id into new_truck from truck_restore_map where source_id = (item->>'truck_id')::uuid;
    if new_truck is not null then
      select u.id into source_user from auth.users u where lower(u.email) = lower((select value->>'email' from jsonb_array_elements(coalesce(target_backup->'users', '[]'::jsonb)) where value->>'id' = item->>'user_id' limit 1)) limit 1;
      insert into public.truck_owners(workspace_id, truck_id, user_id, name, start_date, equity_percentage, monthly_draw_rate, avatar_color) values (restored_workspace, new_truck, source_user, coalesce(item->>'name','Recovered partner'), coalesce((item->>'start_date')::date,current_date), coalesce((item->>'equity_percentage')::numeric,0), coalesce((item->>'monthly_draw_rate')::numeric,0), coalesce(item->>'avatar_color','bg-slate-800 text-white')) returning id into new_owner;
      insert into truck_owner_restore_map values ((item->>'id')::uuid, new_owner) on conflict do nothing;
    end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(target_backup->'truck_transactions', '[]'::jsonb)) loop
    select id into new_truck from truck_restore_map where source_id = (item->>'truck_id')::uuid;
    if new_truck is not null then
      select target_id into new_owner from truck_owner_restore_map where source_id = nullif(item->>'owner_id','')::uuid;
      insert into public.truck_transactions(workspace_id, truck_id, owner_id, occurred_on, transaction_type, category, amount, description, reference_no) values (restored_workspace, new_truck, new_owner, coalesce((item->>'occurred_on')::date,current_date), coalesce(item->>'transaction_type','EXPENSE'), coalesce(item->>'category',''), coalesce((item->>'amount')::numeric,0.01), coalesce(item->>'description',''), nullif(item->>'reference_no',''));
    end if;
  end loop;
  return restored_workspace;
end;
$$;
revoke all on function public.system_admin_restore_workspace(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.system_admin_restore_workspace(uuid, jsonb, text) to service_role;

-- Fix the Settings company-access RPC's ambiguous OUT parameter reference.
create or replace function public.list_member_company_access(target_user uuid)
returns table (workspace_id uuid, workspace_name text, is_member boolean, member_role public.workspace_role)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_workspace_owner((select wm.workspace_id from public.workspace_members wm where wm.user_id = auth.uid() and wm.role = 'owner' limit 1)) then raise exception 'Only workspace owners can view company access'; end if;
  return query select w.id as workspace_id, w.name as workspace_name,
    exists (select 1 from public.workspace_members tm where tm.workspace_id = w.id and tm.user_id = target_user) as is_member,
    (select tm.role from public.workspace_members tm where tm.workspace_id = w.id and tm.user_id = target_user limit 1) as member_role
  from public.workspaces w join public.workspace_members owner_members on owner_members.workspace_id = w.id and owner_members.user_id = auth.uid() and owner_members.role = 'owner' order by w.name;
end;
$$;
grant execute on function public.list_member_company_access(uuid) to authenticated;
notify pgrst, 'reload schema';
