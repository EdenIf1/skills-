# Live schema pull (WO-10)

The 2026-10-20 read-only export is checked in as [`baseline/20261018000000_live_baseline.sql`](baseline/20261018000000_live_baseline.sql). It is a reference snapshot, not a migration. It sits outside `migrations/` so `supabase db push` and a preview branch do not apply it. Postgres 17. Object-by-object notes are in [`inventory.md`](inventory.md). Advisor output is in [`advisors.md`](advisors.md).

`schema.sql` and `identity.sql` stay as the hand-applied scripts. This baseline does not rewrite them. A later pull adds another timestamped file under `migrations/`. Do not move the snapshot back into `migrations/`. Do not run `supabase migration repair` to record it on the live project.

The live job `cubefront-retention` (`41 3 * * *`, `net.http_post` to `functions/v1/retention` with a Bearer service JWT) is managed out of band. The snapshot does not schedule it. WO-16 re-adds it and reads the token from Vault. Do not commit that JWT.

Do not `supabase db push` the baseline onto the live project. The objects are already there.

## Credentials

Two values are required. Neither is in this repo, and neither belongs in `config.toml`, this file, or a migration.

| Name | What it is | Local | GitHub Actions |
|---|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Account access token from https://supabase.com/dashboard/account/tokens | `export SUPABASE_ACCESS_TOKEN='...'` in the shell that runs the script. Do not write it into a file in the repo. | Repository secret `SUPABASE_ACCESS_TOKEN` (Settings → Secrets and variables → Actions) |
| `SUPABASE_DB_PASSWORD` | Database password. Dashboard → project **blockfire** → Project Settings → Database | `export SUPABASE_DB_PASSWORD='...'` in that same shell | Repository secret `SUPABASE_DB_PASSWORD` |

The public project ref is `qnhogbwnumvounwpusmc`. The game already calls `https://qnhogbwnumvounwpusmc.supabase.co` (`CLOUD_CFG` in `blockfire/game/cabin-fever.html`). Override it with `SUPABASE_PROJECT_REF` only if that project changes. The anon key in the client is not an input to this pull. Do not copy it into a migration.

`db pull` needs Docker. It starts a shadow Postgres to diff the remote schema. CLI 2.121.0 matches `config.toml`. `[db].major_version` is 17, which the export confirmed.

`config.toml` sets `site_url` to `https://edenif1.github.io/skills-/`, allows redirects to `https://localhost` (the iOS app) and `https://edenif1.github.io`, and sets `minimum_password_length` to 6, which is the live value. The hardening change raises that minimum to 8. Do not run `supabase config push` without review. The rest of the file is local CLI config.

## Run it

From the repo root, after the two exports above:

```bash
bash blockfire/supabase/db-pull.sh
```

Check the scanner without credentials or Docker:

```bash
bash blockfire/supabase/db-pull.sh --self-test
```

Or run the workflow **Supabase schema pull** from the Actions tab (`workflow_dispatch` only, so a missing secret does not fail other CI). It checks out the branch you select, writes `blockfire/supabase/migrations/<timestamp>_remote_schema.sql`, and uploads that file as an artifact. It does not commit, open a pull request, or write to the live migration history. Download the artifact and commit it yourself after review.

The script always answers **no** to "Update remote migration history table?". It passes the database password only through the environment, which the CLI reads as `SUPABASE_DB_PASSWORD`. It does not put the password on the command line.

If `db pull` exits without writing a file, the script falls back to `supabase db dump --linked --schema public` and saves that as a new migration. That dump is schema only. It skips managed schemas such as `auth` and `storage`. A successful `db pull` (pg-delta is on in `config.toml`) is the one that also keeps custom triggers and RLS on those managed schemas.

After a file appears, read it before `supabase db push`. The checked-in baseline is objects that already exist on the live project, stored outside `migrations/` so a push does not try to create them again. Do not run `supabase migration repair` to mark it applied.

Do not run `supabase config push` without review, and do not run `supabase db push` or plain `supabase pull` from this tree. Plain `supabase pull` also downloads Edge Function source and can overwrite `functions/`. `config.toml` matches live for `site_url`, the redirect allow-list, and the password minimum of 6. The other sections are local CLI config.

