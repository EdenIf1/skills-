-- Rollback for 20261020140000_sql_hardening.sql.
-- Restores the schema and function bodies from 20261018000000_live_baseline.sql.
-- Purged backup.snap fields (encrypted_password, auth tokens, the TURN value)
-- cannot be restored: the migration deleted those values and did not keep a copy.
-- Re-applying this file's backup.take() only changes what future snapshots write.
--
-- players_econ_guard() was not changed by the forward migration and is not touched here.

-- ---------- functions replaced by the forward migration ----------
CREATE OR REPLACE FUNCTION backup.take()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s int := (extract(epoch from now())::bigint / 86400) % 3; t text; n int; d jsonb;
begin
  foreach t in array array['public.players','public.bans','public.admins','public.app_config','public.support_messages','public.invites'] loop
    execute format('select count(*)::int, coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from %s x', t) into n, d;
    insert into backup.snap(slot, tbl, rows, data, taken_at) values (s, t, n, d, now())
      on conflict (slot, tbl) do update set rows = excluded.rows, data = excluded.data, taken_at = excluded.taken_at;
  end loop;
  select count(*)::int, coalesce(jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'encrypted_password',u.encrypted_password,
      'raw_app_meta_data',u.raw_app_meta_data,'raw_user_meta_data',u.raw_user_meta_data,'created_at',u.created_at,'email_confirmed_at',u.email_confirmed_at)),'[]'::jsonb)
    into n, d from auth.users u;
  insert into backup.snap(slot, tbl, rows, data, taken_at) values (s, 'auth.users', n, d, now())
    on conflict (slot, tbl) do update set rows = excluded.rows, data = excluded.data, taken_at = excluded.taken_at;
  return 'slot ' || s;
end $function$;

CREATE OR REPLACE FUNCTION public.client_errors_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select count(*) from public.client_errors where created_at > now() - interval '1 minute') >= 300 then return null; end if;
  -- never let reports fill the database
  if (select count(*) from public.client_errors) >= 20000 then return null; end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.support_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select count(*) from public.support_messages
      where created_at > now() - interval '1 hour'
        and ((new.user_id is not null and user_id = new.user_id) or (new.user_id is null and user_id is null and created_at > now() - interval '1 minute'))) >= 5 then
    raise exception 'too many messages, try again later';
  end if;
  if (select count(*) from public.support_messages) >= 5000 then raise exception 'the support inbox is full, try again later'; end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.players_force_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare nm text;
