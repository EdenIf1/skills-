# Live schema pull (WO-10)

The live Supabase project is ahead of the SQL in git. This directory can receive that schema. It does not contain a dump yet. Do not invent `CREATE` statements for objects that have not been read from the database.

`schema.sql` and `identity.sql` stay as the hand-applied scripts. A pull or a reviewed export adds a **new** file under `migrations/` and does not rewrite those two files. Another change is editing the hand-applied SQL for the economy; leave those files alone here.

## Credentials

Two values are required. Neither is in this repo, and neither belongs in `config.toml`, this file, or a migration.

| Name | What it is | Local | GitHub Actions |
|---|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Account access token from https://supabase.com/dashboard/account/tokens | `export SUPABASE_ACCESS_TOKEN='...'` in the shell that runs the script. Do not write it into a file in the repo. | Repository secret `SUPABASE_ACCESS_TOKEN` (Settings → Secrets and variables → Actions) |
| `SUPABASE_DB_PASSWORD` | Database password. Dashboard → project **blockfire** → Project Settings → Database | `export SUPABASE_DB_PASSWORD='...'` in that same shell | Repository secret `SUPABASE_DB_PASSWORD` |

The public project ref is `qnhogbwnumvounwpusmc`. The game already calls `https://qnhogbwnumvounwpusmc.supabase.co` (`CLOUD_CFG` in `blockfire/game/cabin-fever.html`). Override it with `SUPABASE_PROJECT_REF` only if that project changes. The anon key in the client is not an input to this pull. Do not copy it into a migration.

`db pull` needs Docker. It starts a shadow Postgres to diff the remote schema. CLI 2.121.0 matches `config.toml` (generated from `supabase init` of that version). `[db].major_version` is 17, which is that template's default. It was not confirmed with `SHOW server_version` on the live database. If the pull stops on a version mismatch, set `major_version` to the live major version and run again.

## Run it

From the repo root, after the two exports above:

```bash
bash blockfire/supabase/db-pull.sh
```

Check the scanner without credentials or Docker:

```bash
bash blockfire/supabase/db-pull.sh --self-test
```

Or run the workflow **Supabase schema pull** from the Actions tab (`workflow_dispatch` only, so a missing secret does not fail other CI). It checks out the branch you select and writes `blockfire/supabase/migrations/<timestamp>_remote_schema.sql`.

- Leave **mark applied** off until someone has read the SQL. Turning it on inserts one row into the live `supabase_migrations.schema_migrations` table. It does not change game tables.
- Leave **commit** off to download the SQL as a workflow artifact and commit it yourself. Turning it on pushes the new `migrations/*.sql` file to the branch the workflow ran on.

The script answers **no** to "Update remote migration history table?" unless `SUPABASE_DB_PULL_MARK_APPLIED=1`. It passes the database password only through the environment, which the CLI reads as `SUPABASE_DB_PASSWORD`. It does not put the password on the command line.

If `db pull` exits without writing a file, the script falls back to `supabase db dump --linked --schema public` and saves that as a new migration. That dump is schema only. It skips managed schemas such as `auth` and `storage`. A successful `db pull` (pg-delta is on in `config.toml`) is the one that also keeps custom triggers and RLS on those managed schemas.

After a file appears, read it before `supabase db push`. The first pull is a baseline of objects that already exist on the live project. Pushing that baseline back would try to create them again. Recording it as applied (the workflow checkbox, or `supabase migration repair --status applied <version>`) is what tells later pushes to skip it.

Do not run `supabase config push`, `supabase db push`, or plain `supabase pull` from this tree. Plain `supabase pull` also downloads Edge Function source and can overwrite `functions/`. The auth section of `config.toml` is the CLI template, not a copy of the live Auth settings.

The script refuses to leave a migration in place when the file contains the database password, the access token, a `postgres://` URL with a password, an `sbp_` token, an `sb_secret_` key, a JWT, a private key, or a quoted hex string of 64 or more characters. It moves that file to `*.rejected` (gitignored) and exits. Table rows are not dumped, so `app_secret` values and the admin code hash stay out unless someone stored them as a column default.

## What git already has

`schema.sql` and `identity.sql` define these. The client does not use the Supabase JavaScript SDK. Calls were found by searching `blockfire/` for `/rest/v1/` and `/functions/v1/`.

Tables: `players`, `app_config`, `support_messages`, `client_errors`, `admins`, `admin_claim`, `device_keys`, `heartbeat`, `rooms`, `invites`, `bans`, `mp_tickets`, `app_secret`.

Functions: `players_keep_name`, `players_force_name` (no trigger attaches it), `support_rate_limit`, `client_errors_guard`, `is_admin`, `app_config_guard`, `rooms_touch`, `room_upsert`, `room_remove`, `invite_send`, `room_upsert2`, `keepalive`, `is_banned`, `my_ban`, `mp_ticket`, `mp_check`, `report_player`, `admin_ban`, `admin_unban`, `admin_bans`.

Edge functions on disk: `guest`, `signup`, `claim`, `device`, `delete-account`, `admin-claim`, `retention`.

There is no storage-bucket SQL and no schedule SQL in git.

## Called by the client or by `retention`, and not defined in that SQL

These names are real call sites. Their columns, grants, triggers, and policies are not in git. A later migration has to come from the live database.

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
| `push` | Edge Function | `pushEnable` | GET returns `{key}`. POST `{op:'test'}`. No `functions/push` directory |
| `economy_flags` | table | `functions/retention` | Deleted where column `at` is older than 90 days. No other column is named in git |

`referral_*` in the client is only `referral_claim` and `referral_rewards`. Other `referral_*` objects may exist on the live project. They are not listed here because this tree does not contain them.

RPCs the client calls that **are** in git: `is_admin`, `admin_bans`, `admin_ban`, `admin_unban`, `invite_send`, `mp_ticket`, `mp_check`, `room_upsert2`, `room_upsert` (404 fallback), `room_remove`, `report_player`.

Tables the client reads or writes that **are** in git: `players`, `app_config`, `client_errors`, `support_messages`, `invites`, `rooms`. `blockfire/build/assets/legal/support.html` inserts into `support_messages`.

`retention` also deletes old rows from `support_messages`, `client_errors`, `mp_tickets`, and `invites`. Those four tables are in git. `economy_flags` is the one that is not.

`my_ban` and `keepalive` are defined in SQL. The game file does not call them.
