-- Invitation creation uses pgcrypto for secure one-time tokens. Some existing
-- environments have the functions but not the extension enabled, so make the
-- dependency explicit before the invitation RPCs are called.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Supabase projects commonly keep extensions outside public. Include that
-- schema for both token creation and token verification.
alter function public.create_workspace_invitation(uuid, text, public.app_permission, public.app_permission, integer)
  set search_path = public, extensions;
alter function public.create_workspace_phone_invitation(uuid, text)
  set search_path = public, extensions;
alter function public.accept_workspace_invitation(text)
  set search_path = public, extensions;
alter function public.respond_to_workspace_invitation(uuid, boolean)
  set search_path = public, extensions;