begin
  if coalesce(auth.role(), '') = 'service_role' then return new; end if;
  select u.raw_app_meta_data->>'name' into nm from auth.users u where u.id = new.id;
  if nm is not null and nm ~ '^[A-Za-z0-9_ .-]{2,14}$' then new.name := nm; end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.mp_check(p_token text, p_room text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; nm text; sec text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{36}$' then return null; end if;
  select t.user_id, t.room into r from public.mp_tickets t where t.token = p_token and t.created_at > now() - interval '12 hours';
  if r.user_id is null or r.room <> upper(coalesce(p_room,'')) then return null; end if;
  select u.raw_app_meta_data->>'name' into nm from auth.users u where u.id = r.user_id;
  select s into sec from public.app_secret where id = 1;
  return jsonb_build_object('name', coalesce(nm, 'Player'),
    'pid', left(encode(extensions.hmac(r.user_id::text, sec, 'sha256'), 'hex'), 20),
    'gm', exists(select 1 from public.admins a where a.user_id = r.user_id),
    'banned', public.is_banned(r.user_id));
end $function$;

DROP FUNCTION IF EXISTS public.turn_relay(text);
DROP FUNCTION IF EXISTS public.request_client_ip();

-- ---------- search_path back to the baseline pin ('') ----------
ALTER FUNCTION backup.take() SET search_path TO '';
ALTER FUNCTION public.admin_ban(uuid, integer, text) SET search_path TO '';
ALTER FUNCTION public.admin_bans() SET search_path TO '';
ALTER FUNCTION public.admin_overview() SET search_path TO '';
ALTER FUNCTION public.admin_unban(uuid) SET search_path TO '';
ALTER FUNCTION public.app_config_guard() SET search_path TO '';
ALTER FUNCTION public.client_errors_guard() SET search_path TO '';
ALTER FUNCTION public.friend_remove(text) SET search_path TO '';
ALTER FUNCTION public.friend_request(text) SET search_path TO '';
ALTER FUNCTION public.friend_respond(text, boolean) SET search_path TO '';
ALTER FUNCTION public.friends_list() SET search_path TO '';
ALTER FUNCTION public.invite_send(text, text, text) SET search_path TO '';
ALTER FUNCTION public.invites_push() SET search_path TO '';
ALTER FUNCTION public.is_admin() SET search_path TO '';
ALTER FUNCTION public.is_banned(uuid) SET search_path TO '';
ALTER FUNCTION public.keepalive() SET search_path TO '';
ALTER FUNCTION public.mp_check(text, text) SET search_path TO '';
ALTER FUNCTION public.mp_ticket(text) SET search_path TO '';
ALTER FUNCTION public.my_ban() SET search_path TO '';
ALTER FUNCTION public.players_force_name() SET search_path TO '';
ALTER FUNCTION public.presence_ping(text) SET search_path TO '';
ALTER FUNCTION public.public_leaderboard(text, integer) SET search_path TO '';
ALTER FUNCTION public.push_call(jsonb) SET search_path TO '';
ALTER FUNCTION public.ranked_leaderboard(integer) SET search_path TO '';
ALTER FUNCTION public.referral_claim(text) SET search_path TO '';
ALTER FUNCTION public.referral_rewards() SET search_path TO '';
ALTER FUNCTION public.report_player(text, text, text) SET search_path TO '';
ALTER FUNCTION public.room_remove() SET search_path TO '';
ALTER FUNCTION public.room_upsert(text, text, text, text, integer, integer, boolean, text, integer) SET search_path TO '';
ALTER FUNCTION public.room_upsert2(text, text, text, text, integer, integer, boolean, text, integer, integer) SET search_path TO '';
ALTER FUNCTION public.signup_guard() SET search_path TO '';
ALTER FUNCTION public.support_rate_limit() SET search_path TO '';

-- ---------- policies ----------
DROP POLICY IF EXISTS "anon reads public config" ON public.app_config;
DROP POLICY IF EXISTS "signed in reads config" ON public.app_config;
DROP POLICY IF EXISTS "anyone reads config" ON public.app_config;
CREATE POLICY "anyone reads config" ON public.app_config
  AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "signed in reports an error" ON public.client_errors;
DROP POLICY IF EXISTS "anyone can report an error" ON public.client_errors;
CREATE POLICY "anyone can report an error" ON public.client_errors
  AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "host sees own room" ON public.rooms;
CREATE POLICY "host sees own room" ON public.rooms
  AS PERMISSIVE FOR SELECT TO authenticated USING (false);

DROP POLICY IF EXISTS "anyone can send a message" ON public.support_messages;
CREATE POLICY "anyone can send a message" ON public.support_messages
  AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ---------- grants back to the baseline export ----------
REVOKE ALL ON TABLE public.app_secret FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.app_secret TO anon;
GRANT ALL ON TABLE public.app_secret TO authenticated;

REVOKE ALL ON TABLE public.bans FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.bans TO anon;
GRANT ALL ON TABLE public.bans TO authenticated;

REVOKE ALL ON TABLE public.mp_tickets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.mp_tickets TO anon;
GRANT ALL ON TABLE public.mp_tickets TO authenticated;

REVOKE ALL ON TABLE public.push_subs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.push_subs TO anon;
GRANT ALL ON TABLE public.push_subs TO authenticated;

-- Column INSERT added by the forward migration. The baseline file did not grant it.
REVOKE INSERT ON TABLE public.client_errors FROM anon, authenticated;
REVOKE INSERT ON TABLE public.support_messages FROM anon, authenticated;

-- ---------- indexes, column, cron ----------
DROP INDEX IF EXISTS public.client_errors_user_id_idx;
DROP INDEX IF EXISTS public.support_messages_user_id_idx;
DROP INDEX IF EXISTS public.support_messages_reported_uid_idx;
DROP INDEX IF EXISTS public.support_messages_client_ip_created;

ALTER TABLE public.support_messages DROP CONSTRAINT IF EXISTS support_messages_client_ip_check;
ALTER TABLE public.support_messages DROP COLUMN IF EXISTS client_ip;

SELECT cron.unschedule('cubefront-retention')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cubefront-retention');
SELECT cron.schedule(
  'cubefront-retention',
  '41 3 * * *',
  $cron$select net.http_post(url := 'https://qnhogbwnumvounwpusmc.supabase.co/functions/v1/retention', body := '{}'::jsonb, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <REDACTED_JWT>'))$cron$
);
