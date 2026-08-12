-- Audit rows are created by trusted SECURITY DEFINER functions and triggers.
-- Do not expose the generic helper to browser clients, which could otherwise
-- manufacture arbitrary audit entries.
revoke execute on function public.audit_workspace_event(uuid, text, uuid, text, jsonb, jsonb) from public, authenticated;

revoke all on public.cash_books, public.cash_transactions, public.employees,
  public.salary_changes, public.payroll_transactions, public.record_attachments,
  public.cash_transaction_attachments from authenticated;
