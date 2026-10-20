Checked into this repo from the 2026-10-20 export. The reference snapshot is `baseline/20261018000000_live_baseline.sql`, outside `migrations/`, so `supabase db push` and a preview branch do not apply it. It is the export plus the live column grants, sequence grants, `backup.snap` revoke, and `invites` `MAINTAIN` grants. The `cubefront-retention` schedule is not in the file. The `push` source is `functions/push/index.ts`. The other seven live functions were diffed against `functions/`. Only `signup` and `claim` differ: live minimum password length is 6, and the repo copies still require 8.

# WO-10 live schema inventory: Cubefront / Blockfire

- **Project:** `blockfire`, ref `qnhogbwnumvounwpusmc`, eu-central-1, Postgres 17. This is the only project in the Supabase account. It matches the URL in `blockfire/game/cabin-fever.html` @ c13898e.
- **Exported:** 2026-10-20, read-only. Only catalog SELECTs and `pg_get_*` were used, plus list/get MCP tools. No writes, migrations or deploys.
- **Compared against:** `blockfire/supabase/schema.sql`, `identity.sql` and `functions/*` on `blockfire-app` @ 3c5c746. Matching is by object name, using a `CREATE ... <name>` regex.
- **Files:** `baseline/20261018000000_live_baseline.sql` (reference snapshot, not a migration; ordered as extensions, schema, sequences, tables, FKs, indexes, functions, triggers, RLS, policies, grants, then the two cron jobs that do not carry a token), `functions/<slug>/index.ts` (8), `advisors.md`. The diff used `schema.sql`, `identity.sql`, and `functions/`.

## Named objects (architect + parent request)

| object | live | in repo | notes |
|---|---|---|---|
| server_now | yes (function) | NO | invoker; search_path=""; exec: anon,authenticated,service_role |
| referral_claim | yes (function) | NO | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| referral_rewards | yes (function) | NO | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| referrals | yes (table) | NO | RLS on |
| friends_list | yes (function) | NO | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| friend_request | yes (function) | NO | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| friend_respond | yes (function) | NO | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| friend_remove | yes (function) | NO | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| friends | yes (table) | NO | RLS on |
| presence_ping | yes (function) | NO | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| presence | yes (table) | NO | RLS on |
| ranked_leaderboard | yes (function) | NO | SECURITY DEFINER; search_path=""; exec: anon,authenticated,service_role |
| push_subs | yes (table) | NO | RLS on |
| economy_flags | yes (table) | NO | RLS on |

All of them exist live and **none** of them are in the repo. `referral_*` live = `referral_claim` + `referral_rewards` only (plus the `referrals` table and `referrals_id_seq`).

The `push_subs` and `economy_flags` coverage in `baseline/20261018000000_live_baseline.sql`:
- **`push_subs`:** table, `push_subs_user` index, FK, RLS on, policies `push own select/insert/update/delete` (authenticated, `auth.uid() = user_id`), and grants. The grants include ALL to anon and authenticated, guarded only by RLS. The table has no triggers. Push delivery goes through the `invites_push` trigger on `invites` -> `push_call()` -> the `push` edge function, plus the hourly `push-hourly` cron.
- **`economy_flags`:** table, `economy_flags_id_seq`, RLS on with no policies (deny-all to the API), and grants to service_role only. The table has no triggers of its own. Rows are written by `players_econ_guard()` (trigger on `players`) via `econ_clamp()`.
- **`push` edge function:** in `functions/push/index.ts`. It has no literal secrets, because it uses `Deno.env` and reads VAPID keys and the cron token from `public.push_keys` at runtime.

## Counts

| type | live | missing from repo |
|---|---|---|
| table | 20 | 7 |
| function | 38 | 18 |
| trigger | 9 | 4 |
| policy | 22 | 8 |
| index | 9 | 3 |
| sequence | 6 | 2 |
| cron job | 3 | 3 |
| foreign key | 15 | (not compared) |
| view / matview | 0 | 0 |
| enum / composite / domain type | 0 | 0 |
| extension | 7 (http, pg_net, pg_stat_statements, pgcrypto, uuid-ossp, pg_cron, supabase_vault) + plpgsql | not declared in repo |
| edge function | 8 | 1 (`push`) |
| realtime publication app tables | 0 | - |

Indexes listed are non-constraint indexes only; PK/UNIQUE/CHECK constraints are inline in the tables. Of the sequences, 4 are identity-backed (n/a) and 2 are serial-style. The one trigger marked 'mentioned only' (`players_force_name`) is named in a repo comment but is not created there.

