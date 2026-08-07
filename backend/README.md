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

