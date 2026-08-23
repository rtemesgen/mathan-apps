-- RLS decides which workspace rows a user may access; these table grants allow
-- the authenticated Supabase client to reach the policies in the first place.
grant select, insert, update on public.trucks to authenticated;
grant select, insert, update on public.truck_owners to authenticated;
grant select, insert, update on public.truck_transactions to authenticated;
