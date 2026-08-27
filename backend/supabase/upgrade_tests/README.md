# Legacy upgrade contract

This contract deliberately runs outside `supabase/tests`: it needs legacy rows
to exist before the repair migration is applied.

From `backend/`, run against the disposable local Supabase stack:

```sh
npx supabase db reset --local --version 202608260005 --sql-paths fixtures/legacy_upgrade_seed.sql
npx supabase migration up --local
npx supabase test db supabase/upgrade_tests/legacy_upgrade_contract.sql
npx supabase db reset --local --no-seed
npx supabase test db
```

The first reset proves the real upgrade path. The second proves that a fresh
database reaches the same current migration set and restores the normal local
test database. Never run this sequence against a linked/production project.
