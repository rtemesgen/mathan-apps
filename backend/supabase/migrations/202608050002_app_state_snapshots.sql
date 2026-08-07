create table public.app_state_snapshots (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  domain text not null check (domain in ('cash_book:books', 'cash_book:transactions', 'payroll:employees', 'payroll:transactions', 'payroll:custom-apps')),
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, domain)
);

alter table public.app_state_snapshots enable row level security;
create policy "members access app snapshots" on public.app_state_snapshots for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
