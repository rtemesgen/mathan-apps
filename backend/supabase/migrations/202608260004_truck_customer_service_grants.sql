-- Truck customers were added after the original service-role grants. Keep
-- backup and recovery operations consistent with the other Truck tables.
grant select, insert, update, delete on public.truck_customers to service_role;
