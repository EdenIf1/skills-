# Supabase advisors: project qnhogbwnumvounwpusmc (read-only, 2026-10-20)

## Security

### [INFO] RLS Enabled No Policy (12): [docs](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)

- Table `public.admin_claim` has RLS enabled, but no policies exist
- Table `public.admins` has RLS enabled, but no policies exist
- Table `public.app_secret` has RLS enabled, but no policies exist
- Table `public.bans` has RLS enabled, but no policies exist
- Table `public.device_keys` has RLS enabled, but no policies exist
- Table `public.economy_flags` has RLS enabled, but no policies exist
- Table `public.friends` has RLS enabled, but no policies exist
- Table `public.heartbeat` has RLS enabled, but no policies exist
- Table `public.mp_tickets` has RLS enabled, but no policies exist
- Table `public.presence` has RLS enabled, but no policies exist
- Table `public.push_keys` has RLS enabled, but no policies exist
- Table `public.referrals` has RLS enabled, but no policies exist

### [WARN] Public Can Execute SECURITY DEFINER Function (4): [docs](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)

- Function `public.keepalive()` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/keepalive`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.mp_check(p_token text, p_room text)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/mp_check`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.public_leaderboard(p_sort text, p_limit integer)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/public_leaderboard`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.ranked_leaderboard(p_limit integer)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/ranked_leaderboard`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.

### [WARN] Signed-In Users Can Execute SECURITY DEFINER Function (22): [docs](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)

- Function `public.admin_ban(p_uid uuid, p_days integer, p_reason text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/admin_ban`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.admin_bans()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/admin_bans`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.admin_overview()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/admin_overview`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.admin_unban(p_uid uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/admin_unban`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.friend_remove(p_name text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/friend_remove`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.friend_request(p_name text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/friend_request`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.friend_respond(p_name text, p_accept boolean)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/friend_respond`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.friends_list()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/friends_list`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.invite_send(p_to text, p_code text, p_mode text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/invite_send`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.is_admin()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/is_admin`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.mp_check(p_token text, p_room text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/mp_check`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.mp_ticket(p_room text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/mp_ticket`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.my_ban()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/my_ban`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.presence_ping(p_room text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/presence_ping`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.public_leaderboard(p_sort text, p_limit integer)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/public_leaderboard`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.ranked_leaderboard(p_limit integer)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/ranked_leaderboard`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.referral_claim(p_ref text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/referral_claim`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.referral_rewards()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/referral_rewards`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.report_player(p_token text, p_room text, p_why text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/report_player`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.room_remove()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/room_remove`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.room_upsert(p_code text, p_host_name text, p_mode text, p_map text, p_players integer, p_max integer, p_locked boolean, p_state text, p_proto integer)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/room_upsert`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
- Function `public.room_upsert2(p_code text, p_host_name text, p_mode text, p_map text, p_players integer, p_max integer, p_locked boolean, p_state text, p_proto integer, p_progress integer)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/room_upsert2`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.

### [WARN] Leaked Password Protection Disabled (1): [docs](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

- Supabase Auth prevents the use of compromised passwords by checking against HaveIBeenPwned.org. Enable this feature to enhance security.

## Performance

### [INFO] Unindexed foreign keys (3): [docs](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)

- Table `public.client_errors` has a foreign key `client_errors_user_id_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.support_messages` has a foreign key `support_messages_reported_uid_fkey` without a covering index. This can lead to suboptimal query performance.
- Table `public.support_messages` has a foreign key `support_messages_user_id_fkey` without a covering index. This can lead to suboptimal query performance.

### [INFO] Unused Index (1): [docs](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)

- Index `push_subs_user` on table `public.push_subs` has not been used

### [WARN] Multiple Permissive Policies (1): [docs](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies)

- Table `public.rooms` has multiple permissive policies for role `authenticated` for action `SELECT`. Policies include `{"anyone sees live rooms","host sees own room"}`

## Highlights / triage
- **SECURITY DEFINER RPCs callable via REST (WARN):** 4 are callable by `anon` (`keepalive`, `mp_check`, `public_leaderboard`, `ranked_leaderboard`) and 22 by `authenticated`. All of them pin `search_path=''`. Most are intentional RPC entry points. Review the `admin_*` functions (each must gate on `is_admin()`) and `report_player`.
- **Leaked-password protection disabled (WARN):** this is an Auth dashboard setting. Combined with the live signup/claim minimum of 6 chars (the repo says 8), it is the weakest point.
- **RLS enabled, no policy (INFO, 12 tables):** deny-all by design for server-only tables. Pair it with revoking the leftover ALL grants that anon/authenticated hold on `app_secret`, `bans`, `mp_tickets`, `push_subs`.
- **Perf (low impact):** 3 unindexed FKs (`client_errors.user_id`, `support_messages.user_id`, `support_messages.reported_uid`), unused index `push_subs_user`, and 2 permissive SELECT policies on `rooms` (`host sees own room` is `USING (false)` and can be dropped).
