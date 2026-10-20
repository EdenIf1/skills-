# Supabase backend (project `blockfire`, region eu-central-1)

Already applied to the live project. Kept here so the backend can be rebuilt or reviewed.

- `schema.sql` – all tables, row-level security, triggers (apply in order on a fresh project)
- `functions/` – Edge Functions (deploy with `supabase functions deploy <name>`; all use JWT verification)
  - `guest` – makes a guest account with a temporary name
  - `claim` – a guest picks a username and password (same account, same progress)
  - `signup` – a new account from username + password (confirmed, no email needed)
  - `delete-account` – deletes the caller's account and progress (App Store rule 5.1.1)

Security model: players can only read and write their own `players` row; `app_config` is read-only for everyone;
`support_messages` and `client_errors` are insert-only (nobody can read them except from the dashboard).

`schema.sql` and `identity.sql` are not the whole live database. Friends, referrals, presence, the ranked board, `server_now`, `push_subs`, and `economy_flags` are called by the game or by `retention` and are not in those files. `PULL.md` lists every call and how to pull the live schema into `migrations/` once `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` are set. Do not commit those values.