## Full object list

| type | object | in repo | notes |
|---|---|---|---|
| table | `backup.snap` | NO | RLS OFF |
| table | `public.admin_claim` | yes | RLS on (forced) |
| table | `public.admins` | yes | RLS on (forced) |
| table | `public.app_config` | yes | RLS on (forced) |
| table | `public.app_secret` | yes | RLS on |
| table | `public.bans` | yes | RLS on |
| table | `public.client_errors` | yes | RLS on (forced) |
| table | `public.device_keys` | yes | RLS on (forced) |
| table | `public.economy_flags` | NO | RLS on |
| table | `public.friends` | NO | RLS on |
| table | `public.heartbeat` | yes | RLS on (forced) |
| table | `public.invites` | yes | RLS on (forced) |
| table | `public.mp_tickets` | yes | RLS on |
| table | `public.players` | yes | RLS on (forced) |
| table | `public.presence` | NO | RLS on |
| table | `public.push_keys` | NO | RLS on |
| table | `public.push_subs` | NO | RLS on |
| table | `public.referrals` | NO | RLS on |
| table | `public.rooms` | yes | RLS on (forced) |
| table | `public.support_messages` | yes | RLS on (forced) |
| function | `backup.take()` | NO | SECURITY DEFINER; search_path=""; exec: postgres only |
| function | `public.admin_ban(p_uid uuid, p_days integer, p_reason text)` | yes | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| function | `public.admin_bans()` | yes | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| function | `public.admin_overview()` | NO | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| function | `public.admin_unban(p_uid uuid)` | yes | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| function | `public.app_config_guard()` | yes | SECURITY DEFINER; search_path=""; exec: service_role |
| function | `public.client_errors_guard()` | yes | SECURITY DEFINER; search_path=""; exec: service_role |
| function | `public.econ_clamp(o jsonb, n jsonb, hrs numeric, is_ins boolean, OUT data jsonb, OUT flags jsonb)` | NO | invoker; search_path=""; exec: PUBLIC,anon,authenticated,service_role |
| function | `public.friend_remove(p_name text)` | NO | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| function | `public.friend_request(p_name text)` | NO | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| function | `public.friend_respond(p_name text, p_accept boolean)` | NO | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| function | `public.friends_list()` | NO | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| function | `public.invite_send(p_to text, p_code text, p_mode text)` | yes | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| function | `public.invites_push()` | NO | SECURITY DEFINER; search_path=""; exec: service_role |
| function | `public.is_admin()` | yes | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| function | `public.is_banned(p uuid)` | yes | SECURITY DEFINER; search_path=""; exec: service_role |
| function | `public.keepalive()` | yes | SECURITY DEFINER; search_path=""; exec: anon,service_role |
| function | `public.lb_level(p_xp numeric)` | NO | invoker; search_path=""; exec: PUBLIC,anon,authenticated,service_role |
| function | `public.mp_check(p_token text, p_room text)` | yes | SECURITY DEFINER; search_path=""; exec: anon,authenticated,service_role |
| function | `public.mp_ticket(p_room text)` | yes | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| function | `public.my_ban()` | yes | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| function | `public.players_econ_guard()` | NO | SECURITY DEFINER; search_path=""; exec: service_role |
| function | `public.players_force_name()` | yes | SECURITY DEFINER; search_path=""; exec: service_role |
| function | `public.players_keep_name()` | yes | invoker; search_path=""; exec: service_role |
| function | `public.presence_ping(p_room text)` | NO | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| function | `public.public_leaderboard(p_sort text, p_limit integer)` | NO | SECURITY DEFINER; search_path=""; exec: anon,authenticated,service_role |
| function | `public.push_call(p_body jsonb)` | NO | SECURITY DEFINER; search_path=""; exec: service_role |
| function | `public.ranked_leaderboard(p_limit integer)` | NO | SECURITY DEFINER; search_path=""; exec: anon,authenticated,service_role |
| function | `public.referral_claim(p_ref text)` | NO | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| function | `public.referral_rewards()` | NO | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| function | `public.report_player(p_token text, p_room text, p_why text)` | yes | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| function | `public.room_remove()` | yes | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| function | `public.room_upsert(p_code text, p_host_name text, p_mode text, p_map text, p_players integer, p_max integer, p_locked boolean, p_state text, p_proto integer)` | yes | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| function | `public.room_upsert2(p_code text, p_host_name text, p_mode text, p_map text, p_players integer, p_max integer, p_locked boolean, p_state text, p_proto integer, p_progress integer)` | yes | SECURITY DEFINER; search_path=""; exec: authenticated,service_role |
| function | `public.rooms_touch()` | yes | invoker; search_path=""; exec: service_role |
| function | `public.server_now()` | NO | invoker; search_path=""; exec: anon,authenticated,service_role |
| function | `public.signup_guard()` | NO | SECURITY DEFINER; search_path=""; exec: service_role |
| function | `public.support_rate_limit()` | yes | SECURITY DEFINER; search_path=""; exec: service_role |
| trigger | `signup_guard ON auth.users` | NO |  |
| trigger | `app_config_guard ON public.app_config` | yes |  |
| trigger | `client_errors_guard ON public.client_errors` | yes |  |
| trigger | `invites_push ON public.invites` | NO |  |
| trigger | `players_econ_guard ON public.players` | NO |  |
| trigger | `players_force_name ON public.players` | NO (mentioned only) |  |
| trigger | `players_keep_name ON public.players` | yes |  |
| trigger | `rooms_touch ON public.rooms` | yes |  |
| trigger | `support_rate_limit ON public.support_messages` | yes |  |
| policy | `"admin changes config" ON public.app_config` | yes |  |
| policy | `"anyone reads config" ON public.app_config` | yes |  |
| policy | `"admin clears errors" ON public.client_errors` | yes |  |
| policy | `"admin reads errors" ON public.client_errors` | yes |  |
| policy | `"anyone can report an error" ON public.client_errors` | yes |  |
| policy | `"read my invites" ON public.invites` | yes |  |
| policy | `"remove my invites" ON public.invites` | yes |  |
| policy | `"players insert own row" ON public.players` | yes |  |
| policy | `"players read own row" ON public.players` | yes |  |
| policy | `"players update own row" ON public.players` | yes |  |
| policy | `"push own delete" ON public.push_subs` | NO |  |
| policy | `"push own insert" ON public.push_subs` | NO |  |
| policy | `"push own select" ON public.push_subs` | NO |  |
| policy | `"push own update" ON public.push_subs` | NO |  |
| policy | `"anyone sees live rooms" ON public.rooms` | yes |  |
| policy | `"host lists own room" ON public.rooms` | NO |  |
| policy | `"host removes own room" ON public.rooms` | NO |  |
| policy | `"host sees own room" ON public.rooms` | NO |  |
| policy | `"host updates own room" ON public.rooms` | NO |  |
| policy | `"admin clears messages" ON public.support_messages` | yes |  |
| policy | `"admin reads messages" ON public.support_messages` | yes |  |
| policy | `"anyone can send a message" ON public.support_messages` | yes |  |
| index | `device_keys_user on public.device_keys` | yes |  |
| index | `friends_friend_idx on public.friends` | NO |  |
| index | `invites_from_uid on public.invites` | yes |  |
| index | `invites_to_uid on public.invites` | yes |  |
| index | `mp_tickets_user on public.mp_tickets` | yes |  |
| index | `players_name_key on public.players` | yes |  |
| index | `push_subs_user on public.push_subs` | NO |  |
| index | `referrals_referrer on public.referrals` | NO |  |
| index | `rooms_fresh on public.rooms` | yes |  |
| sequence | `public.client_errors_id_seq` | n/a (identity) | owned by client_errors.id |
| sequence | `public.device_keys_id_seq` | n/a (identity) | owned by device_keys.id |
| sequence | `public.economy_flags_id_seq` | NO | owned by economy_flags.id |
| sequence | `public.invites_id_seq` | n/a (identity) | owned by invites.id |
| sequence | `public.referrals_id_seq` | NO | owned by referrals.id |
| sequence | `public.support_messages_id_seq` | n/a (identity) | owned by support_messages.id |
| cron job | `cubefront-nightly-backup` | NO | `23 3 * * *`. Scheduled in the baseline (`select backup.take()`). |
| cron job | `cubefront-retention` | NO | Live job `41 3 * * *`: `net.http_post` to `functions/v1/retention` with a Bearer service JWT. Not in the baseline. Managed out of band. WO-16 re-adds it and reads the token from Vault. |
| cron job | `push-hourly` | NO | `7 * * * *`. Scheduled in the baseline (`select public.push_call(...)`). |

