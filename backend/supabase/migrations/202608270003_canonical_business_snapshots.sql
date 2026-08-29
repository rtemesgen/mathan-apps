-- Cash Book and Payroll now persist one canonical parent+child snapshot per
-- workspace. Keep the split domains readable for non-destructive upgrades.

alter table public.app_state_snapshots
  drop constraint if exists app_state_snapshots_domain_check;
alter table public.app_state_snapshots
  add constraint app_state_snapshots_domain_check check (domain in (
    'cash_book:state', 'cash_book:books', 'cash_book:transactions',
    'payroll:state', 'payroll:employees', 'payroll:transactions', 'payroll:custom-apps'
  ));

create or replace function public.write_app_state_snapshot(
  target_workspace uuid,
  target_domain text,
  expected_revision bigint,
  target_payload jsonb,
  audit_action text default 'snapshot_written',
  affected_client_ids jsonb default '[]'::jsonb
)
returns table(status text, revision bigint, payload jsonb, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare current_row public.app_state_snapshots;
declare app_name text := case split_part(target_domain, ':', 1) when 'cash_book' then 'book' else 'payroll' end;
begin
  if not public.can_edit_workspace_app(target_workspace, app_name) then raise exception 'Edit permission required'; end if;
  if target_domain not in ('cash_book:state','cash_book:books','cash_book:transactions','payroll:state','payroll:employees','payroll:transactions','payroll:custom-apps') then raise exception 'Invalid snapshot domain'; end if;
  select * into current_row from public.app_state_snapshots where workspace_id = target_workspace and domain = target_domain for update;
  if current_row.workspace_id is not null and current_row.revision <> coalesce(expected_revision, 0) then
    return query select 'conflict', current_row.revision, current_row.payload, current_row.updated_at;
    return;
  end if;
  if current_row.workspace_id is null then
    insert into public.app_state_snapshots(workspace_id, domain, payload, revision)
      values (target_workspace, target_domain, target_payload, 1)
      returning app_state_snapshots.* into current_row;
  else
    update public.app_state_snapshots set payload = target_payload, revision = current_row.revision + 1, updated_at = now()
      where workspace_id = target_workspace and domain = target_domain
      returning app_state_snapshots.* into current_row;
  end if;
  insert into public.audit_events(workspace_id, actor_id, record_type, record_id, action, next_data)
    values (target_workspace, auth.uid(), 'app_state_snapshot', null, audit_action,
      jsonb_build_object('domain', target_domain, 'revision', current_row.revision, 'affected_client_ids', affected_client_ids));
  return query select 'written', current_row.revision, current_row.payload, current_row.updated_at;
end;
$$;

grant execute on function public.write_app_state_snapshot(uuid, text, bigint, jsonb, text, jsonb) to authenticated;

-- Backup restore functions contain their own snapshot allowlist. Update every
-- deployed overload in place so canonical snapshots survive restore without
-- replacing the surrounding, version-specific restore logic.
do $$
declare target record;
declare definition text;
begin
  for target in
    select procedure.oid
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in ('restore_workspace_backup', 'system_admin_restore_workspace')
  loop
    definition := pg_get_functiondef(target.oid);
    definition := replace(definition,
      '''cash_book:books'',''cash_book:transactions'',''payroll:employees'',''payroll:transactions'',''payroll:custom-apps''',
      '''cash_book:state'',''cash_book:books'',''cash_book:transactions'',''payroll:state'',''payroll:employees'',''payroll:transactions'',''payroll:custom-apps''');
    definition := replace(definition,
      '''cash_book:books'', ''cash_book:transactions'', ''payroll:employees'', ''payroll:transactions'', ''payroll:custom-apps''',
      '''cash_book:state'', ''cash_book:books'', ''cash_book:transactions'', ''payroll:state'', ''payroll:employees'', ''payroll:transactions'', ''payroll:custom-apps''');
    execute definition;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
