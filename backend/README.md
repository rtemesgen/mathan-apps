# Mathan ERP Backend

This folder contains the Supabase database schema, Row Level Security policies, authentication workspace RPC, and private attachment-storage policies.

## Local Supabase setup

Install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), then run:

```bash
cd backend
supabase start
supabase db reset
```

The local Supabase CLI prints a project URL and anon key. Copy those values into `../frontend/.env` and `../mobile/.env`.

For a hosted project, create it in the Supabase dashboard and run the SQL files in `supabase/migrations/` using the SQL Editor or Supabase CLI.

## System administrator deployment

The Admin app depends on the `202608160001_system_admin.sql` migration and the authenticated `system-admin` Edge Function. Deploy them, then configure the comma-separated email allowlist used only to bootstrap named administrators:

```bash
supabase db push
supabase secrets set ADMIN_BOOTSTRAP_EMAILS="owner@example.com,backup-admin@example.com"
supabase functions deploy system-admin
```

The allowlisted user must already have a verified Supabase Auth account. On their next authenticated request, the server registers the account in `system_admins`. Remove an email from the secret after bootstrap if it should not be able to regain administrator access automatically.

Never place the service-role/secret key or `ADMIN_BOOTSTRAP_EMAILS` in a frontend or mobile environment file. Hosted Edge Functions receive the server credentials from Supabase automatically.