## Edge functions (live vs repo)

| slug | live ver | verify_jwt | repo | diff |
|---|---|---|---|---|
| signup | 4 | true | yes | **drift:** live password min is 6 chars, repo min is 8 |
| claim | 3 | true | yes | **drift:** same thing, live min is 6 and repo min is 8 |
| guest | 2 | true | yes | identical |
| delete-account | 1 | true | yes | identical |
| admin-claim | 2 | true | yes | identical |
| device | 3 | true | yes | identical |
| retention | 3 | true | yes | identical |
| push | 2 | **false** | **NO** | missing from repo. It authenticates itself with the user JWT or the `x-cron` token from `public.push_keys` |

## Other drift / notes
- **Migration history:** `supabase_migrations` has 17 entries (20261011052111 .. 20261017132626). Friends, referrals, presence, push, the economy guard, ranked leaderboard, server_now, backup and cron are not in tracked migrations.
- **Repo-only objects:** none. Every table, function, trigger and policy in the repo SQL exists live.
- **`backup.take()` + `backup.snap`:** cron `cubefront-nightly-backup` (03:23 UTC) snapshots tables, including `auth.users.encrypted_password` (password hashes), into `backup.snap`. RLS is OFF there, but schema `backup` grants USAGE only to `postgres`, so it is not API-reachable. Someone should decide whether hashes belong in that snapshot.
- **Table grants:** `anon` and `authenticated` hold ALL on `app_secret`, `bans`, `mp_tickets` and `push_subs`. These are protected by RLS only: the first three are deny-all (no policies), and `push_subs` has own-row policies for authenticated only. A defensive REVOKE is recommended (SQL-hardening lane).
- **Column grants** (eight statements, immediately after the table-level `REVOKE ALL` / `GRANT` block, because that `REVOKE ALL` clears column ACLs):
  - `authenticated` may `UPDATE` `app_config.value` only.
  - `anon` and `authenticated` may `INSERT` `client_errors` (`app_version`, `device`, `message`, `stack`, `where_`) only. There is no table-level `INSERT` for those roles.
  - `authenticated` may `UPDATE` `players` (`data`, `id`, `name`, `updated_at`) only. Table-level privileges for that role are `INSERT` and `SELECT`.
  - `anon` and `authenticated` may `SELECT` `rooms` (`code`, `host_name`, `locked`, `map`, `max`, `mode`, `players`, `progress`, `proto`, `state`, `updated_at`) only. `host_uid` is not included. There is no table-level `SELECT` for those roles.
  - `anon` and `authenticated` may `INSERT` `support_messages` (`app_version`, `contact`, `device`, `message`, `player_name`, `topic`) only. There is no table-level `INSERT` for those roles, so `reported_uid` and `user_id` are not client-writable through the grant.
