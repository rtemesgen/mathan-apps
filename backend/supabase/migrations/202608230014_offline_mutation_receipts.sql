-- Durable idempotency receipts for device-first synchronization.
create table if not exists public.offline_mutation_receipts (
  mutation_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  status text not null,
  revision bigint,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists offline_mutation_receipts_workspace_idx
  on public.offline_mutation_receipts(workspace_id, created_at desc);

alter table public.offline_mutation_receipts enable row level security;
drop policy if exists "users read own offline mutation receipts" on public.offline_mutation_receipts;
create policy "users read own offline mutation receipts"
  on public.offline_mutation_receipts for select
  using (user_id = auth.uid());

create or replace function public.write_app_state_snapshot(
  target_workspace uuid,
  target_domain text,
  expected_revision bigint,
  target_payload jsonb,
  audit_action text,
  affected_client_ids jsonb,
  mutation_id uuid
)
returns table(status text, revision bigint, payload jsonb, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare existing_receipt public.offline_mutation_receipts;
declare result_row record;
begin
  if mutation_id is not null then
    select * into existing_receipt from public.offline_mutation_receipts
      where offline_mutation_receipts.mutation_id = write_app_state_snapshot.mutation_id;
    if found then
      return query select existing_receipt.status, existing_receipt.revision,
        existing_receipt.payload, existing_receipt.created_at;
      return;
    end if;
  end if;

  select * into result_row from public.write_app_state_snapshot(
    target_workspace, target_domain, expected_revision, target_payload,
    coalesce(audit_action, 'snapshot_written'), coalesce(affected_client_ids, '[]'::jsonb)
  );

  if mutation_id is not null and result_row.status = 'written' then
    insert into public.offline_mutation_receipts
      (mutation_id, user_id, workspace_id, entity_type, entity_id, status, revision, payload)
    values
      (mutation_id, auth.uid(), target_workspace, 'app_state_snapshot', target_domain,
       result_row.status, result_row.revision, result_row.payload)
    on conflict (mutation_id) do nothing;
  end if;

  return query select result_row.status::text, result_row.revision::bigint,
    result_row.payload::jsonb, result_row.updated_at::timestamptz;
end;
$$;

grant execute on function public.write_app_state_snapshot(uuid, text, bigint, jsonb, text, jsonb, uuid) to authenticated;
notify pgrst, 'reload schema';
