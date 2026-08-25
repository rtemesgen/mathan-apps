-- Keep administrator and workspace recovery backups complete for Truck Equity.
-- Customer receivables/payables depend on customer_id and settlement links, so
-- those relationships must be remapped when a backup is restored beside the
-- original workspace.

create or replace function public.restore_truck_backup(target_workspace uuid, target_backup jsonb)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  item jsonb;
  old_id text;
  new_id uuid;
  linked_id uuid;
  truck_map jsonb := '{}'::jsonb;
  owner_map jsonb := '{}'::jsonb;
  customer_map jsonb := '{}'::jsonb;
  transaction_map jsonb := '{}'::jsonb;
begin
  for item in select value from jsonb_array_elements(coalesce(target_backup->'trucks', '[]'::jsonb)) loop
    old_id := item->>'id';
    new_id := gen_random_uuid();
    insert into public.trucks(id, workspace_id, name, unit_number, make_model, vin, cash_on_hand, license_plate, deleted_at, created_at, updated_at)
      values (new_id, target_workspace, coalesce(item->>'name', 'Recovered truck'), coalesce(item->>'unit_number', ''), coalesce(item->>'make_model', ''), coalesce(item->>'vin', ''), greatest(0, coalesce((item->>'cash_on_hand')::numeric, 0)), coalesce(item->>'license_plate', ''), nullif(item->>'deleted_at', '')::timestamptz, coalesce((item->>'created_at')::timestamptz, now()), coalesce((item->>'updated_at')::timestamptz, now()));
    if old_id is not null then truck_map := truck_map || jsonb_build_object(old_id, new_id::text); end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(target_backup->'truck_owners', '[]'::jsonb)) loop
    old_id := item->>'id';
    linked_id := nullif(truck_map->>(item->>'truck_id'), '')::uuid;
    if linked_id is not null then
      new_id := gen_random_uuid();
      insert into public.truck_owners(id, workspace_id, truck_id, user_id, name, start_date, equity_percentage, monthly_draw_rate, avatar_color, deleted_at, created_at, updated_at)
        values (new_id, target_workspace, linked_id, case when nullif(item->>'user_id', '') is not null and exists (select 1 from auth.users where id = (item->>'user_id')::uuid) then (item->>'user_id')::uuid else null end, coalesce(item->>'name', 'Recovered owner'), coalesce((item->>'start_date')::date, current_date), greatest(0, least(100, coalesce((item->>'equity_percentage')::numeric, 0))), greatest(0, coalesce((item->>'monthly_draw_rate')::numeric, 0)), coalesce(item->>'avatar_color', 'bg-slate-800 text-white'), nullif(item->>'deleted_at', '')::timestamptz, coalesce((item->>'created_at')::timestamptz, now()), coalesce((item->>'updated_at')::timestamptz, now()));
      if old_id is not null then owner_map := owner_map || jsonb_build_object(old_id, new_id::text); end if;
    end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(target_backup->'truck_customers', '[]'::jsonb)) loop
    old_id := item->>'id';
    linked_id := nullif(truck_map->>(item->>'truck_id'), '')::uuid;
    if linked_id is not null then
      new_id := gen_random_uuid();
      insert into public.truck_customers(id, workspace_id, truck_id, name, phone, address, notes, deleted_at, created_at, updated_at)
        values (new_id, target_workspace, linked_id, coalesce(item->>'name', 'Recovered customer'), nullif(item->>'phone', ''), nullif(item->>'address', ''), nullif(item->>'notes', ''), nullif(item->>'deleted_at', '')::timestamptz, coalesce((item->>'created_at')::timestamptz, now()), coalesce((item->>'updated_at')::timestamptz, now()));
      if old_id is not null then customer_map := customer_map || jsonb_build_object(old_id, new_id::text); end if;
    end if;
  end loop;

  -- Insert transactions without settlement links first. This allows a
  -- settlement to reference a transaction that appears later in the backup.
  for item in select value from jsonb_array_elements(coalesce(target_backup->'truck_transactions', '[]'::jsonb)) loop
    old_id := item->>'id';
    linked_id := nullif(truck_map->>(item->>'truck_id'), '')::uuid;
    if linked_id is not null and item->>'transaction_type' in ('INCOME','EXPENSE','CAPITAL_INJECTION','CAPITAL_REPAYMENT','PROFIT_DISTRIBUTION','RECEIVABLE','PAYABLE','RECEIVABLE_SETTLEMENT','PAYABLE_SETTLEMENT') then
      new_id := gen_random_uuid();
      insert into public.truck_transactions(id, workspace_id, truck_id, owner_id, customer_id, occurred_on, transaction_type, category, amount, description, reference_no, counterparty_type, counterparty_name, settles_transaction_id, deleted_at, created_at, updated_at)
        values (new_id, target_workspace, linked_id, nullif(owner_map->>(item->>'owner_id'), '')::uuid, nullif(customer_map->>(item->>'customer_id'), '')::uuid, coalesce((item->>'occurred_on')::date, current_date), item->>'transaction_type', coalesce(item->>'category', ''), greatest(0.01, coalesce((item->>'amount')::numeric, 0.01)), coalesce(item->>'description', ''), nullif(item->>'reference_no', ''), nullif(item->>'counterparty_type', ''), nullif(item->>'counterparty_name', ''), null, nullif(item->>'deleted_at', '')::timestamptz, coalesce((item->>'created_at')::timestamptz, now()), coalesce((item->>'updated_at')::timestamptz, now()));
      if old_id is not null then transaction_map := transaction_map || jsonb_build_object(old_id, new_id::text); end if;
    end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(target_backup->'truck_transactions', '[]'::jsonb)) loop
    linked_id := nullif(transaction_map->>(item->>'id'), '')::uuid;
    if linked_id is not null and nullif(item->>'settles_transaction_id', '') is not null then
      update public.truck_transactions
        set settles_transaction_id = nullif(transaction_map->>(item->>'settles_transaction_id'), '')::uuid
        where id = linked_id;
    end if;
  end loop;
end;
$$;

revoke all on function public.restore_truck_backup(uuid, jsonb) from public, anon, authenticated;

