-- =====================================================================
-- WO-16 SQL hardening. Apply on top of 20261018000000_live_baseline.sql.
-- Does not connect to production. Does not rewrite or expire existing
-- passwords (no UPDATE of auth.users).
--
-- Password length is NOT enforced here. GoTrue hashes the password before
-- it reaches SQL, so a trigger cannot see the length. The floor of 8 is:
--   * edge functions signup and claim (repo copies already reject < 8;
--     the deployed copies still accept 6 until they are redeployed)
--   * Auth setting minimum_password_length (local config.toml = 8).
--     Production: Dashboard → Authentication → Providers → Email →
--     Password security → Minimum password length = 8.
--     Existing users can still sign in. Supabase does not force a reset.
--       https://supabase.com/docs/guides/auth/password-security
--
-- Leaked-password protection is also an Auth setting, not SQL.
--   Dashboard → Authentication → Providers → Email →
--   "Prevent use of leaked passwords" (HaveIBeenPwned).
--   Plan-gated: Pro Plan and above. Do not imitate it with a SQL check.
--       https://supabase.com/docs/guides/auth/password-security
--
-- Vault secret this migration reads and does not create:
--   name:  cubefront_retention_bearer
--   value: the project anon key (the JWT only, no "Bearer " prefix)
--   where: Dashboard → Project Settings → Vault, or
--          select vault.create_secret('<anon jwt>', 'cubefront_retention_bearer',
--                 'Authorization bearer for the cubefront-retention cron');
-- =====================================================================

-- ---------- 1. Backups: no password hashes, no auth tokens, no TURN secret ----------
CREATE OR REPLACE FUNCTION backup.take()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
declare s int := (extract(epoch from now())::bigint / 86400) % 3; t text; n int; d jsonb;
begin
  foreach t in array array['public.players','public.bans','public.admins','public.support_messages','public.invites'] loop
    execute format('select count(*)::int, coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from %s x', t) into n, d;
    insert into backup.snap(slot, tbl, rows, data, taken_at) values (s, t, n, d, now())
      on conflict (slot, tbl) do update set rows = excluded.rows, data = excluded.data, taken_at = excluded.taken_at;
  end loop;
  -- app_config is public settings plus the TURN credential. Keep the row, blank the secret.
  select count(*)::int,
         coalesce(jsonb_agg(case when x.key = 'turn' then jsonb_set(to_jsonb(x), '{value}', '""'::jsonb) else to_jsonb(x) end), '[]'::jsonb)
    into n, d
    from public.app_config x;
  insert into backup.snap(slot, tbl, rows, data, taken_at) values (s, 'public.app_config', n, d, now())
    on conflict (slot, tbl) do update set rows = excluded.rows, data = excluded.data, taken_at = excluded.taken_at;
  -- auth.users: id, email, metadata, timestamps. Never encrypted_password and never
  -- confirmation, recovery, email-change, phone-change or reauthentication tokens.
  select count(*)::int, coalesce(jsonb_agg(jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'raw_app_meta_data', u.raw_app_meta_data,
      'raw_user_meta_data', u.raw_user_meta_data,
      'created_at', u.created_at,
      'email_confirmed_at', u.email_confirmed_at)), '[]'::jsonb)
    into n, d from auth.users u;
  insert into backup.snap(slot, tbl, rows, data, taken_at) values (s, 'auth.users', n, d, now())
    on conflict (slot, tbl) do update set rows = excluded.rows, data = excluded.data, taken_at = excluded.taken_at;
  return 'slot ' || s;
end $function$;

-- Existing snapshots already hold hashes and, for app_config, the TURN password.
-- Strip those fields in place. The values are not copied anywhere else, so a
-- rollback can restore the function but not the purged secrets.
UPDATE backup.snap
SET data = COALESCE((
  SELECT jsonb_agg(
    CASE
      WHEN jsonb_typeof(elem) = 'object' THEN
        elem
          - 'encrypted_password'
          - 'confirmation_token'
          - 'recovery_token'
          - 'email_change_token_new'
          - 'email_change_token_current'
          - 'reauthentication_token'
          - 'phone_change_token'
          - 'email_change'
      ELSE elem
    END)
  FROM jsonb_array_elements(data) AS elem
), '[]'::jsonb)
WHERE jsonb_typeof(data) = 'array';

UPDATE backup.snap
SET data = COALESCE((
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'key' = 'turn' THEN jsonb_set(elem, '{value}', '""'::jsonb)
      ELSE elem
    END)
  FROM jsonb_array_elements(data) AS elem
), '[]'::jsonb)
WHERE tbl = 'public.app_config' AND jsonb_typeof(data) = 'array';

