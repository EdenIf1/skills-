# Supabase backend (project `blockfire`, region eu-central-1)

Already applied to the live project. Kept here so the backend can be rebuilt or reviewed.

- `schema.sql` – all tables, row-level security, triggers (apply in order on a fresh project)
- `migrations/20261018000000_live_baseline.sql` – full live schema from the 2026-10-20 export. The `cubefront-retention` cron token is `<REDACTED_JWT>` and must come from Vault or another secret
- `inventory.md` – every live object, and whether `schema.sql` / `identity.sql` already had it
- `functions/` – Edge Functions (deploy with `supabase functions deploy <name>`)
  - `guest` – makes a guest account with a temporary name
  - `claim` – a guest picks a username and password (same account, same progress)
  - `signup` – a new account from username + password (confirmed, no email needed)
  - `delete-account` – deletes the caller's account and progress (App Store rule 5.1.1)
  - `push` – web push. `[functions.push] verify_jwt = false` in `config.toml`, matching live. The function checks the user JWT or the `x-cron` token itself

Security model: players can only read and write their own `players` row; `app_config` is read-only for everyone;
`support_messages` and `client_errors` are insert-only (nobody can read them except from the dashboard).

`schema.sql` and `identity.sql` are not the whole live database. Friends, referrals, presence, the ranked board, `server_now`, `push_subs`, and `economy_flags` are in the baseline migration. `PULL.md` explains the redacted cron token and how to pull again. Do not commit `SUPABASE_ACCESS_TOKEN` or `SUPABASE_DB_PASSWORD`.
