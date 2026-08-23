-- Idempotent, permission-checked import of local guest companies.

create table if not exists public.guest_workspace_import_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  import_id uuid not null,
  target_workspace uuid not null references public.workspaces(id) on delete cascade,
  guest_workspace_id text not null,
  fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, import_id, target_workspace)
);
alter table public.guest_workspace_import_receipts enable row level security;
drop policy if exists "users read own guest imports" on public.guest_workspace_import_receipts;
create policy "users read own guest imports" on public.guest_workspace_import_receipts for select using (user_id = auth.uid());
revoke all on public.guest_workspace_import_receipts from anon, authenticated;
grant select on public.guest_workspace_import_receipts to authenticated;

create or replace function public.import_guest_workspace(
  target_workspace uuid,
  target_import_id uuid,
  target_payload jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  receipt jsonb;
  domain_name text;
  incoming jsonb;
  merged jsonb;
  item jsonb;
  candidate jsonb;
  existing_item jsonb;
  source_id text;
  next_id text;
  cash_book_map jsonb := '{}'::jsonb;
  employee_map jsonb := '{}'::jsonb;
  truck_map jsonb := '{}'::jsonb;
  owner_map jsonb := '{}'::jsonb;
  imported_count integer := 0;
  skipped_count integer := 0;
  remapped_count integer := 0;
  current_revision bigint;
  truck_id uuid;
  owner_id uuid;
  transaction_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in before importing guest data'; end if;
  if coalesce((target_payload->>'version')::integer, 0) <> 1 then raise exception 'Unsupported guest import version'; end if;
  if not exists (select 1 from public.workspaces where id = target_workspace and deletion_status = 'active') then raise exception 'The destination company is unavailable'; end if;
  if not public.can_edit_workspace_app(target_workspace, 'book')
     or not public.can_edit_workspace_app(target_workspace, 'payroll')
     or not public.can_edit_workspace_app(target_workspace, 'truck') then
    raise exception 'Edit access to Cash Book, Payroll, and Truck Equity is required';
  end if;

  select r.result into receipt from public.guest_workspace_import_receipts r
    where r.user_id = auth.uid() and r.import_id = target_import_id and r.target_workspace = $1;
  if receipt is not null then return receipt || jsonb_build_object('status', 'already_imported'); end if;

  foreach domain_name in array array['cash_book:books','cash_book:transactions','payroll:employees','payroll:transactions','payroll:custom-apps'] loop
    incoming := coalesce(target_payload->'snapshots'->domain_name, '[]'::jsonb);
    if jsonb_typeof(incoming) <> 'array' then raise exception 'Invalid snapshot payload for %', domain_name; end if;
    select payload, revision into merged, current_revision from public.app_state_snapshots where workspace_id = target_workspace and domain = domain_name for update;
    merged := coalesce(merged, '[]'::jsonb);
    current_revision := coalesce(current_revision, 0);

    for item in select value from jsonb_array_elements(incoming) loop
      candidate := item;
      if domain_name = 'cash_book:transactions' and cash_book_map ? coalesce(item->>'bookId','') then candidate := jsonb_set(candidate, '{bookId}', to_jsonb(cash_book_map->>(item->>'bookId'))); end if;
      if domain_name = 'payroll:transactions' and employee_map ? coalesce(item->>'employeeId','') then candidate := jsonb_set(candidate, '{employeeId}', to_jsonb(employee_map->>(item->>'employeeId'))); end if;
      source_id := candidate->>'id';
      if source_id is null then
        if exists (select 1 from jsonb_array_elements(merged) value where value = candidate) then skipped_count := skipped_count + 1;
        else merged := merged || jsonb_build_array(candidate); imported_count := imported_count + 1; end if;
        continue;
      end if;
      select value into existing_item from jsonb_array_elements(merged) value where value->>'id' = source_id limit 1;
      if existing_item is null then
        merged := merged || jsonb_build_array(candidate); imported_count := imported_count + 1;
      elsif existing_item = candidate then skipped_count := skipped_count + 1;
      else
        next_id := source_id || '-guest-' || substr(target_import_id::text, 1, 8);
        while exists (select 1 from jsonb_array_elements(merged) value where value->>'id' = next_id) loop next_id := next_id || '-1'; end loop;
        candidate := jsonb_set(candidate, '{id}', to_jsonb(next_id));
        merged := merged || jsonb_build_array(candidate); imported_count := imported_count + 1; remapped_count := remapped_count + 1;
        if domain_name = 'cash_book:books' then cash_book_map := cash_book_map || jsonb_build_object(source_id, next_id); end if;
        if domain_name = 'payroll:employees' then employee_map := employee_map || jsonb_build_object(source_id, next_id); end if;
      end if;
    end loop;

    insert into public.app_state_snapshots(workspace_id, domain, payload, revision, updated_at)
      values (target_workspace, domain_name, merged, 1, now())
      on conflict (workspace_id, domain) do update set payload = excluded.payload, revision = public.app_state_snapshots.revision + 1, updated_at = now();
  end loop;

  for item in select value from jsonb_array_elements(coalesce(target_payload->'truck'->'trucks','[]'::jsonb)) loop
    truck_id := coalesce(nullif(item->>'id','')::uuid, gen_random_uuid());
    if exists (select 1 from public.trucks where id = truck_id) then truck_id := gen_random_uuid(); truck_map := truck_map || jsonb_build_object(item->>'id', truck_id::text); remapped_count := remapped_count + 1;
      insert into public.trucks(id, workspace_id, name, unit_number, make_model, vin, cash_on_hand, license_plate)
        values (truck_id, target_workspace, coalesce(nullif(trim(item->>'name'),''),'Imported truck'), coalesce(item->>'unitNumber',''), coalesce(item->>'makeModel',''), coalesce(item->>'vin',''), greatest(coalesce((item->>'cashOnHand')::numeric,0),0), coalesce(item->>'licensePlate',''));
      imported_count := imported_count + 1;
    else
      insert into public.trucks(id, workspace_id, name, unit_number, make_model, vin, cash_on_hand, license_plate)
        values (truck_id, target_workspace, coalesce(nullif(trim(item->>'name'),''),'Imported truck'), coalesce(item->>'unitNumber',''), coalesce(item->>'makeModel',''), coalesce(item->>'vin',''), greatest(coalesce((item->>'cashOnHand')::numeric,0),0), coalesce(item->>'licensePlate',''));
      truck_map := truck_map || jsonb_build_object(item->>'id', truck_id::text); imported_count := imported_count + 1;
    end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(target_payload->'truck'->'owners','[]'::jsonb)) loop
    truck_id := coalesce(nullif(truck_map->>(item->>'truckId'), '')::uuid, nullif(item->>'truckId','')::uuid);
    if not exists (select 1 from public.trucks where id = truck_id and workspace_id = target_workspace) then continue; end if;
    owner_id := coalesce(nullif(item->>'id','')::uuid, gen_random_uuid());
    if exists (select 1 from public.truck_owners where id = owner_id) then owner_id := gen_random_uuid(); owner_map := owner_map || jsonb_build_object(item->>'id', owner_id::text); remapped_count := remapped_count + 1;
      insert into public.truck_owners(id, workspace_id, truck_id, name, start_date, equity_percentage, monthly_draw_rate, avatar_color)
        values (owner_id, target_workspace, truck_id, coalesce(nullif(trim(item->>'name'),''),'Imported partner'), coalesce(nullif(item->>'startDate','')::date,current_date), least(100,greatest(0,coalesce((item->>'equityPercentage')::numeric,0))), greatest(0,coalesce((item->>'monthlyDrawRate')::numeric,0)), coalesce(item->>'avatarColor','bg-slate-800 text-white'));
      imported_count := imported_count + 1;
    else
      insert into public.truck_owners(id, workspace_id, truck_id, name, start_date, equity_percentage, monthly_draw_rate, avatar_color)
        values (owner_id, target_workspace, truck_id, coalesce(nullif(trim(item->>'name'),''),'Imported partner'), coalesce(nullif(item->>'startDate','')::date,current_date), least(100,greatest(0,coalesce((item->>'equityPercentage')::numeric,0))), greatest(0,coalesce((item->>'monthlyDrawRate')::numeric,0)), coalesce(item->>'avatarColor','bg-slate-800 text-white'));
      owner_map := owner_map || jsonb_build_object(item->>'id', owner_id::text); imported_count := imported_count + 1;
    end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(target_payload->'truck'->'transactions','[]'::jsonb)) loop
    truck_id := coalesce(nullif(truck_map->>(item->>'truckId'), '')::uuid, nullif(item->>'truckId','')::uuid);
    owner_id := coalesce(nullif(owner_map->>coalesce(item->>'ownerId',''), '')::uuid, nullif(item->>'ownerId','')::uuid);
    if not exists (select 1 from public.trucks where id = truck_id and workspace_id = target_workspace) then continue; end if;
    if owner_id is not null and not exists (select 1 from public.truck_owners where id = owner_id and workspace_id = target_workspace) then owner_id := null; end if;
    transaction_id := coalesce(nullif(item->>'id','')::uuid, gen_random_uuid());
    if exists (select 1 from public.truck_transactions where id = transaction_id) then transaction_id := gen_random_uuid(); remapped_count := remapped_count + 1;
      insert into public.truck_transactions(id, workspace_id, truck_id, owner_id, occurred_on, transaction_type, category, amount, description, reference_no)
        values (transaction_id, target_workspace, truck_id, owner_id, coalesce(nullif(item->>'date','')::date,current_date), coalesce(item->>'type','EXPENSE'), coalesce(item->>'category',''), greatest(coalesce((item->>'amount')::numeric,0),0.01), coalesce(item->>'description',''), nullif(item->>'referenceNo',''));
      imported_count := imported_count + 1;
    else
      insert into public.truck_transactions(id, workspace_id, truck_id, owner_id, occurred_on, transaction_type, category, amount, description, reference_no)
        values (transaction_id, target_workspace, truck_id, owner_id, coalesce(nullif(item->>'date','')::date,current_date), coalesce(item->>'type','EXPENSE'), coalesce(item->>'category',''), greatest(coalesce((item->>'amount')::numeric,0),0.01), coalesce(item->>'description',''), nullif(item->>'referenceNo',''));
      imported_count := imported_count + 1;
    end if;
  end loop;

  receipt := jsonb_build_object('status','imported','imported',imported_count,'skipped',skipped_count,'remapped',remapped_count,'target_workspace',target_workspace,'fingerprint',target_payload->>'fingerprint');
  insert into public.guest_workspace_import_receipts(user_id, import_id, target_workspace, guest_workspace_id, fingerprint, result)
    values (auth.uid(), target_import_id, target_workspace, coalesce(target_payload->>'guestWorkspaceId',''), coalesce(target_payload->>'fingerprint',''), receipt);
  perform public.audit_workspace_event(target_workspace, 'guest_workspace_import', null, 'guest_workspace_imported', receipt, null);
  return receipt;
end;
$$;

revoke all on function public.import_guest_workspace(uuid, uuid, jsonb) from public, anon;
grant execute on function public.import_guest_workspace(uuid, uuid, jsonb) to authenticated;
notify pgrst, 'reload schema';