The script refuses to leave a migration in place when the file contains the database password, the access token, a `postgres://` URL with a password, an `sbp_` token, an `sb_secret_` key, a JWT, a private key, or a quoted hex string of 64 or more characters. It moves that file to `*.rejected` (gitignored) and exits. Table rows are not dumped, so `app_secret` values and the admin code hash stay out unless someone stored them as a column default.

## What `schema.sql` and `identity.sql` already had

The client does not use the Supabase JavaScript SDK. Calls were found by searching `blockfire/` for `/rest/v1/` and `/functions/v1/`. These objects were already in the hand-applied SQL, and the baseline includes them too.

Tables: `players`, `app_config`, `support_messages`, `client_errors`, `admins`, `admin_claim`, `device_keys`, `heartbeat`, `rooms`, `invites`, `bans`, `mp_tickets`, `app_secret`.

Functions: `players_keep_name`, `players_force_name` (the hand-applied SQL names it and does not attach a trigger; the baseline does, as `players_force_name` on `public.players`), `support_rate_limit`, `client_errors_guard`, `is_admin`, `app_config_guard`, `rooms_touch`, `room_upsert`, `room_remove`, `invite_send`, `room_upsert2`, `keepalive`, `is_banned`, `my_ban`, `mp_ticket`, `mp_check`, `report_player`, `admin_ban`, `admin_unban`, `admin_bans`.

The baseline also schedules `cubefront-nightly-backup` and `push-hourly`. `cubefront-retention` is live and is not in the snapshot. The baseline does not include storage-bucket SQL. The export skipped Supabase-managed schemas.

## Called by the client or by `retention`, absent from the hand-applied SQL

These names are real call sites. They are not in `schema.sql` or `identity.sql`. They are in the baseline. [`inventory.md`](inventory.md) is the full live list, including tables the client never names (`friends`, `presence`, `referrals`, `push_keys`, `backup.snap`).

| Name | Kind | Where it is called | What the caller sends or expects |
|---|---|---|---|
| `server_now` | RPC | `cabin-fever.html` `srvTime` | POST `{}`, no user token. Expects a string timestamp |
| `referral_claim` | RPC | `refTick` | `{p_ref}`. String; `ok` means accepted |
| `referral_rewards` | RPC | `refTick` | `{}`. Object `{joined, friends}` |
| `friends_list` | RPC | `frLoad` | `{}`. Array of `{name, status, level, room, online}` |
| `friend_request` | RPC | `frAdd` via `frAct` | `{p_name}`. `sent`, `accepted`, `not_found`, `self`, `banned`, `full`, `exists`, `slow_down` |
| `friend_respond` | RPC | accept, decline, block | `{p_name, p_accept}`. `accepted`, `declined`, `no_request` |
| `friend_remove` | RPC | remove, block | `{p_name}`. `removed` |
| `presence_ping` | RPC | `frPing` | `{p_room}` or null. Body ignored |
| `ranked_leaderboard` | RPC | leaderboard load | `{p_limit: 50}`. Array of `{pos, name, rp, games, me}` |
| `push_subs` | table | `pushEnable`, `pushDisable` | Upsert on `endpoint`. Body fields: `endpoint`, `user_id`, `p256dh`, `auth`, `tz_offset` |
| `push` | Edge Function | `pushEnable` | GET returns `{key}`. POST `{op:'test'}`. Source is `functions/push`. Live gateway has `verify_jwt` off |
| `economy_flags` | table | `functions/retention` | Deleted where column `at` is older than 90 days. The baseline has the rest of the table |

Live `referral_*` is `referral_claim`, `referral_rewards`, the `referrals` table, and `referrals_id_seq`. Nothing else with that prefix was in the export.

RPCs the client calls that **are** in git: `is_admin`, `admin_bans`, `admin_ban`, `admin_unban`, `invite_send`, `mp_ticket`, `mp_check`, `room_upsert2`, `room_upsert` (404 fallback), `room_remove`, `report_player`.

Tables the client reads or writes that **are** in git: `players`, `app_config`, `client_errors`, `support_messages`, `invites`, `rooms`. `blockfire/build/assets/legal/support.html` inserts into `support_messages`.

`retention` also deletes old rows from `support_messages`, `client_errors`, `mp_tickets`, and `invites`. Those four tables are in git. `economy_flags` is the one that is not.

`my_ban` and `keepalive` are defined in SQL. The game file does not call them.
