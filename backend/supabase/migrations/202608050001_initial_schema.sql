create extension if not exists "pgcrypto";

create type public.workspace_role as enum ('owner', 'member');
create type public.cash_transaction_type as enum ('in', 'out');
create type public.payroll_transaction_type as enum ('withdrawal', 'advance', 'monthly_payout', 'adjustment');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create function public.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members where workspace_id = target_workspace and user_id = auth.uid());
$$;

create function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

create function public.create_workspace(workspace_name text)
returns public.workspaces language plpgsql security definer set search_path = public as $$
declare created_workspace public.workspaces;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.workspaces (name, created_by) values (trim(workspace_name), auth.uid()) returning * into created_workspace;
  insert into public.workspace_members (workspace_id, user_id, role) values (created_workspace.id, auth.uid(), 'owner');
  return created_workspace;
end; $$;

create table public.cash_books (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null, description text, currency text not null default '$', category text,
  client_id text unique, deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.cash_transactions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  book_id uuid not null references public.cash_books(id) on delete cascade, type public.cash_transaction_type not null,
  amount numeric(14,2) not null check (amount >= 0), remark text not null, category text, payment_mode text,
  occurred_at timestamptz not null, client_id text unique, deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.employees (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null, department text, position text, start_date date not null, initial_salary numeric(14,2) not null,
  status text not null default 'active', client_id text unique, deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.salary_changes (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade, effective_date date not null,
  new_monthly_salary numeric(14,2) not null, reason text not null, client_id text unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.payroll_transactions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade, amount numeric(14,2) not null check (amount >= 0),
  transaction_date date not null, type public.payroll_transaction_type not null, payment_method text, reference_no text, notes text,
  client_id text unique, deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.record_attachments (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  record_type text not null, record_id uuid not null, storage_path text not null unique, file_name text not null, mime_type text, size_bytes bigint,
  created_at timestamptz not null default now()
);
create table public.cash_transaction_attachments (
  cash_transaction_id uuid not null references public.cash_transactions(id) on delete cascade,
  attachment_id uuid not null references public.record_attachments(id) on delete cascade,
  primary key (cash_transaction_id, attachment_id)
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null, record_type text not null, record_id uuid, action text not null,
  previous_data jsonb, next_data jsonb, created_at timestamptz not null default now()
);

create index cash_books_workspace_idx on public.cash_books(workspace_id) where deleted_at is null;
create index cash_transactions_workspace_idx on public.cash_transactions(workspace_id, occurred_at desc) where deleted_at is null;
create index employees_workspace_idx on public.employees(workspace_id) where deleted_at is null;
create index payroll_transactions_workspace_idx on public.payroll_transactions(workspace_id, transaction_date desc) where deleted_at is null;

create trigger workspaces_updated_at before update on public.workspaces for each row execute function public.set_updated_at();
create trigger cash_books_updated_at before update on public.cash_books for each row execute function public.set_updated_at();
create trigger cash_transactions_updated_at before update on public.cash_transactions for each row execute function public.set_updated_at();
create trigger employees_updated_at before update on public.employees for each row execute function public.set_updated_at();
create trigger salary_changes_updated_at before update on public.salary_changes for each row execute function public.set_updated_at();
create trigger payroll_transactions_updated_at before update on public.payroll_transactions for each row execute function public.set_updated_at();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.cash_books enable row level security;
alter table public.cash_transactions enable row level security;
alter table public.employees enable row level security;
alter table public.salary_changes enable row level security;
alter table public.payroll_transactions enable row level security;
alter table public.record_attachments enable row level security;
alter table public.cash_transaction_attachments enable row level security;
alter table public.audit_events enable row level security;

create policy "members view workspace" on public.workspaces for select using (public.is_workspace_member(id));
create policy "members view memberships" on public.workspace_members for select using (public.is_workspace_member(workspace_id));
create policy "members access cash books" on public.cash_books for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members access cash transactions" on public.cash_transactions for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members access employees" on public.employees for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members access salary changes" on public.salary_changes for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members access payroll transactions" on public.payroll_transactions for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members access attachments" on public.record_attachments for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members access cash transaction attachments" on public.cash_transaction_attachments for all using (exists (select 1 from public.cash_transactions t where t.id = cash_transaction_id and public.is_workspace_member(t.workspace_id))) with check (exists (select 1 from public.cash_transactions t where t.id = cash_transaction_id and public.is_workspace_member(t.workspace_id)));
create policy "members view audit events" on public.audit_events for select using (public.is_workspace_member(workspace_id));

insert into storage.buckets (id, name, public) values ('workspace-attachments', 'workspace-attachments', false) on conflict do nothing;
create policy "workspace attachment access" on storage.objects for all using (bucket_id = 'workspace-attachments' and public.is_workspace_member((storage.foldername(name))[1]::uuid)) with check (bucket_id = 'workspace-attachments' and public.is_workspace_member((storage.foldername(name))[1]::uuid));

