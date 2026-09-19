-- Atomic, idempotent Truck transaction batches.
-- A batch receipt is the retry boundary: rows and the receipt are committed
-- together, and a repeated request with the same identity returns the original
-- result without inserting a second financial row.

create table if not exists public.truck_transaction_batch_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  batch_id uuid not null,
  request_payload jsonb not null,
  response_payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, workspace_id, batch_id)
);

alter table public.truck_transaction_batch_receipts enable row level security;
revoke all on public.truck_transaction_batch_receipts from public, anon, authenticated;

create or replace function public.write_truck_transaction_batch(
  target_workspace uuid,
  target_batch_id uuid,
  target_rows jsonb
)
returns table(status text, batch_id uuid, rows jsonb, created_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor uuid := auth.uid();
  requested jsonb := jsonb_build_object('batch_id', target_batch_id, 'rows', target_rows);
  prior public.truck_transaction_batch_receipts;
  row_count integer;
  id_count integer;
  mutation_count integer;
  response_rows jsonb;
  receipt_time timestamptz := now();
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not public.can_edit_workspace_app(target_workspace, 'truck') then
    raise exception 'Truck edit access required' using errcode = '42501';
  end if;
  if target_batch_id is null then raise exception 'batch_id is required' using errcode = '22023'; end if;
  if jsonb_typeof(target_rows) <> 'array' or jsonb_array_length(target_rows) = 0 or jsonb_array_length(target_rows) > 100 then
    raise exception 'rows must be a non-empty array of at most 100 items' using errcode = '22023';
  end if;

  -- PostgreSQL advisory locks cover the absent-receipt race as well as the
  -- existing-row case. A changed request under the same identity is rejected.
  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || target_workspace::text || ':' || target_batch_id::text, 0));
  select * into prior
  from public.truck_transaction_batch_receipts receipt
  where receipt.user_id = actor and receipt.workspace_id = target_workspace and receipt.batch_id = target_batch_id
  for update;
  if found then
    if prior.request_payload <> requested then
      raise exception 'Batch identity was reused with a different request' using errcode = '23505';
    end if;
    return query select 'already_applied'::text, prior.batch_id, prior.response_payload, prior.created_at;
    return;
  end if;

  begin
    select count(*)::integer, count(distinct item.id)::integer, count(distinct item.mutation_id)::integer
      into row_count, id_count, mutation_count
    from jsonb_to_recordset(target_rows) as item(
      id uuid, mutation_id uuid, workspace_id uuid, truck_id uuid, owner_id uuid, customer_id uuid,
      occurred_on date, transaction_type text, category text, amount numeric, description text,
      reference_no text, counterparty_type text, counterparty_name text, settles_transaction_id uuid
    );
  exception when others then
    raise exception 'Each batch row has an invalid field type' using errcode = '22023', detail = sqlerrm;
  end;
  if row_count <> id_count or row_count <> mutation_count then
    raise exception 'Batch row and mutation IDs must be present and unique' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(target_rows) as item(
      id uuid, mutation_id uuid, workspace_id uuid, truck_id uuid, owner_id uuid, customer_id uuid,
      occurred_on date, transaction_type text, category text, amount numeric, description text,
      reference_no text, counterparty_type text, counterparty_name text, settles_transaction_id uuid
    ) where item.workspace_id is distinct from target_workspace
      or item.occurred_on is null
      or item.transaction_type not in ('INCOME','EXPENSE','CAPITAL_INJECTION','CAPITAL_REPAYMENT','PROFIT_DISTRIBUTION','RECEIVABLE','PAYABLE','RECEIVABLE_SETTLEMENT','PAYABLE_SETTLEMENT')
      or item.amount is null or item.amount <= 0
      or item.category is null or item.description is null
      or (item.counterparty_type is not null and item.counterparty_type not in ('CUSTOMER','OWNER','OTHER'))
  ) then raise exception 'Batch contains an invalid Truck transaction' using errcode = '22023'; end if;

  if exists (
    select 1 from jsonb_to_recordset(target_rows) as item(
      id uuid, mutation_id uuid, workspace_id uuid, truck_id uuid, owner_id uuid, customer_id uuid,
      occurred_on date, transaction_type text, category text, amount numeric, description text,
      reference_no text, counterparty_type text, counterparty_name text, settles_transaction_id uuid
    ) where not exists (select 1 from public.trucks truck where truck.id = item.truck_id and truck.workspace_id = target_workspace and truck.deleted_at is null)
  ) then raise exception 'Batch references a missing or unauthorized truck' using errcode = '23503'; end if;

  if exists (
    select 1 from jsonb_to_recordset(target_rows) as item(
      id uuid, mutation_id uuid, workspace_id uuid, truck_id uuid, owner_id uuid, customer_id uuid,
      occurred_on date, transaction_type text, category text, amount numeric, description text,
      reference_no text, counterparty_type text, counterparty_name text, settles_transaction_id uuid
    ) where item.owner_id is not null and not exists (select 1 from public.truck_owners owner_row where owner_row.id = item.owner_id and owner_row.workspace_id = target_workspace and owner_row.truck_id = item.truck_id and owner_row.deleted_at is null)
      or item.customer_id is not null and not exists (select 1 from public.truck_customers customer_row where customer_row.id = item.customer_id and customer_row.workspace_id = target_workspace and customer_row.truck_id = item.truck_id and customer_row.deleted_at is null)
  ) then raise exception 'Batch references an invalid Truck owner or customer' using errcode = '23503'; end if;

  insert into public.truck_transactions (
    id, workspace_id, truck_id, owner_id, customer_id, occurred_on, transaction_type,
    category, amount, description, reference_no, counterparty_type, counterparty_name,
    settles_transaction_id, last_mutation_id
  )
  select item.id, target_workspace, item.truck_id, item.owner_id, item.customer_id, item.occurred_on,
    item.transaction_type, item.category, item.amount, item.description, item.reference_no,
    item.counterparty_type, item.counterparty_name, item.settles_transaction_id, item.mutation_id
  from jsonb_to_recordset(target_rows) as item(
    id uuid, mutation_id uuid, workspace_id uuid, truck_id uuid, owner_id uuid, customer_id uuid,
    occurred_on date, transaction_type text, category text, amount numeric, description text,
    reference_no text, counterparty_type text, counterparty_name text, settles_transaction_id uuid
  );

  select coalesce(jsonb_agg(to_jsonb(transaction_row) order by transaction_row.id), '[]'::jsonb)
    into response_rows
  from public.truck_transactions transaction_row
  where transaction_row.workspace_id = target_workspace
    and transaction_row.last_mutation_id in (
      select item.mutation_id from jsonb_to_recordset(target_rows) as item(
        id uuid, mutation_id uuid, workspace_id uuid, truck_id uuid, owner_id uuid, customer_id uuid,
        occurred_on date, transaction_type text, category text, amount numeric, description text,
        reference_no text, counterparty_type text, counterparty_name text, settles_transaction_id uuid
      )
    );

  insert into public.truck_transaction_batch_receipts(user_id, workspace_id, batch_id, request_payload, response_payload, created_at)
    values (actor, target_workspace, target_batch_id, requested, response_rows, receipt_time);
  return query select 'written'::text, target_batch_id, response_rows, receipt_time;
end;
$$;

revoke all on function public.write_truck_transaction_batch(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.write_truck_transaction_batch(uuid, uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
