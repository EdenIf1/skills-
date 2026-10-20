-- =====================================================================
-- Cubefront / Blockfire LIVE schema snapshot (WO-10)
-- Project ref: qnhogbwnumvounwpusmc (eu-central-1, Postgres 17)
-- Exported read-only via catalog queries on 2026-10-20 (UTC).
-- Scope: schemas public + backup, app trigger on auth.users, pg_cron jobs
--        except cubefront-retention, realtime publications.
--        Supabase-managed schemas are not dumped.
-- Idempotent-ish: IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS.
-- Reference snapshot only. This file lives in baseline/, outside
-- supabase/migrations/, so `supabase db push` and preview branches do not
-- apply it. Do not move it back under migrations/. Do not db push it.
-- cubefront-retention is live and managed out of band (see inventory.md).
-- Column grants, sequence grants, backup.snap revoke, and invites MAINTAIN
-- were added so this snapshot matches live privileges.
-- =====================================================================
SET check_function_bodies = false;

-- ---------- 1. Extensions ----------
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;  -- v1.6
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;  -- v0.20.4
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;  -- v1.11
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;  -- v1.3
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;  -- v1.1
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;  -- v1.6.4
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;  -- v0.3.1

-- ---------- 2. Schemas ----------
CREATE SCHEMA IF NOT EXISTS backup;  -- owner postgres, USAGE only for postgres (not exposed to the API)

-- ---------- 3. Types ----------
-- (no app-defined enums/composite/domain types in public or backup)

-- ---------- 4. Sequences (standalone; identity sequences come with their tables) ----------
CREATE SEQUENCE IF NOT EXISTS public.economy_flags_id_seq AS bigint;  -- owned by public.economy_flags.id
CREATE SEQUENCE IF NOT EXISTS public.referrals_id_seq AS bigint;  -- owned by public.referrals.id

-- ---------- 5. Tables (columns, defaults, PK/UNIQUE/CHECK) ----------

-- backup.snap
CREATE TABLE IF NOT EXISTS backup.snap (
  slot integer NOT NULL,
  tbl text NOT NULL,
  rows integer NOT NULL,
  data jsonb NOT NULL,
  taken_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT snap_pkey PRIMARY KEY (slot, tbl),
  CONSTRAINT snap_slot_check CHECK (((slot >= 0) AND (slot <= 2)))
);

-- public.admin_claim
CREATE TABLE IF NOT EXISTS public.admin_claim (
  code_hash text NOT NULL,
  CONSTRAINT admin_claim_pkey PRIMARY KEY (code_hash),
  CONSTRAINT admin_claim_code_hash_check CHECK ((code_hash ~ '^[0-9a-f]{64}$'::text))
);

-- public.admins
CREATE TABLE IF NOT EXISTS public.admins (
  user_id uuid NOT NULL,
  one boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT admins_pkey PRIMARY KEY (user_id),
  CONSTRAINT admins_one_key UNIQUE (one),
  CONSTRAINT admins_one_check CHECK (one)
);

-- public.app_config
CREATE TABLE IF NOT EXISTS public.app_config (
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT app_config_pkey PRIMARY KEY (key),
  CONSTRAINT app_config_key_check CHECK ((char_length(key) <= 40))
);

-- public.app_secret
CREATE TABLE IF NOT EXISTS public.app_secret (
  id integer NOT NULL,
  s text NOT NULL,
  CONSTRAINT app_secret_pkey PRIMARY KEY (id),
  CONSTRAINT app_secret_id_check CHECK ((id = 1))
);

-- public.bans
CREATE TABLE IF NOT EXISTS public.bans (
  user_id uuid NOT NULL,
  until timestamp with time zone,
  reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT bans_pkey PRIMARY KEY (user_id),
  CONSTRAINT bans_reason_check CHECK ((char_length(reason) <= 200))
);

-- public.client_errors
CREATE TABLE IF NOT EXISTS public.client_errors (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  user_id uuid DEFAULT auth.uid(),
  app_version text,
  message text NOT NULL,
  stack text,
  where_ text,
  device text,
  CONSTRAINT client_errors_pkey PRIMARY KEY (id),
  CONSTRAINT client_errors_app_version_check CHECK ((char_length(app_version) <= 20)),
  CONSTRAINT client_errors_device_check CHECK ((char_length(device) <= 160)),
  CONSTRAINT client_errors_message_check CHECK ((char_length(message) <= 400)),
  CONSTRAINT client_errors_stack_check CHECK ((char_length(stack) <= 2000)),
  CONSTRAINT client_errors_where__check CHECK ((char_length(where_) <= 60))
);

-- public.device_keys
CREATE TABLE IF NOT EXISTS public.device_keys (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid NOT NULL,
  key_hash text NOT NULL,
  label text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  last_used_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT device_keys_pkey PRIMARY KEY (id),
  CONSTRAINT device_keys_key_hash_key UNIQUE (key_hash),
  CONSTRAINT device_keys_key_hash_check CHECK ((key_hash ~ '^[0-9a-f]{64}$'::text)),
  CONSTRAINT device_keys_label_check CHECK ((char_length(label) <= 60))
);

-- public.economy_flags
CREATE TABLE IF NOT EXISTS public.economy_flags (
  id bigint DEFAULT nextval('economy_flags_id_seq'::regclass) NOT NULL,
  uid uuid,
  field text,
  old_v numeric,
  new_v numeric,
  kept numeric,
  at timestamp with time zone DEFAULT now(),
  CONSTRAINT economy_flags_pkey PRIMARY KEY (id)
);

-- public.friends
CREATE TABLE IF NOT EXISTS public.friends (
  user_id uuid NOT NULL,
  friend_id uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  active boolean DEFAULT true NOT NULL,
  CONSTRAINT friends_pkey PRIMARY KEY (user_id, friend_id),
  CONSTRAINT friends_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text])))
);

-- public.heartbeat
CREATE TABLE IF NOT EXISTS public.heartbeat (
  id integer NOT NULL,
  at timestamp with time zone DEFAULT now() NOT NULL,
  beats bigint DEFAULT 0 NOT NULL,
  CONSTRAINT heartbeat_pkey PRIMARY KEY (id),
  CONSTRAINT heartbeat_id_check CHECK ((id = 1))
);

-- public.invites
CREATE TABLE IF NOT EXISTS public.invites (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  to_uid uuid NOT NULL,
  from_uid uuid NOT NULL,
  from_name text NOT NULL,
  code text NOT NULL,
  mode text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT invites_pkey PRIMARY KEY (id),
  CONSTRAINT invites_code_check CHECK ((code ~ '^[A-Z0-9]{4,8}$'::text)),
  CONSTRAINT invites_from_name_check CHECK ((char_length(from_name) <= 20)),
  CONSTRAINT invites_mode_check CHECK ((char_length(mode) <= 40))
);

-- public.mp_tickets
CREATE TABLE IF NOT EXISTS public.mp_tickets (
  token text NOT NULL,
  user_id uuid NOT NULL,
  room text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT mp_tickets_pkey PRIMARY KEY (token),
  CONSTRAINT mp_tickets_room_check CHECK ((room ~ '^[A-Z0-9]{4,8}$'::text)),
  CONSTRAINT mp_tickets_token_check CHECK ((token ~ '^[0-9a-f]{36}$'::text))
);

