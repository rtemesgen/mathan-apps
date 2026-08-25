-- Track income and expenses that are owed by or to another person/location.
create table if not exists public.truck_customers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  truck_id uuid not null references public.trucks(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  phone text, address text, notes text,
  deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists truck_customers_workspace_idx on public.truck_customers(workspace_id, truck_id, lower(name)) where deleted_at is null;
alter table public.truck_customers enable row level security;
create policy "truck viewers read customers" on public.truck_customers for select using (public.can_view_workspace_app(workspace_id, 'truck'));
create policy "truck editors insert customers" on public.truck_customers for insert with check (public.can_edit_workspace_app(workspace_id, 'truck'));
create policy "truck editors update customers" on public.truck_customers for update using (public.can_edit_workspace_app(workspace_id, 'truck')) with check (public.can_edit_workspace_app(workspace_id, 'truck'));
grant select, insert, update on public.truck_customers to authenticated;
drop trigger if exists audit_trucks on public.trucks;
create trigger audit_trucks after insert or update or delete on public.trucks for each row execute function public.audit_row_change();
drop trigger if exists audit_truck_owners on public.truck_owners;
create trigger audit_truck_owners after insert or update or delete on public.truck_owners for each row execute function public.audit_row_change();
drop trigger if exists audit_truck_customers on public.truck_customers;
create trigger audit_truck_customers after insert or update or delete on public.truck_customers for each row execute function public.audit_row_change();
drop trigger if exists audit_truck_transactions on public.truck_transactions;
create trigger audit_truck_transactions after insert or update or delete on public.truck_transactions for each row execute function public.audit_row_change();

alter table public.truck_transactions add column if not exists customer_id uuid references public.truck_customers(id) on delete set null;
alter table public.truck_transactions drop constraint if exists truck_transactions_transaction_type_check;
alter table public.truck_transactions add constraint truck_transactions_transaction_type_check check (transaction_type in ('INCOME','EXPENSE','CAPITAL_INJECTION','CAPITAL_REPAYMENT','PROFIT_DISTRIBUTION','RECEIVABLE','PAYABLE','RECEIVABLE_SETTLEMENT','PAYABLE_SETTLEMENT'));
alter table public.truck_transactions add column if not exists counterparty_type text check (counterparty_type in ('CUSTOMER','OWNER','OTHER'));
alter table public.truck_transactions add column if not exists counterparty_name text;
alter table public.truck_transactions add column if not exists settles_transaction_id uuid references public.truck_transactions(id) on delete set null;
create index if not exists truck_transactions_settlement_idx on public.truck_transactions(workspace_id, settles_transaction_id) where deleted_at is null;
