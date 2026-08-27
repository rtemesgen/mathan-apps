-- Persist the last accepted offline mutation on each Truck row. If a client
-- loses the response after PostgreSQL commits, retrying the same mutation can
-- be acknowledged without replaying or duplicating the financial operation.

alter table public.trucks add column if not exists last_mutation_id uuid;
alter table public.truck_owners add column if not exists last_mutation_id uuid;
alter table public.truck_customers add column if not exists last_mutation_id uuid;
alter table public.truck_transactions add column if not exists last_mutation_id uuid;

create index if not exists trucks_last_mutation_idx on public.trucks(last_mutation_id) where last_mutation_id is not null;
create index if not exists truck_owners_last_mutation_idx on public.truck_owners(last_mutation_id) where last_mutation_id is not null;
create index if not exists truck_customers_last_mutation_idx on public.truck_customers(last_mutation_id) where last_mutation_id is not null;
create index if not exists truck_transactions_last_mutation_idx on public.truck_transactions(last_mutation_id) where last_mutation_id is not null;

notify pgrst, 'reload schema';