-- ---------- 2. Revoke API access to server-only tables ----------
-- Baseline: RLS is enabled and there are zero policies (default deny) on
-- app_secret, bans and mp_tickets, but anon and authenticated still hold ALL.
-- RLS already stopped a SELECT from returning rows. The GRANT was a footgun
-- if RLS were later disabled. Access stays through SECURITY DEFINER functions
-- (owner) and service_role (edge functions, retention).
REVOKE ALL ON TABLE public.app_secret FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bans FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.mp_tickets FROM PUBLIC, anon, authenticated;

-- push_subs: the client upserts its own row and deletes it. It never SELECTs.
-- Columns written by cabin-fever.html pushEnable: endpoint, user_id, p256dh, auth, tz_offset.
-- prefs and sent stay service_role only (the push function updates sent).
REVOKE ALL ON TABLE public.push_subs FROM PUBLIC, anon, authenticated;
GRANT INSERT (endpoint, user_id, p256dh, auth, tz_offset) ON TABLE public.push_subs TO authenticated;
GRANT UPDATE (endpoint, user_id, p256dh, auth, tz_offset) ON TABLE public.push_subs TO authenticated;
GRANT DELETE ON TABLE public.push_subs TO authenticated;
-- The client upsert is INSERT ... ON CONFLICT (endpoint) DO UPDATE. Postgres
-- requires table SELECT for that statement. RLS policy "push own select"
-- still limits it to the caller's row. sent and prefs stay non-writable.
GRANT SELECT ON TABLE public.push_subs TO authenticated;

-- ---------- 3. TURN credential is not world-readable ----------
-- The row stays in app_config so the admin panel can still update it
-- (app_config_guard keeps validating the shape). Anon cannot select it.
-- Signed-in non-admins cannot select it either; they call turn_relay().
DROP POLICY IF EXISTS "anyone reads config" ON public.app_config;
DROP POLICY IF EXISTS "anon reads public config" ON public.app_config;
CREATE POLICY "anon reads public config" ON public.app_config
  AS PERMISSIVE FOR SELECT TO anon
  USING (key <> 'turn');
DROP POLICY IF EXISTS "signed in reads config" ON public.app_config;
CREATE POLICY "signed in reads config" ON public.app_config
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((key <> 'turn') OR (SELECT public.is_admin()));

CREATE OR REPLACE FUNCTION public.turn_relay(p_token text DEFAULT NULL)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
declare v text; ok boolean := false;
begin
  if auth.uid() is not null then
    ok := true;
  elsif p_token ~ '^[0-9a-f]{36}$' and exists (
    select 1 from public.mp_tickets t
    where t.token = p_token and t.created_at > now() - interval '12 hours'
  ) then
    ok := true;
  end if;
  if not ok then
    return null;
  end if;
  select c.value #>> '{}' into v from public.app_config c where c.key = 'turn';
  return coalesce(v, '');
end $function$;

