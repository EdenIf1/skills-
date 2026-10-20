# Migrations

`20261018000000_live_baseline.sql` is the 2026-10-20 read-only export of project `qnhogbwnumvounwpusmc` (Postgres 17). The version sorts after the last live migration-history entry, `20261017132626`. The file is the full live schema (extensions, `backup`, sequences, tables, foreign keys, indexes, functions, triggers including `signup_guard` on `auth.users`, RLS, policies, grants, and `pg_cron`). It was not edited. `schema.sql` and `identity.sql` are separate hand-applied scripts and were not rewritten.

Do not `supabase db push` this baseline onto the live project. Those objects are already there.

## Cron token

`cubefront-retention` is scheduled with `Authorization: Bearer <REDACTED_JWT>`. The placeholder stays in this file. The token is the project's anon key, and it must be supplied from Supabase Vault or another secret when the job is created or restored. Do not paste the JWT back into the migration.

Later pulls from `../db-pull.sh` should add a new timestamped file and should not rewrite this baseline or the hand-applied SQL.