-- public.players
CREATE TABLE IF NOT EXISTS public.players (
  id uuid NOT NULL,
  name text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  econ_at timestamp with time zone,
  CONSTRAINT players_pkey PRIMARY KEY (id),
  CONSTRAINT players_data_check CHECK ((pg_column_size(data) < 200000)),
  CONSTRAINT players_name_check CHECK ((((char_length(name) >= 2) AND (char_length(name) <= 14)) AND (name ~ '^[A-Za-z0-9_ .-]+$'::text))),
  CONSTRAINT players_updated_at_check CHECK ((char_length(updated_at) <= 40))
);

-- public.presence
CREATE TABLE IF NOT EXISTS public.presence (
  user_id uuid NOT NULL,
  seen_at timestamp with time zone DEFAULT now() NOT NULL,
  room text,
  CONSTRAINT presence_pkey PRIMARY KEY (user_id)
);

-- public.push_keys
CREATE TABLE IF NOT EXISTS public.push_keys (
  id integer DEFAULT 1 NOT NULL,
  vapid_public text NOT NULL,
  vapid_private text NOT NULL,
  cron_token text DEFAULT encode(gen_random_bytes(24), 'hex'::text) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT push_keys_pkey PRIMARY KEY (id),
  CONSTRAINT push_keys_id_check CHECK ((id = 1))
);

-- public.push_subs
CREATE TABLE IF NOT EXISTS public.push_subs (
  endpoint text NOT NULL,
  user_id uuid NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  tz_offset integer DEFAULT 0 NOT NULL,
  prefs jsonb DEFAULT '{"gift": true, "rent": true, "invite": true}'::jsonb NOT NULL,
  sent jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT push_subs_pkey PRIMARY KEY (endpoint),
  CONSTRAINT push_endpoint_https CHECK (((endpoint ~~ 'https://%'::text) AND (length(endpoint) < 1024))),
  CONSTRAINT push_keys_len CHECK (((length(p256dh) < 200) AND (length(auth) < 100)))
);

-- public.referrals
CREATE TABLE IF NOT EXISTS public.referrals (
  id bigint DEFAULT nextval('referrals_id_seq'::regclass) NOT NULL,
  referrer uuid NOT NULL,
  referee uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  paid_referrer boolean DEFAULT false,
  paid_referee boolean DEFAULT false,
  CONSTRAINT referrals_pkey PRIMARY KEY (id),
  CONSTRAINT referrals_referee_key UNIQUE (referee)
);

-- public.rooms
CREATE TABLE IF NOT EXISTS public.rooms (
  code text NOT NULL,
  host_uid uuid DEFAULT auth.uid() NOT NULL,
  host_name text NOT NULL,
  mode text NOT NULL,
  map text NOT NULL,
  players integer NOT NULL,
  max integer NOT NULL,
  locked boolean DEFAULT false NOT NULL,
  state text DEFAULT 'lobby'::text NOT NULL,
  proto integer NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  progress integer DEFAULT 0 NOT NULL,
  CONSTRAINT rooms_pkey PRIMARY KEY (code),
  CONSTRAINT rooms_host_uid_key UNIQUE (host_uid),
  CONSTRAINT rooms_code_check CHECK ((code ~ '^[A-Z0-9]{4,8}$'::text)),
  CONSTRAINT rooms_host_name_check CHECK (((char_length(host_name) >= 1) AND (char_length(host_name) <= 20))),
  CONSTRAINT rooms_map_check CHECK ((char_length(map) <= 24)),
  CONSTRAINT rooms_max_check CHECK (((max >= 2) AND (max <= 24))),
  CONSTRAINT rooms_mode_check CHECK ((char_length(mode) <= 24)),
  CONSTRAINT rooms_players_check CHECK (((players >= 1) AND (players <= 24))),
  CONSTRAINT rooms_progress_check CHECK (((progress >= 0) AND (progress <= 100))),
  CONSTRAINT rooms_proto_check CHECK (((proto >= 0) AND (proto <= 1000))),
  CONSTRAINT rooms_state_check CHECK ((state = ANY (ARRAY['lobby'::text, 'playing'::text])))
);

-- public.support_messages
CREATE TABLE IF NOT EXISTS public.support_messages (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  user_id uuid DEFAULT auth.uid(),
  player_name text,
  topic text NOT NULL,
  message text NOT NULL,
  contact text,
  app_version text,
  device text,
  reported_uid uuid,
  CONSTRAINT support_messages_pkey PRIMARY KEY (id),
  CONSTRAINT support_messages_app_version_check CHECK ((char_length(app_version) <= 20)),
  CONSTRAINT support_messages_contact_check CHECK ((char_length(contact) <= 120)),
  CONSTRAINT support_messages_device_check CHECK ((char_length(device) <= 160)),
  CONSTRAINT support_messages_message_check CHECK (((char_length(message) >= 5) AND (char_length(message) <= 2000))),
  CONSTRAINT support_messages_player_name_check CHECK ((char_length(player_name) <= 20)),
  CONSTRAINT support_messages_topic_check CHECK ((topic = ANY (ARRAY['bug'::text, 'account'::text, 'purchase'::text, 'idea'::text, 'report'::text, 'other'::text])))
);

-- ---------- 5b. Sequence ownership ----------
ALTER SEQUENCE public.economy_flags_id_seq OWNED BY public.economy_flags.id;
ALTER SEQUENCE public.referrals_id_seq OWNED BY public.referrals.id;

