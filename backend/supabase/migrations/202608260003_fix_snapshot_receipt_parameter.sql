-- The idempotent snapshot wrapper previously used an unqualified
-- `mutation_id` in its INSERT values list. PostgreSQL treated it as
-- ambiguous between the function parameter and the receipt column, causing
-- otherwise durable Cash Book/Payroll saves to remain unsynchronized.

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
#variable_conflict use_column
declare
  existing_receipt public.offline_mutation_receipts;
  result_row record;
  incoming_mutation_id uuid := mutation_id;
begin
  if incoming_mutation_id is not null then
    select * into existing_receipt
      from public.offline_mutation_receipts as receipt
      where receipt.mutation_id = incoming_mutation_id;
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

  if incoming_mutation_id is not null and result_row.status = 'written' then
    insert into public.offline_mutation_receipts as receipt
      (mutation_id, user_id, workspace_id, entity_type, entity_id, status, revision, payload)
    values
      (incoming_mutation_id, auth.uid(), target_workspace, 'app_state_snapshot', target_domain,
       result_row.status, result_row.revision, result_row.payload)
    on conflict (mutation_id) do nothing;
  end if;

  return query select result_row.status::text, result_row.revision::bigint,
    result_row.payload::jsonb, result_row.updated_at::timestamptz;
end;
$$;

grant execute on function public.write_app_state_snapshot(uuid, text, bigint, jsonb, text, jsonb, uuid) to authenticated;
notify pgrst, 'reload schema';
