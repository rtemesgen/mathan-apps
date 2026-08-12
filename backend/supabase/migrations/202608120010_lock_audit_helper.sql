-- Audit rows are created by trusted SECURITY DEFINER functions and triggers.
-- Do not expose the generic helper to browser clients, which could otherwise
-- manufacture arbitrary audit entries.
revoke execute on function public.audit_workspace_event(uuid, text, uuid, text, jsonb, jsonb) from authenticated;