-- ---------- 6. Foreign keys ----------
ALTER TABLE public.admins DROP CONSTRAINT IF EXISTS admins_user_id_fkey; ALTER TABLE public.admins ADD CONSTRAINT admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.bans DROP CONSTRAINT IF EXISTS bans_user_id_fkey; ALTER TABLE public.bans ADD CONSTRAINT bans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.client_errors DROP CONSTRAINT IF EXISTS client_errors_user_id_fkey; ALTER TABLE public.client_errors ADD CONSTRAINT client_errors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.device_keys DROP CONSTRAINT IF EXISTS device_keys_user_id_fkey; ALTER TABLE public.device_keys ADD CONSTRAINT device_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.friends DROP CONSTRAINT IF EXISTS friends_friend_id_fkey; ALTER TABLE public.friends ADD CONSTRAINT friends_friend_id_fkey FOREIGN KEY (friend_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.friends DROP CONSTRAINT IF EXISTS friends_user_id_fkey; ALTER TABLE public.friends ADD CONSTRAINT friends_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.invites DROP CONSTRAINT IF EXISTS invites_from_uid_fkey; ALTER TABLE public.invites ADD CONSTRAINT invites_from_uid_fkey FOREIGN KEY (from_uid) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.invites DROP CONSTRAINT IF EXISTS invites_to_uid_fkey; ALTER TABLE public.invites ADD CONSTRAINT invites_to_uid_fkey FOREIGN KEY (to_uid) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.mp_tickets DROP CONSTRAINT IF EXISTS mp_tickets_user_id_fkey; ALTER TABLE public.mp_tickets ADD CONSTRAINT mp_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_id_fkey; ALTER TABLE public.players ADD CONSTRAINT players_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.presence DROP CONSTRAINT IF EXISTS presence_user_id_fkey; ALTER TABLE public.presence ADD CONSTRAINT presence_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.push_subs DROP CONSTRAINT IF EXISTS push_subs_user_id_fkey; ALTER TABLE public.push_subs ADD CONSTRAINT push_subs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_host_uid_fkey; ALTER TABLE public.rooms ADD CONSTRAINT rooms_host_uid_fkey FOREIGN KEY (host_uid) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.support_messages DROP CONSTRAINT IF EXISTS support_messages_reported_uid_fkey; ALTER TABLE public.support_messages ADD CONSTRAINT support_messages_reported_uid_fkey FOREIGN KEY (reported_uid) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.support_messages DROP CONSTRAINT IF EXISTS support_messages_user_id_fkey; ALTER TABLE public.support_messages ADD CONSTRAINT support_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------- 7. Indexes (non-constraint) ----------
CREATE INDEX IF NOT EXISTS device_keys_user ON public.device_keys USING btree (user_id);
CREATE INDEX IF NOT EXISTS friends_friend_idx ON public.friends USING btree (friend_id);
CREATE INDEX IF NOT EXISTS invites_from_uid ON public.invites USING btree (from_uid, created_at);
CREATE INDEX IF NOT EXISTS invites_to_uid ON public.invites USING btree (to_uid);
CREATE INDEX IF NOT EXISTS mp_tickets_user ON public.mp_tickets USING btree (user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS players_name_key ON public.players USING btree (lower(replace(name, ' '::text, ''::text)));
CREATE INDEX IF NOT EXISTS push_subs_user ON public.push_subs USING btree (user_id);
CREATE INDEX IF NOT EXISTS referrals_referrer ON public.referrals USING btree (referrer);
CREATE INDEX IF NOT EXISTS rooms_fresh ON public.rooms USING btree (updated_at DESC);

-- ---------- 8. Views ----------
-- (no views or materialized views in public/backup)

-- ---------- 9. Functions ----------

-- backup.take()  security_definer=True  config=['search_path=""']  owner=postgres
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

-- public.admin_ban(p_uid uuid, p_days integer, p_reason text)  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.admin_ban(p_uid uuid, p_days integer, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_admin() then return 'denied'; end if;
  if p_uid is null or exists(select 1 from public.admins a where a.user_id = p_uid) then return 'no'; end if;
  insert into public.bans(user_id, until, reason) values (p_uid, case when coalesce(p_days,0) > 0 then now() + make_interval(days => p_days) end, left(coalesce(p_reason,''),200))
  on conflict (user_id) do update set until = excluded.until, reason = excluded.reason, created_at = now();
  return 'ok';
end $function$;

-- public.admin_bans()  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.admin_bans()
 RETURNS TABLE(user_id uuid, name text, until timestamp with time zone, reason text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_admin() then return; end if;
  return query select b.user_id, (u.raw_app_meta_data->>'name')::text, b.until, b.reason, b.created_at from public.bans b join auth.users u on u.id = b.user_id where b.until is null or b.until > now() order by b.created_at desc limit 200;
end $function$;

-- public.admin_overview()  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.admin_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  select jsonb_build_object(
    'players', (select count(*) from public.players),
    'new_7d', (select count(*) from public.players where created_at > now() - interval '7 days'),
    'new_24h', (select count(*) from public.players where created_at > now() - interval '24 hours'),
    'active_24h', (select count(*) from public.players where updated_at ~ '^\d{4}-' and updated_at::timestamptz > now() - interval '24 hours'),
    'active_7d', (select count(*) from public.players where updated_at ~ '^\d{4}-' and updated_at::timestamptz > now() - interval '7 days'),
    'signups_by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d),'[]'::jsonb) from (
        select to_char(date_trunc('day', created_at),'YYYY-MM-DD') d, count(*) n from public.players where created_at > now() - interval '30 days' group by 1) s),
    'errors_24h', (select count(*) from public.client_errors where created_at > now() - interval '24 hours'),
    'errors_7d', (select count(*) from public.client_errors where created_at > now() - interval '7 days'),
    'errors_by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d),'[]'::jsonb) from (
        select to_char(date_trunc('day', created_at),'YYYY-MM-DD') d, count(*) n from public.client_errors where created_at > now() - interval '30 days' group by 1) s),
    'top_errors', (select coalesce(jsonb_agg(e order by (e->>'n')::int desc),'[]'::jsonb) from (
        select jsonb_build_object('message', left(message,300), 'where', max(where_), 'n', count(*), 'users', count(distinct user_id),
          'versions', jsonb_agg(distinct app_version), 'last', max(created_at), 'device', max(left(device,160))) e
        from public.client_errors where created_at > now() - interval '7 days' group by left(message,300) order by count(*) desc limit 25) t),
    'gp_total', (select coalesce(sum(coalesce((data->>'gp')::numeric,0)),0) from public.players p where not exists (select 1 from public.admins a where a.user_id=p.id)),
    'gp_median', (select coalesce(percentile_cont(0.5) within group (order by coalesce((data->>'gp')::numeric,0)),0) from public.players p where not exists (select 1 from public.admins a where a.user_id=p.id)),
    'gp_top', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'gp', gp, 'level', public.lb_level(xp)) order by gp desc),'[]'::jsonb) from (
        select p.name, coalesce((data->>'gp')::numeric,0) gp, coalesce((data->>'xp')::numeric,0) xp from public.players p
        where not exists (select 1 from public.admins a where a.user_id=p.id) order by 2 desc limit 10) g),
    'levels', (select coalesce(jsonb_agg(jsonb_build_object('band', band, 'n', n) order by band),'[]'::jsonb) from (
        select (public.lb_level(coalesce((data->>'xp')::numeric,0))-1)/5*5+1 band, count(*) n from public.players group by 1) l),
    'matches_total', (select coalesce(sum(coalesce((data->'stats'->>'matches')::int,0)),0) from public.players),
    'kills_total', (select coalesce(sum(coalesce((data->'stats'->>'kills')::int,0)),0) from public.players),
    'rooms_open', (select count(*) from public.rooms),
    'support_open', (select count(*) from public.support_messages),
    'bans', (select count(*) from public.bans),
    'push_subs', (select count(*) from public.push_subs),
    'config', (select coalesce(jsonb_object_agg(key, value),'{}'::jsonb) from public.app_config),
    'server_time', now()
  ) into r;
  return r;
end $function$;

