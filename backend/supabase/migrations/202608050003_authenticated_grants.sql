-- RLS policies decide which rows are visible; these grants allow the authenticated
-- Supabase API role to reach the tables so those policies can be evaluated.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
grant select, insert, update, delete on public.cash_books to authenticated;
grant select, insert, update, delete on public.cash_transactions to authenticated;
grant select, insert, update, delete on public.employees to authenticated;
grant select, insert, update, delete on public.salary_changes to authenticated;
grant select, insert, update, delete on public.payroll_transactions to authenticated;
grant select, insert, update, delete on public.record_attachments to authenticated;
grant select, insert, update, delete on public.cash_transaction_attachments to authenticated;
grant select on public.audit_events to authenticated;
grant select, insert, update, delete on public.app_state_snapshots to authenticated;
grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;