- **`public.invites`:** Postgres 17 `MAINTAIN` is granted to `anon`. `authenticated` has `SELECT`, `DELETE`, and `MAINTAIN`. `service_role` has `ALL`.
- **Sequences:** `client_errors_id_seq`, `device_keys_id_seq`, `economy_flags_id_seq`, `invites_id_seq`, `referrals_id_seq`, and `support_messages_id_seq` each have `REVOKE ALL` from `PUBLIC`, `anon`, `authenticated`, and `service_role`, then `GRANT ALL` to `anon`, `authenticated`, and `service_role`.
- **`backup.snap`:** `REVOKE ALL` from `PUBLIC`, `anon`, `authenticated`, and `service_role`. Live privileges are the postgres owner only. RLS stays off; see `advisors.md`.
- **Secret-bearing tables (values NOT read or exported, DDL only):** `public.app_secret` (used by `mp_check`), `public.push_keys` (VAPID private key + cron_token), and `vault.*`.
- **Realtime:** `supabase_realtime` has no app tables.
- **`cubefront-retention`:** the live job exists (`41 3 * * *`). It calls `net.http_post` to `functions/v1/retention` with a Bearer service JWT. It is managed out of band and is not scheduled in the baseline, so a replay cannot install a placeholder token and 401 every night. WO-16 re-adds the job and reads the token from Vault.

## Redactions
- The retention Bearer token is not in this repository. The baseline does not schedule `cubefront-retention`.
- Function bodies have no literal keys or tokens (`push_call` reads its token from `push_keys`), and the edge functions take credentials from `Deno.env`. The public project URL in `push_call` was kept (see `advisors.md`, WO-16). A scan of this snapshot found no JWT, `sbp_` token, private key, or database URL with a password.