-- public.admin_unban(p_uid uuid)  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.admin_unban(p_uid uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_admin() then return 'denied'; end if;
  update public.bans set until = now() where user_id = p_uid;
  return 'ok';
end $function$;

-- public.app_config_guard()  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.app_config_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.key <> old.key then raise exception 'config key cannot change'; end if;
  if new.key in ('min_version','latest_version') then
    if jsonb_typeof(new.value) <> 'string' or (new.value #>> '{}') !~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$' then raise exception 'version must look like 1.2.3'; end if;
  elsif new.key in ('motd','maintenance','store_url') then
    if jsonb_typeof(new.value) <> 'string' or char_length(new.value #>> '{}') > 300 then raise exception 'text up to 300 characters'; end if;
  elsif new.key = 'peer_server' then
    if jsonb_typeof(new.value) <> 'string' or char_length(new.value #>> '{}') > 200 or ((new.value #>> '{}') <> '' and (new.value #>> '{}') !~ '^wss://[A-Za-z0-9.-]+(:[0-9]{2,5})?(/[A-Za-z0-9._/-]*)?$') then raise exception 'multiplayer server must look like wss://host/path'; end if;
  elsif new.key = 'turn' then
    if jsonb_typeof(new.value) <> 'string' or char_length(new.value #>> '{}') > 300 or ((new.value #>> '{}') <> '' and (new.value #>> '{}') !~ '^(turns?:[A-Za-z0-9.-]+:[0-9]{2,5} [!-~]{1,100} [!-~]{1,100}|https://[A-Za-z0-9.-]+(/[!-~]*)?)$') then raise exception 'relay must look like turn:host:port user password, or an https link that gives relay logins'; end if;
  elsif new.key = 'features' then
    if jsonb_typeof(new.value) <> 'object' or exists(select 1 from jsonb_each(new.value) e where jsonb_typeof(e.value) <> 'boolean') then raise exception 'features are on/off switches'; end if;
  end if;
  new.updated_at := now();
  return new;
end $function$;

-- public.client_errors_guard()  security_definer=True  config=['search_path=""']  owner=postgres
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

-- public.econ_clamp(o jsonb, n jsonb, hrs numeric, is_ins boolean, OUT data jsonb, OUT flags jsonb)  security_definer=False  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.econ_clamp(o jsonb, n jsonb, hrs numeric, is_ins boolean, OUT data jsonb, OUT flags jsonb)
 RETURNS record
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare ov numeric; nv numeric; lim numeric; f text; base numeric; rate numeric; cap numeric; ins numeric; nt text;
begin
  data := coalesce(n, '{}'::jsonb); o := coalesce(o, '{}'::jsonb); flags := '[]'::jsonb;
  foreach f in array array['gp','xp','rp'] loop
    if f = 'gp' then base := 100000; rate := 150000; cap := 5000000; ins := 300000;
    elsif f = 'xp' then base := 20000; rate := 30000; cap := 1000000; ins := 300000;
    else base := 300; rate := 700; cap := 4000; ins := 1500; end if;
    if f = 'rp' then
      nt := jsonb_typeof(data #> '{rank,rp}');
      nv := case when nt = 'number' then (data #>> '{rank,rp}')::numeric end;
      ov := case when jsonb_typeof(o #> '{rank,rp}') = 'number' then (o #>> '{rank,rp}')::numeric else 0 end;
    else
      nt := jsonb_typeof(data -> f);
      nv := case when nt = 'number' then (data ->> f)::numeric end;
      ov := case when jsonb_typeof(o -> f) = 'number' then (o ->> f)::numeric else 0 end;
    end if;
    if nt is null then continue; end if;
    if is_ins then lim := ins; else lim := floor(ov + least(cap, base + rate * greatest(0, coalesce(hrs, 6)))); end if;
    if nv is null or nv > lim then
      if nv is null then lim := least(lim, ov); end if;
      flags := flags || jsonb_build_array(jsonb_build_object('f', f, 'o', ov, 'n', coalesce(nv, -1), 'k', lim));
      if f = 'rp' then
        data := jsonb_set(data, '{rank,rp}', to_jsonb(lim));
        if jsonb_typeof(data #> '{rank,best}') = 'number' and (data #>> '{rank,best}')::numeric > lim then
          data := jsonb_set(data, '{rank,best}', to_jsonb(lim));
        end if;
      else
        data := jsonb_set(data, array[f], to_jsonb(lim));
      end if;
    end if;
  end loop;
end $function$;

-- public.friend_remove(p_name text)  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.friend_remove(p_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid := auth.uid(); them uuid;
begin
  if me is null then raise exception 'sign in first'; end if;
  select id into them from public.players where lower(replace(name,' ','')) = lower(replace(coalesce(p_name,''),' ','')) limit 1;
  if them is null then return 'not_found'; end if;
  update public.friends set active = false where (user_id = me and friend_id = them) or (user_id = them and friend_id = me);
  return 'removed';
end $function$;

-- public.friend_request(p_name text)  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.friend_request(p_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid := auth.uid(); them uuid; n int;
begin
  if me is null then raise exception 'sign in first'; end if;
  select id into them from public.players where lower(replace(name,' ','')) = lower(replace(coalesce(p_name,''),' ','')) limit 1;
  if them is null then return 'not_found'; end if;
  if them = me then return 'self'; end if;
  if public.is_banned(me) then return 'banned'; end if;
  select count(*) into n from public.friends where user_id = me and active;
  if n >= 100 then return 'full'; end if;
  if exists (select 1 from public.friends where user_id = me and friend_id = them and active) then return 'exists'; end if;
  if exists (select 1 from public.friends where user_id = them and friend_id = me and status = 'pending' and active) then
    update public.friends set status = 'accepted' where user_id = them and friend_id = me;
    insert into public.friends(user_id, friend_id, status) values (me, them, 'accepted')
      on conflict (user_id, friend_id) do update set status = 'accepted', active = true;
    return 'accepted';
  end if;
  select count(*) into n from public.friends where user_id = me and status = 'pending' and created_at > now() - interval '1 hour';
  if n >= 20 then return 'slow_down'; end if;
  insert into public.friends(user_id, friend_id, status) values (me, them, 'pending')
    on conflict (user_id, friend_id) do update set status = 'pending', active = true, created_at = now();
  return 'sent';
end $function$;

-- public.friend_respond(p_name text, p_accept boolean)  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.friend_respond(p_name text, p_accept boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid := auth.uid(); them uuid;
begin
  if me is null then raise exception 'sign in first'; end if;
  select id into them from public.players where lower(replace(name,' ','')) = lower(replace(coalesce(p_name,''),' ','')) limit 1;
  if them is null then return 'not_found'; end if;
  if not exists (select 1 from public.friends where user_id = them and friend_id = me and status = 'pending' and active) then return 'no_request'; end if;
  if p_accept then
    update public.friends set status = 'accepted' where user_id = them and friend_id = me;
    insert into public.friends(user_id, friend_id, status) values (me, them, 'accepted')
      on conflict (user_id, friend_id) do update set status = 'accepted', active = true;
    return 'accepted';
  end if;
  update public.friends set active = false where user_id = them and friend_id = me;
  return 'declined';
end $function$;

-- public.friends_list()  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.friends_list()
 RETURNS TABLE(name text, status text, online boolean, room text, level integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (select auth.uid() id),
  rws as (
    select f.friend_id other, case when f.status = 'accepted' then 'friend' else 'outgoing' end st from public.friends f, me where f.user_id = me.id and f.active
    union all
    select f.user_id other, 'incoming' from public.friends f, me where f.friend_id = me.id and f.status = 'pending' and f.active
  )
  select p.name, r.st,
    (r.st = 'friend' and coalesce(pr.seen_at > now() - interval '2 minutes', false)),
    case when r.st = 'friend' and pr.seen_at > now() - interval '2 minutes' then pr.room end,
    public.lb_level(coalesce((p.data->>'xp')::numeric,0))::int
  from rws r join public.players p on p.id = r.other
  left join public.presence pr on pr.user_id = r.other
  where not public.is_banned(r.other)
  order by (r.st = 'incoming') desc, 3 desc, p.name
  limit 200
$function$;

-- public.invite_send(p_to text, p_code text, p_mode text)  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.invite_send(p_to text, p_code text, p_mode text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid := auth.uid(); t uuid; nm text; n int; md text;
begin
  if me is null then return 'login'; end if;
  if public.is_banned(me) then return 'banned'; end if;
  if p_code is null or upper(p_code) !~ '^[A-Z0-9]{4,8}$' then return 'code'; end if;
  select id into t from public.players where lower(replace(name,' ','')) = lower(replace(trim(coalesce(p_to,'')),' ','')) limit 1;
  if t is null then return 'nouser'; end if;
  if t = me then return 'self'; end if;
  select count(*) into n from public.invites where from_uid = me and created_at > now() - interval '1 hour';
  if n >= 30 then return 'limit'; end if;
  select name into nm from public.players where id = me;
  md := left(regexp_replace(coalesce(p_mode,''), '[^A-Za-z &]', '', 'g'), 24);
  insert into public.invites (to_uid, from_uid, from_name, code, mode) values (t, me, left(coalesce(nm, 'A friend'), 20), upper(p_code), md);
  return 'ok';
end $function$;

-- public.invites_push()  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.invites_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if exists (select 1 from public.push_subs where user_id = new.to_uid) then
    perform public.push_call(jsonb_build_object('op','invite','id',new.id));
  end if;
  return new;
end $function$;

-- public.is_admin()  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.admins where user_id = (select auth.uid()))
$function$;

-- public.is_banned(p uuid)  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.is_banned(p uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.bans b where b.user_id = p and (b.until is null or b.until > now()))
$function$;

-- public.keepalive()  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.keepalive()
 RETURNS timestamp with time zone
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  update public.heartbeat set at = now(), beats = beats + 1 where id = 1 and at < now() - interval '1 minute';
  select at from public.heartbeat where id = 1;
$function$;

-- public.lb_level(p_xp numeric)  security_definer=False  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.lb_level(p_xp numeric)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select least(55, 1 + floor((-2500 + sqrt(2500.0*2500 + 4000.0*greatest(0,coalesce(p_xp,0)))) / 2000.0))::int
$function$;

-- public.mp_check(p_token text, p_room text)  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.mp_check(p_token text, p_room text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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

-- public.mp_ticket(p_room text)  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.mp_ticket(p_room text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid := auth.uid(); t text; n int;
begin
  if me is null then return null; end if;
  if public.is_banned(me) then return 'banned'; end if;
  if p_room is null or upper(p_room) !~ '^[A-Z0-9]{4,8}$' then return null; end if;
  select count(*) into n from public.mp_tickets where user_id = me and created_at > now() - interval '1 hour';
  if n >= 120 then return null; end if;
  t := encode(extensions.gen_random_bytes(18), 'hex');
  insert into public.mp_tickets(token, user_id, room) values (t, me, upper(p_room));
  return t;
end $function$;

-- public.my_ban()  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.my_ban()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((select jsonb_build_object('banned', true, 'until', b.until) from public.bans b
    where b.user_id = auth.uid() and (b.until is null or b.until > now())), jsonb_build_object('banned', false))
$function$;

-- public.players_econ_guard()  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.players_econ_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rl text; r record; hrs numeric; x jsonb;
begin
  begin
    rl := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
    if rl in ('authenticated','anon') and not exists(select 1 from public.admins a where a.user_id = auth.uid()) then
      if tg_op = 'UPDATE' then hrs := extract(epoch from (now() - coalesce(old.econ_at, now() - interval '6 hours'))) / 3600; end if;
      select * into r from public.econ_clamp(case when tg_op = 'UPDATE' then old.data end, new.data, hrs, tg_op = 'INSERT');
      if jsonb_array_length(r.flags) > 0 then
        new.data := r.data;
        for x in select * from jsonb_array_elements(r.flags) loop
          insert into public.economy_flags(uid, field, old_v, new_v, kept) values (new.id, x->>'f', (x->>'o')::numeric, (x->>'n')::numeric, (x->>'k')::numeric);
        end loop;
      end if;
    end if;
  exception when others then null;
  end;
  new.econ_at := now();
  return new;
end $function$;

-- public.players_force_name()  security_definer=True  config=['search_path=""']  owner=postgres
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

-- public.players_keep_name()  security_definer=False  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.players_keep_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if lower(replace(new.name,' ','')) <> lower(replace(old.name,' ','')) and current_user <> 'service_role' then
    raise exception 'username cannot change';
  end if;
  return new;
end $function$;

-- public.presence_ping(p_room text)  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.presence_ping(p_room text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid := auth.uid();
begin
  if me is null then return; end if;
  insert into public.presence(user_id, seen_at, room) values (me, now(), nullif(left(regexp_replace(coalesce(p_room,''),'[^A-Za-z0-9]','','g'),8),''))
  on conflict (user_id) do update set seen_at = excluded.seen_at, room = excluded.room;
end $function$;

-- public.public_leaderboard(p_sort text, p_limit integer)  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.public_leaderboard(p_sort text DEFAULT 'xp'::text, p_limit integer DEFAULT 50)
 RETURNS TABLE(rank integer, name text, level integer, xp bigint, kills integer, deaths integer, wins integer, matches integer, best_streak integer, headshots integer, zombie_best integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with base as (
    select p.name,
      coalesce((p.data->>'xp')::numeric,0)::bigint xp,
      coalesce((p.data->'stats'->>'kills')::int,0) kills,
      coalesce((p.data->'stats'->>'deaths')::int,0) deaths,
      coalesce((p.data->'stats'->>'wins')::int,0) wins,
      coalesce((p.data->'stats'->>'matches')::int,0) matches,
      coalesce((p.data->'stats'->>'bestStreak')::int,0) best_streak,
      coalesce((p.data->'stats'->>'heads')::int,0) headshots,
      coalesce((p.data->'stats'->>'zbest')::int,0) zombie_best
    from public.players p
    where p.name is not null and length(p.name) > 0
      and p.name !~* '^gm-'
      and coalesce(p.data->>'hideLb','') not in ('1','true')
      and not exists (select 1 from public.admins a where a.user_id = p.id)
      and not public.is_banned(p.id)
  )
  select (row_number() over (order by
      case p_sort when 'kills' then b.kills when 'wins' then b.wins when 'streak' then b.best_streak when 'zombies' then b.zombie_best else null end desc nulls last,
      b.xp desc, b.name))::int,
    b.name, public.lb_level(b.xp), b.xp, b.kills, b.deaths, b.wins, b.matches, b.best_streak, b.headshots, b.zombie_best
  from base b where (b.matches > 0 or b.kills > 0 or b.xp > 0)
  order by 1
  limit least(greatest(coalesce(p_limit,50),1),100)
$function$;

-- public.push_call(p_body jsonb)  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.push_call(p_body jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tok text;
begin
  select cron_token into tok from public.push_keys where id = 1;
  if tok is null then return; end if;
  perform net.http_post(
    url := 'https://qnhogbwnumvounwpusmc.supabase.co/functions/v1/push',
    body := p_body,
    headers := jsonb_build_object('Content-Type','application/json','x-cron',tok),
    timeout_milliseconds := 20000);
exception when others then null;
end $function$;

-- public.ranked_leaderboard(p_limit integer)  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.ranked_leaderboard(p_limit integer DEFAULT 50)
 RETURNS TABLE(pos integer, name text, rp integer, best integer, games integer, level integer, me boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with base as (
    select p.id, p.name,
      greatest(0, coalesce((p.data #>> '{rank,rp}')::numeric, 0))::int rp,
      greatest(0, coalesce((p.data #>> '{rank,best}')::numeric, 0))::int best,
      greatest(0, coalesce((p.data #>> '{rank,n}')::numeric, 0))::int games,
      public.lb_level((p.data->>'xp')::numeric) lvl
    from public.players p
    where p.name is not null and length(p.name) > 0 and p.name !~* '^gm-'
      and jsonb_typeof(p.data #> '{rank,rp}') = 'number'
      and coalesce(p.data #>> '{rank,s}', '') = to_char(now() at time zone 'utc', 'YYYY-MM')
      and coalesce(p.data->>'hideLb','') not in ('1','true')
      and not exists (select 1 from public.admins a where a.user_id = p.id)
      and not public.is_banned(p.id)
  ), ranked as (
    select (row_number() over (order by b.rp desc, b.best desc, b.games, b.name))::int pos, b.* from base b where b.games > 0
  )
  select r.pos, r.name, r.rp, r.best, r.games, r.lvl, (r.id = auth.uid()) from ranked r
  where r.pos <= least(greatest(coalesce(p_limit,50),1),100) or r.id = auth.uid()
  order by r.pos
$function$;

-- public.referral_claim(p_ref text)  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.referral_claim(p_ref text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid := auth.uid(); rid uuid; made timestamptz; n int;
begin
  if me is null then return 'signin'; end if;
  if exists(select 1 from public.referrals where referee = me) then return 'done'; end if;
  select created_at into made from auth.users where id = me;
  if made is null or made < now() - interval '3 days' then return 'old'; end if;
  if coalesce(p_ref,'') = '' or length(p_ref) > 24 then return 'none'; end if;
  select id into rid from public.players where lower(replace(name,' ','')) = lower(replace(p_ref,' ','')) limit 1;
  if rid is null then return 'none'; end if;
  if rid = me then return 'self'; end if;
  if public.is_banned(rid) then return 'none'; end if;
  select count(*) into n from public.referrals where referrer = rid and created_at > now() - interval '30 days';
  insert into public.referrals(referrer, referee, paid_referrer) values (rid, me, n >= 10);
  return 'ok';
exception when unique_violation then return 'done';
end $function$;

-- public.referral_rewards()  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.referral_rewards()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid := auth.uid(); j int; fr jsonb;
begin
  if me is null then return '{"joined":0,"friends":[]}'::jsonb; end if;
  with u as (update public.referrals set paid_referee = true where referee = me and not paid_referee returning 1)
    select count(*) into j from u;
  with u as (update public.referrals r set paid_referrer = true where r.referrer = me and not r.paid_referrer returning r.referee)
    select coalesce(jsonb_agg(coalesce(p.name,'A friend')), '[]'::jsonb) into fr from u left join public.players p on p.id = u.referee;
  return jsonb_build_object('joined', j, 'friends', fr);
end $function$;

-- public.report_player(p_token text, p_room text, p_why text)  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.report_player(p_token text, p_room text, p_why text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid := auth.uid(); r record; nm text; mynm text;
begin
  if me is null then return 'login'; end if;
  select t.user_id, t.room into r from public.mp_tickets t where t.token = p_token and t.created_at > now() - interval '2 days';
  if r.user_id is null or r.room <> upper(coalesce(p_room,'')) then return 'unknown'; end if;
  if r.user_id = me then return 'self'; end if;
  select u.raw_app_meta_data->>'name' into nm from auth.users u where u.id = r.user_id;
  select u.raw_app_meta_data->>'name' into mynm from auth.users u where u.id = me;
  insert into public.support_messages(user_id, player_name, topic, message, reported_uid)
  values (me, left(coalesce(mynm,'Player'),20), 'report',
    left('Reported "' || coalesce(nm,'?') || '" in room ' || r.room || ': ' || coalesce(nullif(trim(p_why),''),'no details'), 2000), r.user_id);
  return 'ok';
end $function$;

-- public.room_remove()  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.room_remove()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  delete from public.rooms where host_uid = auth.uid();
$function$;

-- public.room_upsert(p_code text, p_host_name text, p_mode text, p_map text, p_players integer, p_max integer, p_locked boolean, p_state text, p_proto integer)  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.room_upsert(p_code text, p_host_name text, p_mode text, p_map text, p_players integer, p_max integer, p_locked boolean, p_state text, p_proto integer)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.room_upsert2(p_code, p_host_name, p_mode, p_map, p_players, p_max, p_locked, p_state, p_proto, 0);
$function$;

-- public.room_upsert2(p_code text, p_host_name text, p_mode text, p_map text, p_players integer, p_max integer, p_locked boolean, p_state text, p_proto integer, p_progress integer)  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.room_upsert2(p_code text, p_host_name text, p_mode text, p_map text, p_players integer, p_max integer, p_locked boolean, p_state text, p_proto integer, p_progress integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid := auth.uid(); nm text; md text; mp text;
begin
  if me is null then raise exception 'sign in first'; end if;
  if public.is_banned(me) then raise exception 'banned'; end if;
  select u.raw_app_meta_data->>'name' into nm from auth.users u where u.id = me;
  if nm is null or nm !~ '^[A-Za-z0-9_ .-]{1,20}$' then nm := 'Player'; end if;
  md := left(regexp_replace(coalesce(p_mode,''), '[^A-Za-z0-9 &''.:-]', '', 'g'), 24);
  mp := left(regexp_replace(coalesce(p_map,''), '[^A-Za-z0-9 &''.:-]', '', 'g'), 24);
  insert into public.rooms(code, host_uid, host_name, mode, map, players, max, locked, state, proto, progress)
  values (upper(p_code), me, nm, md, mp, p_players, p_max, coalesce(p_locked,false), p_state, p_proto, greatest(0, least(100, coalesce(p_progress,0))))
  on conflict (host_uid) do update set code = excluded.code, host_name = excluded.host_name, mode = excluded.mode, map = excluded.map,
    players = excluded.players, max = excluded.max, locked = excluded.locked, state = excluded.state, proto = excluded.proto, progress = excluded.progress;
end $function$;

-- public.rooms_touch()  security_definer=False  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.rooms_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin new.updated_at := now(); return new; end $function$;

-- public.server_now()  security_definer=False  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.server_now()
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select now() $function$;

-- public.signup_guard()  security_definer=True  config=['search_path=""']  owner=postgres
CREATE OR REPLACE FUNCTION public.signup_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select count(*) from auth.users where created_at > now() - interval '1 hour') >= 500 then
    raise exception 'too many new accounts right now, try again later';
  end if;
  return new;
end $function$;

-- public.support_rate_limit()  security_definer=True  config=['search_path=""']  owner=postgres
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

-- ---------- 10. Triggers ----------
DROP TRIGGER IF EXISTS signup_guard ON auth.users;
CREATE TRIGGER signup_guard BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.signup_guard();
DROP TRIGGER IF EXISTS app_config_guard ON public.app_config;
CREATE TRIGGER app_config_guard BEFORE UPDATE ON public.app_config FOR EACH ROW EXECUTE FUNCTION public.app_config_guard();
DROP TRIGGER IF EXISTS client_errors_guard ON public.client_errors;
CREATE TRIGGER client_errors_guard BEFORE INSERT ON public.client_errors FOR EACH ROW EXECUTE FUNCTION public.client_errors_guard();
DROP TRIGGER IF EXISTS invites_push ON public.invites;
CREATE TRIGGER invites_push AFTER INSERT ON public.invites FOR EACH ROW EXECUTE FUNCTION public.invites_push();
DROP TRIGGER IF EXISTS players_econ_guard ON public.players;
CREATE TRIGGER players_econ_guard BEFORE INSERT OR UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION public.players_econ_guard();
DROP TRIGGER IF EXISTS players_force_name ON public.players;
CREATE TRIGGER players_force_name BEFORE INSERT OR UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION public.players_force_name();
DROP TRIGGER IF EXISTS players_keep_name ON public.players;
CREATE TRIGGER players_keep_name BEFORE UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION public.players_keep_name();
DROP TRIGGER IF EXISTS rooms_touch ON public.rooms;
CREATE TRIGGER rooms_touch BEFORE INSERT OR UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.rooms_touch();
DROP TRIGGER IF EXISTS support_rate_limit ON public.support_messages;
CREATE TRIGGER support_rate_limit BEFORE INSERT ON public.support_messages FOR EACH ROW EXECUTE FUNCTION public.support_rate_limit();

-- ---------- 11. Row Level Security ----------
ALTER TABLE backup.snap DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_claim ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_claim FORCE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins FORCE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config FORCE ROW LEVEL SECURITY;
ALTER TABLE public.app_secret ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_errors FORCE ROW LEVEL SECURITY;
ALTER TABLE public.device_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE public.economy_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heartbeat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heartbeat FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites FORCE ROW LEVEL SECURITY;
ALTER TABLE public.mp_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players FORCE ROW LEVEL SECURITY;
ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms FORCE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages FORCE ROW LEVEL SECURITY;

-- ---------- 12. Policies ----------
DROP POLICY IF EXISTS "admin changes config" ON public.app_config;
CREATE POLICY "admin changes config" ON public.app_config AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));
DROP POLICY IF EXISTS "anyone reads config" ON public.app_config;
CREATE POLICY "anyone reads config" ON public.app_config AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "admin clears errors" ON public.client_errors;
CREATE POLICY "admin clears errors" ON public.client_errors AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT public.is_admin() AS is_admin));
DROP POLICY IF EXISTS "admin reads errors" ON public.client_errors;
CREATE POLICY "admin reads errors" ON public.client_errors AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));
DROP POLICY IF EXISTS "anyone can report an error" ON public.client_errors;
CREATE POLICY "anyone can report an error" ON public.client_errors AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "read my invites" ON public.invites;
CREATE POLICY "read my invites" ON public.invites AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = to_uid));
DROP POLICY IF EXISTS "remove my invites" ON public.invites;
CREATE POLICY "remove my invites" ON public.invites AS PERMISSIVE FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = to_uid));
DROP POLICY IF EXISTS "players insert own row" ON public.players;
CREATE POLICY "players insert own row" ON public.players AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = id));
DROP POLICY IF EXISTS "players read own row" ON public.players;
CREATE POLICY "players read own row" ON public.players AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = id));
DROP POLICY IF EXISTS "players update own row" ON public.players;
CREATE POLICY "players update own row" ON public.players AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = id)) WITH CHECK ((( SELECT auth.uid() AS uid) = id));
DROP POLICY IF EXISTS "push own delete" ON public.push_subs;
CREATE POLICY "push own delete" ON public.push_subs AS PERMISSIVE FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
DROP POLICY IF EXISTS "push own insert" ON public.push_subs;
CREATE POLICY "push own insert" ON public.push_subs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
DROP POLICY IF EXISTS "push own select" ON public.push_subs;
CREATE POLICY "push own select" ON public.push_subs AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
DROP POLICY IF EXISTS "push own update" ON public.push_subs;
CREATE POLICY "push own update" ON public.push_subs AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
DROP POLICY IF EXISTS "anyone sees live rooms" ON public.rooms;
CREATE POLICY "anyone sees live rooms" ON public.rooms AS PERMISSIVE FOR SELECT TO anon, authenticated USING ((updated_at > (now() - '00:01:00'::interval)));
DROP POLICY IF EXISTS "host lists own room" ON public.rooms;
CREATE POLICY "host lists own room" ON public.rooms AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "host removes own room" ON public.rooms;
CREATE POLICY "host removes own room" ON public.rooms AS PERMISSIVE FOR DELETE TO authenticated USING (false);
DROP POLICY IF EXISTS "host sees own room" ON public.rooms;
CREATE POLICY "host sees own room" ON public.rooms AS PERMISSIVE FOR SELECT TO authenticated USING (false);
DROP POLICY IF EXISTS "host updates own room" ON public.rooms;
CREATE POLICY "host updates own room" ON public.rooms AS PERMISSIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "admin clears messages" ON public.support_messages;
CREATE POLICY "admin clears messages" ON public.support_messages AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT public.is_admin() AS is_admin));
DROP POLICY IF EXISTS "admin reads messages" ON public.support_messages;
CREATE POLICY "admin reads messages" ON public.support_messages AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));
DROP POLICY IF EXISTS "anyone can send a message" ON public.support_messages;
CREATE POLICY "anyone can send a message" ON public.support_messages AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ---------- 13. Grants ----------
-- Table privileges for API roles (live state; NOTE anon/authenticated hold ALL on several tables, guarded only by RLS)
REVOKE ALL ON public.admin_claim FROM anon, authenticated, service_role;
GRANT ALL ON public.admin_claim TO service_role;
REVOKE ALL ON public.admins FROM anon, authenticated, service_role;
GRANT ALL ON public.admins TO service_role;
REVOKE ALL ON public.app_config FROM anon, authenticated, service_role;
GRANT SELECT ON public.app_config TO anon;
GRANT SELECT ON public.app_config TO authenticated;
GRANT ALL ON public.app_config TO service_role;
REVOKE ALL ON public.app_secret FROM anon, authenticated, service_role;
GRANT ALL ON public.app_secret TO anon;
GRANT ALL ON public.app_secret TO authenticated;
GRANT ALL ON public.app_secret TO service_role;
REVOKE ALL ON public.bans FROM anon, authenticated, service_role;
GRANT ALL ON public.bans TO anon;
GRANT ALL ON public.bans TO authenticated;
GRANT ALL ON public.bans TO service_role;
REVOKE ALL ON public.client_errors FROM anon, authenticated, service_role;
GRANT DELETE, SELECT ON public.client_errors TO authenticated;
GRANT ALL ON public.client_errors TO service_role;
REVOKE ALL ON public.device_keys FROM anon, authenticated, service_role;
GRANT ALL ON public.device_keys TO service_role;
REVOKE ALL ON public.economy_flags FROM anon, authenticated, service_role;
GRANT ALL ON public.economy_flags TO service_role;
REVOKE ALL ON public.friends FROM anon, authenticated, service_role;
GRANT ALL ON public.friends TO service_role;
REVOKE ALL ON public.heartbeat FROM anon, authenticated, service_role;
GRANT ALL ON public.heartbeat TO service_role;
REVOKE ALL ON public.invites FROM anon, authenticated, service_role;
GRANT MAINTAIN ON TABLE public.invites TO anon;
GRANT SELECT, DELETE, MAINTAIN ON TABLE public.invites TO authenticated;
GRANT ALL ON public.invites TO service_role;
REVOKE ALL ON public.mp_tickets FROM anon, authenticated, service_role;
GRANT ALL ON public.mp_tickets TO anon;
GRANT ALL ON public.mp_tickets TO authenticated;
GRANT ALL ON public.mp_tickets TO service_role;
REVOKE ALL ON public.players FROM anon, authenticated, service_role;
GRANT INSERT, SELECT ON public.players TO authenticated;
GRANT ALL ON public.players TO service_role;
REVOKE ALL ON public.presence FROM anon, authenticated, service_role;
GRANT ALL ON public.presence TO service_role;
REVOKE ALL ON public.push_keys FROM anon, authenticated, service_role;
GRANT ALL ON public.push_keys TO service_role;
REVOKE ALL ON public.push_subs FROM anon, authenticated, service_role;
GRANT ALL ON public.push_subs TO anon;
GRANT ALL ON public.push_subs TO authenticated;
GRANT ALL ON public.push_subs TO service_role;
REVOKE ALL ON public.referrals FROM anon, authenticated, service_role;
GRANT ALL ON public.referrals TO service_role;
REVOKE ALL ON public.rooms FROM anon, authenticated, service_role;
GRANT ALL ON public.rooms TO service_role;
REVOKE ALL ON public.support_messages FROM anon, authenticated, service_role;
GRANT DELETE, SELECT ON public.support_messages TO authenticated;
GRANT ALL ON public.support_messages TO service_role;

-- Column privileges (live). The table-level REVOKE ALL above strips these,
-- so they are granted again immediately after that block.
GRANT UPDATE (value) ON public.app_config TO authenticated;
GRANT INSERT (app_version, device, message, stack, where_) ON public.client_errors TO anon;
GRANT INSERT (app_version, device, message, stack, where_) ON public.client_errors TO authenticated;
GRANT UPDATE (data, id, name, updated_at) ON public.players TO authenticated;
GRANT SELECT (code, host_name, locked, map, max, mode, players, progress, proto, state, updated_at) ON public.rooms TO anon;
GRANT SELECT (code, host_name, locked, map, max, mode, players, progress, proto, state, updated_at) ON public.rooms TO authenticated;
GRANT INSERT (app_version, contact, device, message, player_name, topic) ON public.support_messages TO anon;
GRANT INSERT (app_version, contact, device, message, player_name, topic) ON public.support_messages TO authenticated;

-- Sequence privileges (live).
REVOKE ALL ON SEQUENCE public.client_errors_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public.client_errors_id_seq TO anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.device_keys_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public.device_keys_id_seq TO anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.economy_flags_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public.economy_flags_id_seq TO anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.invites_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public.invites_id_seq TO anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.referrals_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public.referrals_id_seq TO anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.support_messages_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public.support_messages_id_seq TO anon, authenticated, service_role;

-- backup.snap is postgres-only on live.
REVOKE ALL ON TABLE backup.snap FROM PUBLIC, anon, authenticated, service_role;

-- Function EXECUTE privileges (live ACLs)
REVOKE ALL ON FUNCTION backup.take() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_ban(p_uid uuid, p_days integer, p_reason text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ban(p_uid uuid, p_days integer, p_reason text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_bans() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bans() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_overview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_unban(p_uid uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unban(p_uid uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.app_config_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_config_guard() TO service_role;
REVOKE ALL ON FUNCTION public.client_errors_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_errors_guard() TO service_role;
REVOKE ALL ON FUNCTION public.econ_clamp(o jsonb, n jsonb, hrs numeric, is_ins boolean, OUT data jsonb, OUT flags jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.econ_clamp(o jsonb, n jsonb, hrs numeric, is_ins boolean, OUT data jsonb, OUT flags jsonb) TO PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.friend_remove(p_name text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.friend_remove(p_name text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.friend_request(p_name text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.friend_request(p_name text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.friend_respond(p_name text, p_accept boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.friend_respond(p_name text, p_accept boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.friends_list() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.friends_list() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.invite_send(p_to text, p_code text, p_mode text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invite_send(p_to text, p_code text, p_mode text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.invites_push() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invites_push() TO service_role;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_banned(p uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_banned(p uuid) TO service_role;
REVOKE ALL ON FUNCTION public.keepalive() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.keepalive() TO anon, service_role;
REVOKE ALL ON FUNCTION public.lb_level(p_xp numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lb_level(p_xp numeric) TO PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mp_check(p_token text, p_room text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mp_check(p_token text, p_room text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mp_ticket(p_room text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mp_ticket(p_room text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.my_ban() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_ban() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.players_econ_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.players_econ_guard() TO service_role;
REVOKE ALL ON FUNCTION public.players_force_name() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.players_force_name() TO service_role;
REVOKE ALL ON FUNCTION public.players_keep_name() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.players_keep_name() TO service_role;
REVOKE ALL ON FUNCTION public.presence_ping(p_room text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.presence_ping(p_room text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.public_leaderboard(p_sort text, p_limit integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_leaderboard(p_sort text, p_limit integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.push_call(p_body jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_call(p_body jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.ranked_leaderboard(p_limit integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ranked_leaderboard(p_limit integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.referral_claim(p_ref text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.referral_claim(p_ref text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.referral_rewards() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.referral_rewards() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.report_player(p_token text, p_room text, p_why text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_player(p_token text, p_room text, p_why text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.room_remove() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.room_remove() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.room_upsert(p_code text, p_host_name text, p_mode text, p_map text, p_players integer, p_max integer, p_locked boolean, p_state text, p_proto integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.room_upsert(p_code text, p_host_name text, p_mode text, p_map text, p_players integer, p_max integer, p_locked boolean, p_state text, p_proto integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.room_upsert2(p_code text, p_host_name text, p_mode text, p_map text, p_players integer, p_max integer, p_locked boolean, p_state text, p_proto integer, p_progress integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.room_upsert2(p_code text, p_host_name text, p_mode text, p_map text, p_players integer, p_max integer, p_locked boolean, p_state text, p_proto integer, p_progress integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.rooms_touch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rooms_touch() TO service_role;
REVOKE ALL ON FUNCTION public.server_now() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.server_now() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.signup_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signup_guard() TO service_role;
REVOKE ALL ON FUNCTION public.support_rate_limit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_rate_limit() TO service_role;

-- Default privileges in schema public (live, Supabase defaults): tables arwdDxtm, sequences rwU, functions X to anon/authenticated/service_role for owners postgres and supabase_admin.

-- ---------- 14. Realtime publications ----------
-- supabase_realtime exists with NO app tables; supabase_realtime_messages_publication covers realtime.messages_* partitions (Supabase-managed). Nothing to add.

-- ---------- 15. pg_cron jobs ----------
-- cubefront-retention is live (`41 3 * * *`, net.http_post to functions/v1/retention
-- with a Bearer service JWT) and is managed out of band. It is not scheduled
-- here. WO-16 re-adds it and reads the token from Vault.
SELECT cron.unschedule('cubefront-nightly-backup') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cubefront-nightly-backup');
SELECT cron.schedule('cubefront-nightly-backup', '23 3 * * *', $cron$select backup.take()$cron$);  -- active=True
SELECT cron.unschedule('push-hourly') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-hourly');
SELECT cron.schedule('push-hourly', '7 * * * *', $cron$select public.push_call('{"op":"cron"}'::jsonb)$cron$);  -- active=True
