# Backend

Cubefront's backend is **Supabase** (Postgres, Auth, Row Level Security, Edge Functions). `blockfire/supabase/README.md` names the live project `blockfire` in region `eu-central-1`. The browser calls that project with the URL and anon key hardcoded as `CLOUD_CFG` in `blockfire/game/cabin-fever.html`. Those values are not repeated here.

There is no storage-bucket SQL, no `supabase/config.toml`, and no `supabase/migrations/` history. Schema lives in two files that are meant to be applied by hand:

1. [`blockfire/supabase/schema.sql`](../blockfire/supabase/schema.sql)
2. [`blockfire/supabase/identity.sql`](../blockfire/supabase/identity.sql) — the header says it only adds and replaces functions; it does not drop objects.

`schema.sql` is written for a **fresh** project. The early `create table` statements are not `if not exists`, so running the file twice fails. Later sections (invites, `rooms.progress`, `peer_server`) are written so they can be applied again.

## What you can rebuild from git

Apply the two SQL files, deploy the seven edge functions, and insert the one-time admin code hash yourself. That recreates accounts, saves, remote config, support mail, crash rows, the room list, invites, bans, and multiplayer tickets.

It does **not** recreate friends, referrals, the world ranked board, push notifications, the trusted clock RPC, the retention table the cleanup job deletes, or the daily schedules. Those are listed under [Not in git](#not-in-git).

## Tables

### `public.players`

One row per account. `id` references `auth.users(id)` and cascades on delete.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, primary key | Must equal `auth.uid()` for player writes |
| `name` | text | 2–14 chars, charset `A-Za-z0-9_ .-` |
| `data` | jsonb | Profile. Default `{}`. `pg_column_size(data) < 200000` |
| `updated_at` | text | Max 40 chars. The client stores an ISO timestamp and uses it as a version |
| `created_at` | timestamptz | Default `now()` |

Unique index `players_name_key` on `lower(replace(name, ' ', ''))`.

RLS is enabled and **forced**. `anon` has no grants. `authenticated` may select and insert, and may update `id`, `name`, `data`, `updated_at`. Policies: select, insert, and update only where `id = auth.uid()`.

Trigger `players_keep_name` calls `players_keep_name()`: a non-`service_role` user cannot change the name (spaces ignored, case ignored).

`identity.sql` also creates `players_force_name()`, which overwrites `new.name` from `auth.users.raw_app_meta_data->>'name'` unless the caller is `service_role`. **No trigger in either file attaches this function.** **TODO:** a fresh apply does not install that guard.

### `public.app_config`

Remote switches. Read-only for players; the admin may update `value`.

| Column | Type | Notes |
|---|---|---|
| `key` | text, primary key | Max 40 chars |
| `value` | jsonb | Shape depends on the key |
| `updated_at` | timestamptz | Set to `now()` by `app_config_guard` |

Seeded rows:

| Key | Seed value |
|---|---|
| `min_version` | `"1.0.0"` |
| `latest_version` | `"1.0.0"` |
| `store_url` | `""` |
| `maintenance` | `""` |
| `motd` | `""` |
| `features` | `{"building":true,"crates":true,"multiplayer":true}` |
| `peer_server` | `""` (inserted with `on conflict do nothing`) |

RLS enabled and forced. `anon` and `authenticated` may select (policy `using (true)`). `authenticated` may update `value` only when `is_admin()` is true.

`app_config_guard` rejects key changes. It checks:

- `min_version`, `latest_version`: JSON string matching `N.N.N` with each part 1–3 digits
- `motd`, `maintenance`, `store_url`: JSON string, at most 300 characters
- `features`: JSON object whose values are all booleans

A comment says the guard also checks `peer_server` (empty or `wss://host[:port]/path`). **The function body does not.** `turn` is not seeded and is not validated. The admin panel writes both. **TODO:** format checks for `peer_server` and `turn` are not in the SQL that is checked in.

### `public.support_messages`

Help form and player reports. Insert-only for players. Admin can select and delete.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint identity | |
| `created_at` | timestamptz | |
| `user_id` | uuid | Default `auth.uid()`, `on delete set null` |
| `player_name` | text | Max 20 |
| `topic` | text | `bug`, `account`, `purchase`, `idea`, `report`, `other` |
| `message` | text | 5–2000 chars |
| `contact` | text | Max 120 |
| `app_version` | text | Max 20 |
| `device` | text | Max 160 |
| `reported_uid` | uuid | Added in `identity.sql`. Set by `report_player`, not by the public insert grant |

Insert grant for `anon` and `authenticated` lists `player_name, topic, message, contact, app_version, device` only, so clients cannot set `reported_uid` on a normal insert.

Trigger `support_rate_limit`: at most 5 messages per hour for a signed-in user. Anonymous inserts share a 5-per-minute bucket (the predicate treats every anonymous row in the last minute as the same bucket).

### `public.client_errors`

Crash and error reports. Same insert-only pattern.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint identity | |
| `created_at` | timestamptz | |
| `user_id` | uuid | Default `auth.uid()`, `on delete set null` |
| `app_version` | text | Max 20 |
| `message` | text | Required, max 400 |
| `stack` | text | Max 2000 |
| `where_` | text | Max 60. The column name has a trailing underscore |
| `device` | text | Max 160 |

Trigger `client_errors_guard`: if 300 or more rows were inserted in the last minute, the new row is dropped (`return null`) instead of raising.

The game sometimes sends a stack longer than 2000 characters (`crash` path slices to 4500). The check allows 2000. **TODO:** whether those inserts fail in production is not recorded.

### `public.admins`

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid, primary key | References `auth.users` |
| `one` | boolean | Default true, **unique**, check `one` is true. Together this allows only one row |
| `created_at` | timestamptz | |

RLS enabled and forced. No policies. Grants to `anon` and `authenticated` are revoked. Players cannot read or write this table. `is_admin()` is `security definer` and reads it.

### `public.admin_claim`

| Column | Type | Notes |
|---|---|---|
| `code_hash` | text, primary key | Must match `^[0-9a-f]{64}$` (SHA-256 hex) |

RLS enabled and forced. No policies. Grants revoked from `anon` and `authenticated`. The edge function `admin-claim` reads it with the service role and deletes the hash after a successful claim.

**The hash is not in git.** You insert it yourself. The file's comment:

```sql
insert into public.admin_claim(code_hash) values ('<sha256 of your code>');
```

### `public.device_keys`

"Remember this phone." Only the edge function `device` (service role) is meant to touch it.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint identity | |
| `user_id` | uuid | References `auth.users`, cascade delete |
| `key_hash` | text | Unique, SHA-256 hex |
| `label` | text | Max 60 |
| `created_at` | timestamptz | |
| `last_used_at` | timestamptz | |

Index `device_keys_user` on `user_id`. RLS enabled and forced. No policies. Grants revoked from `anon` and `authenticated`.

### `public.heartbeat`

Single row `id = 1`, columns `at timestamptz` and `beats bigint`. RLS enabled and forced. No player policies. `keepalive()` updates it at most once a minute and returns `at`. Execute is granted to `anon` and `authenticated`.

`schema.sql` says a daily GitHub Action on the **main** branch (`.github/workflows/supabase-keepalive.yml`) calls this so a free project is not paused. **That workflow is not on `blockfire-app`.** **TODO:** the schedule and the caller are not in this branch.

### `public.rooms`

One listed room per account (`host_uid` is unique).

| Column | Type | Notes |
|---|---|---|
| `code` | text, primary key | `^[A-Z0-9]{4,8}$` |
| `host_uid` | uuid, unique | Default `auth.uid()`, references `auth.users` |
| `host_name` | text | 1–20 chars. `identity.sql` overwrites this from app metadata |
| `mode` | text | Max 24 |
| `map` | text | Max 24 |
| `players` | int | 1–24 |
| `max` | int | 2–24 |
| `locked` | boolean | Password flag only. The password is not stored |
| `state` | text | `lobby` or `playing` |
| `proto` | int | 0–1000 |
| `updated_at` | timestamptz | Set by trigger `rooms_touch` |
| `progress` | int | 0–100, added by `alter table … add column if not exists` |

Index `rooms_fresh` on `updated_at desc`.

RLS enabled and forced. Select is granted only on the public columns (`code, host_name, mode, map, players, max, locked, state, proto, updated_at`, plus `progress`). `host_uid` is not in the select grant. Policy: the row is visible only when `updated_at` is less than 60 seconds old. There is no insert/update/delete policy for players; they go through the RPCs below.

### `public.invites`

| Column | Type | Notes |
|---|---|---|
| `id` | bigint identity | |
| `to_uid` | uuid | Recipient, cascade delete |
| `from_uid` | uuid | Sender, cascade delete |
| `from_name` | text | Max 20 |
| `code` | text | Room code |
| `mode` | text | Max 40 in the original table. `identity.sql`'s `invite_send` stores at most 24 letters, spaces, and `&` |
| `created_at` | timestamptz | |

Indexes on `to_uid` and `(from_uid, created_at)`. RLS enabled and forced. `authenticated` may select and delete rows where `to_uid = auth.uid()`. Inserts go through `invite_send`.

### `public.bans` (`identity.sql`)

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid, primary key | |
| `until` | timestamptz | Null means the ban does not expire |
| `reason` | text | Max 200 |
| `created_at` | timestamptz | |

RLS is enabled. **No `force`, no policies, no `revoke`.** **TODO:** on a stock Supabase project, new tables in `public` are often granted to `anon` and `authenticated` by default privileges. With RLS on and no policy, those roles should see nothing, but the table owner still bypasses RLS because `FORCE` is absent. Confirm grants on a fresh project before relying on this.

### `public.mp_tickets` (`identity.sql`)

| Column | Type | Notes |
|---|---|---|
| `token` | text, primary key | `^[0-9a-f]{36}$` (18 random bytes, hex) |
| `user_id` | uuid | |
| `room` | text | Room code |
| `created_at` | timestamptz | |

Index on `(user_id, created_at)`. RLS enabled. **No policies, no force, no revoke.** Same TODO as `bans`. Tickets are written only inside `security definer` functions.

### `public.app_secret` (`identity.sql`)

One row (`id = 1`) with `s text`, filled with `encode(extensions.gen_random_bytes(32), 'hex')` if the row is missing. Used as the HMAC key for the private player id inside `mp_check`. RLS enabled, no policies. **TODO:** the file does not `create extension`. It calls `extensions.gen_random_bytes` and `extensions.hmac`. A project without `pgcrypto` in the `extensions` schema will fail here.

## Functions (RPC)

Defined in git:

| Function | Who may execute | What it does |
|---|---|---|
| `players_keep_name()` | Trigger only. Execute revoked from `public`, `anon`, `authenticated` | Blocks renames |
| `players_force_name()` | **No trigger attached** | Would copy the server-side name onto the row |
| `support_rate_limit()` | Trigger only | Rate-limits help messages |
| `client_errors_guard()` | Trigger only | Drops error rows when the global rate is high |
| `is_admin()` | `authenticated` | True if `auth.uid()` is the admin |
| `app_config_guard()` | Trigger only | Validates config updates |
| `rooms_touch()` | Trigger only | Stamps `updated_at` |
| `room_upsert(...)` | `authenticated` | Upsert by `host_uid`. Superseded for new clients by `room_upsert2` |
| `room_remove()` | `authenticated` | Deletes the caller's room row |
| `invite_send(p_to, p_code, p_mode)` | `authenticated` | Returns `ok`, `login`, `code`, `nouser`, `self`, `limit`, or (after identity.sql) `banned` |
| `room_upsert2(... p_progress)` | `authenticated` | Same as upsert plus progress. `identity.sql` replaces it: refuses bans, forces the host name from app metadata, strips odd characters from mode and map |
| `keepalive()` | `anon`, `authenticated` | Bumps `heartbeat` |
| `is_banned(p uuid)` | Execute revoked from `public`, `anon`, `authenticated` | Internal |
| `my_ban()` | `authenticated` | `{banned:false}` or `{banned:true, until}` |
| `mp_ticket(p_room)` | `authenticated` | Returns a token, `banned`, or null. At most 120 an hour |
| `mp_check(p_token, p_room)` | `anon`, `authenticated` | `{name, pid, gm, banned}` or null. Ticket must be under 12 hours old and for this room. `pid` is 20 hex chars of HMAC-SHA256 of the user id |
| `report_player(p_token, p_room, p_why)` | `authenticated` | Inserts a `support_messages` row with `reported_uid`. Returns `ok`, `login`, `unknown`, `self` |
| `admin_ban(p_uid, p_days, p_reason)` | `authenticated`, and `is_admin()` must be true | `p_days <= 0` means no `until` (does not expire). Cannot ban the admin. Returns `ok`, `denied`, `no` |
| `admin_unban(p_uid)` | `authenticated` + admin | Sets `until = now()` |
| `admin_bans()` | `authenticated` + admin | Up to 200 rows: `user_id, name, until, reason, created_at` |

`identity.sql` runs inside a transaction. It also copies `name` and `guest` from `raw_user_meta_data` into `raw_app_meta_data` for users that do not already have `name` there. The comment says players can edit their own `user_metadata`, so the trusted copy is app metadata.

### Called by the game, not defined in git

The client posts to these RPCs. None of them appear in `schema.sql` or `identity.sql`:

| RPC | Body the client sends | What the client expects back |
|---|---|---|
| `server_now` | `{}` (no user token required) | A string timestamp |
| `referral_claim` | `{p_ref}` | A string; `ok` means the claim was accepted |
| `referral_rewards` | `{}` | Object `{joined, friends}` where `friends` is an array of names |
| `friends_list` | `{}` | Array of `{name, status, level, room, online}`. `status` is `incoming`, `outgoing`, or a friend |
| `friend_request` | `{p_name}` | String: `sent`, `accepted`, `not_found`, `self`, `banned`, `full`, `exists`, `slow_down` |
| `friend_respond` | `{p_name, p_accept}` | `accepted`, `declined`, or `no_request` |
| `friend_remove` | `{p_name}` | `removed` |
| `presence_ping` | `{p_room}` | The client ignores the body |
| `ranked_leaderboard` | `{p_limit: 50}` | Array of `{pos, name, rp, games, me}` |

**TODO:** friends, presence, referrals, ranked leaderboard, and `server_now` cannot be rebuilt from this repo. If they exist on the live project, they were applied outside git.

The client also reads and writes `public.push_subs` (`endpoint`, `user_id`, `p256dh`, `auth`, `tz_offset`) and calls edge function `push` (GET for a VAPID public key `{key}`, POST `{op:'test'}`). **No `push` function and no `push_subs` table are in git.**

`retention` deletes from `public.economy_flags` where column `at` is older than 90 days. **`economy_flags` is not created in either SQL file.**

`my_ban` is defined, and the game file does not call it (search shows no `rpc/my_ban`). Bans are enforced inside `room_upsert2`, `invite_send`, and `mp_ticket`.

## Edge functions

All under `blockfire/supabase/functions/<name>/index.ts`. `blockfire/supabase/README.md` says every function is deployed with JWT verification. There is no `config.toml` to confirm per-function `verify_jwt`. The game sends the anon key as `apikey` and, when `auth` is not false, the user access token as `Authorization`.

| Function | Auth the code checks | Behavior |
|---|---|---|
| `guest` | None (service role creates the user) | Up to 6 tries to create `Guest-######` with a random password, email `name@players.blockfire.game`, `email_confirm: true`, `guest: true` on user and app metadata. Returns `{name, password}` |
| `signup` | None | Username + password. Password length 8–72. Refuses bad names, the name `player`, names starting with `guest`, and a blocklist (slurs and staff-like words). Email is the squashed username at `@players.blockfire.game`. `guest: false` |
| `claim` | User JWT, and the user must be a guest | Same name and password rules. Updates that auth user (email, password, metadata) and patches `players.name` |
| `device` | `create` and `revoke` need a user JWT. `login` needs `{uid, key}` | Stores SHA-256 of a random key. Login works for 30 days after `last_used_at`, then deletes the key. Keeps at most 8 keys per user. Login mints a magic link and returns a normal session |
| `delete-account` | User JWT, body `{confirm:'DELETE'}` | Deletes the `players` row, then the auth user |
| `admin-claim` | User JWT, not a guest, body `{code}` | Compares SHA-256 of the uppercased code to `admin_claim`. Inserts `admins` if the table is empty, then deletes the hash |
| `retention` | None in the function body (uses service role) | Deletes old rows. Comment says a database scheduler calls it daily. **The schedule is not in git** |

`signup` and `claim` require passwords of **8 to 72** characters. Some error strings in the game still say 6. The mock server in `tests/mock-supabase.js` also accepts 6. **TODO:** the client copy and the server rule disagree.

`guest`, `signup`, `claim`, `device`, `delete-account`, and `admin-claim` send CORS `Access-Control-Allow-Origin: *`. `retention` does not.

Environment variables the functions read (Supabase injects these; do not commit the values):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (not read by `guest`, `signup`, or `retention`)
- `SUPABASE_SERVICE_ROLE_KEY`

## Auth

Usernames are not emails. The functions store an internal address at `@players.blockfire.game` and confirm it with the admin API, so players are not asked for a mailbox.

Guest flag and display name are written to **both** `user_metadata` and `app_metadata`. `identity.sql` treats app metadata as the trusted copy.

No Auth hook, no redirect URL list, and no "disable public sign-up" setting is in git. The game does not call `/auth/v1/signup` for normal accounts (it calls the `signup` function, which uses the admin API). The mock server still implements `/auth/v1/signup`.

## Row Level Security, short version

From `blockfire/supabase/README.md`, still true for the tables that file was describing:

- A player can read and write only their own `players` row, and cannot rename it.
- `app_config` is world-readable. Only the admin can change `value`, and only inside the guard's checks.
- `support_messages` and `client_errors` are insert-only for players. The admin can read and delete them.
- `device_keys`, `admins`, `admin_claim`, and `heartbeat` are not granted to players.

`identity.sql` tightens rooms and invites (ban check, server-side host name) and adds tickets. It does not restate grants for the new tables as strictly as `schema.sql` does. See the TODOs on `bans`, `mp_tickets`, and `app_secret`.

## Storage

No `insert into storage.buckets` and no storage policies are in the repo. **TODO:** if the live project has buckets, they are not described here.

## Rebuild a project from git

This uses the Supabase SQL editor and the Supabase CLI. The CLI is not configured in the repo (`config.toml` is absent), so link the project yourself. Do not paste the service-role key into git.

1. Create a Supabase project. The checked-in note says region `eu-central-1` for the current one. A new project will have a new URL. The game will not use it until `CLOUD_CFG` (or `localStorage` `blockfire.cloudcfg`) points at it.
2. Confirm `pgcrypto` is available as `extensions.gen_random_bytes` and `extensions.hmac`. `identity.sql` needs both and does not create the extension.
3. In the SQL editor, run `blockfire/supabase/schema.sql` once on an empty `public` schema.
4. Run `blockfire/supabase/identity.sql`.
5. Insert your own admin code hash into `admin_claim` (see that table above). Pick the code outside the repo. The `admin-claim` function uppercases it before hashing.
6. Deploy each function directory:

   ```bash
   supabase functions deploy guest
   supabase functions deploy signup
   supabase functions deploy claim
   supabase functions deploy device
   supabase functions deploy delete-account
   supabase functions deploy admin-claim
   supabase functions deploy retention
   ```

   `blockfire/supabase/README.md` says to deploy with JWT verification on. **TODO:** `retention` is documented as a scheduler call and does not check a user. Whether the gateway should skip JWT verification for that function is not written down. `guest` and `signup` are called with the anon key, which is a JWT, so gateway verification can stay on for them.
7. Point the game at the project (`CLOUD_CFG` or `blockfire.cloudcfg`) using the project URL and the **anon** key only.
8. Sign up in the game, then Profile → enter the admin code once. The code row is deleted after success, and `admins.one` blocks a second admin.

After that, guests, username sign-up, cloud saves, the room list, invites, tickets, bans, support messages, and crash rows work **as far as the SQL in git goes**.

Still manual, because it is not in git:

- Schedule `retention` (the function comment says once a day).
- Schedule `keepalive()` if you need the free-tier pause protection. The workflow named in the SQL comment is not on this branch.
- Create the missing RPCs and tables if you need friends, referrals, the ranked board, push, or `server_now`.
- Turn on Realtime broadcast if you want the in-game backup route that uses `/realtime/v1/websocket`. Nothing in the SQL enables it.
- Auth email templates are unused for normal sign-up (accounts are confirmed by the admin API). Any extra Auth settings on the live project were not exported.

## Client contract that the SQL does cover

- Profile upsert: `POST /rest/v1/players` with `Prefer: resolution=merge-duplicates`, or `PATCH` with `id` and `updated_at` filters.
- Config: `GET /rest/v1/app_config?select=key,value` with the anon key.
- Errors and help: `POST` to `client_errors` and `support_messages`.
- Rooms: `POST /rest/v1/rpc/room_upsert2`, falling back to `room_upsert` on HTTP 404. List: `GET /rest/v1/rooms` filtered by `proto`.
- Invites: `GET /rest/v1/invites` (recipient only) and `POST /rest/v1/rpc/invite_send`.
- Tickets and reports: `mp_ticket`, `mp_check`, `report_player`.
- Admin: `is_admin`, patch `app_config`, `admin_bans`, `admin_ban`, `admin_unban`, delete on messages and errors.
