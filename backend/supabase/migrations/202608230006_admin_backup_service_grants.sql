-- The system-admin Edge Function reads these resources with the server-only
-- service role while building encrypted backup archives. RLS remains enabled;
-- this grant does not expose the tables to browser clients.
grant select, insert, update, delete on public.notifications to service_role;
grant select, insert, update, delete on public.approval_requests to service_role;
grant select, insert, update, delete on public.trucks to service_role;
grant select, insert, update, delete on public.truck_owners to service_role;
grant select, insert, update, delete on public.truck_transactions to service_role;