REVOKE ALL ON FUNCTION public.turn_relay(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.turn_relay(text) TO anon, authenticated, service_role;

-- ---------- 4. Crash reports: signed-in, per-user caps, stack cap ----------
-- Baseline grants omitted INSERT (the insert policy existed anyway). Grant the
-- columns the client sends. user_id is forced to auth.uid() and is not writable.
REVOKE INSERT ON TABLE public.client_errors FROM anon;
GRANT INSERT (app_version, message, stack, where_, device) ON TABLE public.client_errors TO authenticated;

DROP POLICY IF EXISTS "anyone can report an error" ON public.client_errors;
DROP POLICY IF EXISTS "signed in reports an error" ON public.client_errors;
CREATE POLICY "signed in reports an error" ON public.client_errors
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.uid()) IS NOT NULL) AND (user_id = (SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.client_errors_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
begin
  -- anonymous reports are dropped (QC #2). A missing session cannot fill the table.
  if auth.uid() is null then
    return null;
  end if;
  new.user_id := auth.uid();
  -- stack cap matches the column check. The client used to send 4500 characters on a crash.
  new.stack := left(new.stack, 2000);
  -- per user: 30 reports an hour, and at most 500 rows kept for that account
  if (select count(*) from public.client_errors
      where user_id = new.user_id and created_at > now() - interval '1 hour') >= 30 then
    return null;
  end if;
  if (select count(*) from public.client_errors where user_id = new.user_id) >= 500 then
    return null;
  end if;
  -- global backstop, same numbers as the baseline
  if (select count(*) from public.client_errors where created_at > now() - interval '1 minute') >= 300 then
    return null;
  end if;
  if (select count(*) from public.client_errors) >= 20000 then
    return null;
  end if;
  return new;
end $function$;

-- ---------- 5. Support messages: per-IP cap, keep the per-user cap ----------
ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS client_ip text;
ALTER TABLE public.support_messages DROP CONSTRAINT IF EXISTS support_messages_client_ip_check;
ALTER TABLE public.support_messages
  ADD CONSTRAINT support_messages_client_ip_check CHECK ((client_ip IS NULL) OR (char_length(client_ip) <= 64));

-- The baseline export recorded no INSERT grant. The insert policy and the
-- support page both expect one. Limit the grant to the columns the client sends.
GRANT INSERT (player_name, topic, message, contact, app_version, device)
  ON TABLE public.support_messages TO anon, authenticated;

-- The baseline insert policy is WITH CHECK (true). That is the same set of
-- rows the column checks already allow, and it trips the always-true policy
-- lint. Repeat those checks here so a support insert still succeeds for every
-- topic the support page and the in-game form send.
DROP POLICY IF EXISTS "anyone can send a message" ON public.support_messages;
CREATE POLICY "anyone can send a message" ON public.support_messages
  AS PERMISSIVE FOR INSERT TO anon, authenticated
  WITH CHECK (
    (topic = ANY (ARRAY['bug'::text, 'account'::text, 'purchase'::text, 'idea'::text, 'report'::text, 'other'::text]))
    AND (char_length(message) >= 5)
    AND (char_length(message) <= 2000)
  );

CREATE OR REPLACE FUNCTION public.request_client_ip()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path = public, pg_temp
AS $function$
declare raw text; hdr jsonb; fwd text;
begin
  raw := current_setting('request.headers', true);
  if raw is null or btrim(raw) = '' then
    return null;
  end if;
  begin
    hdr := raw::jsonb;
  exception when others then
    return null;
  end;
  fwd := coalesce(hdr->>'x-forwarded-for', hdr->>'x-real-ip', hdr->>'cf-connecting-ip');
  if fwd is null or btrim(fwd) = '' then
    return null;
  end if;
  -- Supabase records the client in the first X-Forwarded-For hop.
  return left(btrim(split_part(fwd, ',', 1)), 64);
end $function$;

REVOKE ALL ON FUNCTION public.request_client_ip() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.support_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
begin
  new.client_ip := nullif(public.request_client_ip(), '');
  if new.user_id is not null and (select count(*) from public.support_messages
      where user_id = new.user_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too many messages, try again later';
  end if;
  -- one address, signed in or not, gets the same hourly cap (QC #11)
  if new.client_ip is not null and (select count(*) from public.support_messages
      where client_ip = new.client_ip and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too many messages, try again later';
  end if;
  -- no address and no account: keep a shared fallback so a missing header is not unlimited
  if new.client_ip is null and new.user_id is null and (select count(*) from public.support_messages
      where client_ip is null and user_id is null and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'too many messages, try again later';
  end if;
  if (select count(*) from public.support_messages) >= 5000 then
    raise exception 'the support inbox is full, try again later';
  end if;
  return new;
end $function$;

CREATE INDEX IF NOT EXISTS support_messages_client_ip_created
  ON public.support_messages USING btree (client_ip, created_at);

-- ---------- 6. Display name cannot bypass the server-checked name ----------
-- The baseline already attaches players_force_name. The old body kept whatever
-- name the client sent when app_metadata had no usable name, and that name was
-- then frozen by players_keep_name. Inserts now require the server name.
-- Updates never accept a different name from the client.
-- players_econ_guard is not modified (economy lane).
CREATE OR REPLACE FUNCTION public.players_force_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
declare nm text;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  select u.raw_app_meta_data->>'name' into nm from auth.users u where u.id = new.id;
  if tg_op = 'UPDATE' then
    if nm is not null and nm ~ '^[A-Za-z0-9_ .-]{2,14}$'
       and lower(replace(nm, ' ', '')) = lower(replace(old.name, ' ', '')) then
      new.name := nm;
    else
      new.name := old.name;
    end if;
    return new;
  end if;
  if nm is not null and nm ~ '^[A-Za-z0-9_ .-]{2,14}$' then
    new.name := nm;
    return new;
  end if;
  raise exception 'name is not set';
end $function$;

DROP TRIGGER IF EXISTS players_force_name ON public.players;
CREATE TRIGGER players_force_name
  BEFORE INSERT OR UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.players_force_name();

-- ---------- 7. mp_check: a live ticket, and only that player's public fields ----------
-- Returns name, pid (game id, not the account uuid), gm, banned. No email, no user id,
-- no other accounts. Anon EXECUTE stays: the room host checks someone else's ticket,
-- and the client omits the JWT when it has no session. The ticket is the capability.
CREATE OR REPLACE FUNCTION public.mp_check(p_token text, p_room text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
declare r record; nm text; sec text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{36}$' then
    return null;
  end if;
  if p_room is null or upper(p_room) !~ '^[A-Z0-9]{4,8}$' then
    return null;
  end if;
  select t.user_id, t.room into r
    from public.mp_tickets t
    where t.token = p_token and t.created_at > now() - interval '12 hours';
  if r.user_id is null or r.room <> upper(p_room) then
    return null;
  end if;
  select u.raw_app_meta_data->>'name' into nm from auth.users u where u.id = r.user_id;
  select s into sec from public.app_secret where id = 1;
  return jsonb_build_object(
    'name', coalesce(nm, 'Player'),
    'pid', left(encode(extensions.hmac(r.user_id::text, sec, 'sha256'), 'hex'), 20),
    'gm', exists(select 1 from public.admins a where a.user_id = r.user_id),
    'banned', public.is_banned(r.user_id));
end $function$;

-- ---------- 8. search_path on every SECURITY DEFINER function ----------
-- players_econ_guard() is intentionally not altered. The economy lane owns it.
-- Its search_path is already pinned to '' (not mutable). The others move to
-- public, pg_temp as specified. Bodies that were not replaced above are unchanged.
ALTER FUNCTION public.admin_ban(uuid, integer, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_bans() SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_overview() SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_unban(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.app_config_guard() SET search_path = public, pg_temp;
ALTER FUNCTION public.friend_remove(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.friend_request(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.friend_respond(text, boolean) SET search_path = public, pg_temp;
ALTER FUNCTION public.friends_list() SET search_path = public, pg_temp;
ALTER FUNCTION public.invite_send(text, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.invites_push() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_admin() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_banned(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.keepalive() SET search_path = public, pg_temp;
ALTER FUNCTION public.mp_ticket(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.my_ban() SET search_path = public, pg_temp;
ALTER FUNCTION public.presence_ping(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.public_leaderboard(text, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.push_call(jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.ranked_leaderboard(integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.referral_claim(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.referral_rewards() SET search_path = public, pg_temp;
ALTER FUNCTION public.report_player(text, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.room_remove() SET search_path = public, pg_temp;
ALTER FUNCTION public.room_upsert(text, text, text, text, integer, integer, boolean, text, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.room_upsert2(text, text, text, text, integer, integer, boolean, text, integer, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.signup_guard() SET search_path = public, pg_temp;

-- Leaderboard / keepalive audit (bodies unchanged, anon EXECUTE kept):
--   public_leaderboard: rank, name, level, xp, kills, deaths, wins, matches,
--     best_streak, headshots, zombie_best. No account id, no email.
--   ranked_leaderboard: pos, name, rp, best, games, level, me (boolean for the
--     caller only). The account id is used internally and is not returned.
--   keepalive: the heartbeat timestamp only.

-- admin_* audit: each already calls is_admin() as its first statement
-- (admin_ban, admin_bans, admin_overview, admin_unban). Bodies not rewritten.

-- ---------- 9. Indexes for the three unindexed foreign keys ----------
CREATE INDEX IF NOT EXISTS client_errors_user_id_idx ON public.client_errors USING btree (user_id);
CREATE INDEX IF NOT EXISTS support_messages_user_id_idx ON public.support_messages USING btree (user_id);
CREATE INDEX IF NOT EXISTS support_messages_reported_uid_idx ON public.support_messages USING btree (reported_uid);

-- ---------- 10. Dead rooms policy ----------
DROP POLICY IF EXISTS "host sees own room" ON public.rooms;

-- ---------- 11. Retention cron reads the bearer from Vault ----------
-- Secret name to create: cubefront_retention_bearer (anon JWT, no "Bearer " prefix).
SELECT cron.unschedule('cubefront-retention')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cubefront-retention');
SELECT cron.schedule(
  'cubefront-retention',
  '41 3 * * *',
  $cron$select net.http_post(url := 'https://qnhogbwnumvounwpusmc.supabase.co/functions/v1/retention', body := '{}'::jsonb, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.name = 'cubefront_retention_bearer' limit 1))) where exists (select 1 from vault.decrypted_secrets ds where ds.name = 'cubefront_retention_bearer' and nullif(btrim(ds.decrypted_secret), '') is not null)$cron$
);
