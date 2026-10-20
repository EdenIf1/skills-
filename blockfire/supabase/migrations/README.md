# Migrations

This directory is for new, reviewed migrations only. `supabase db push` and preview branches apply every `.sql` file here because `[db.migrations] enabled = true` in `config.toml`.

The 2026-10-20 live schema is not here. It is a reference snapshot at [`../baseline/20261018000000_live_baseline.sql`](../baseline/20261018000000_live_baseline.sql). Those objects already exist on project `qnhogbwnumvounwpusmc`. Do not move that file back under `migrations/`. Do not `supabase db push` it. Do not run `supabase migration repair` against production to record it.

`schema.sql` and `identity.sql` are separate hand-applied scripts and were not rewritten.

`cubefront-retention` (`41 3 * * *`, `net.http_post` to `functions/v1/retention` with a Bearer service JWT) is live and managed out of band. It is not scheduled in the snapshot. WO-16 re-adds it and reads the token from Vault. Do not paste that JWT into a migration.

Later pulls from `../db-pull.sh` add a new timestamped file here and do not rewrite the baseline or the hand-applied SQL. The pull does not write to the live migration history.
