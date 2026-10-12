-- ===== players: one row per account, private to its owner =====
create table public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 14 and name ~ '^[A-Za-z0-9_ .-]+$'),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 200000),
  updated_at text not null default '' check (char_length(updated_at) <= 40),
  created_at timestamptz not null default now()
);
create unique index players_name_key on public.players (lower(replace(name, ' ', '')));
alter table public.players enable row level security;
alter table public.players force row level security;
revoke all on public.players from anon;
revoke all on public.players from authenticated;
grant select, insert, update (id, name, data, updated_at) on public.players to authenticated;
create policy "players read own row" on public.players for select to authenticated using ((select auth.uid()) = id);
create policy "players insert own row" on public.players for insert to authenticated with check ((select auth.uid()) = id);
create policy "players update own row" on public.players for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- players cannot rename themselves; only the server (claiming a guest account) may
create or replace function public.players_keep_name() returns trigger language plpgsql set search_path = '' as $$
begin
  if lower(replace(new.name,' ','')) <> lower(replace(old.name,' ','')) and current_user <> 'service_role' then
    raise exception 'username cannot change';
  end if;
  return new;
end $$;
create trigger players_keep_name before update on public.players for each row execute function public.players_keep_name();
revoke all on function public.players_keep_name() from public, anon, authenticated;

-- ===== app_config: remote settings, read-only for the game =====
create table public.app_config (key text primary key check (char_length(key) <= 40), value jsonb not null, updated_at timestamptz not null default now());
alter table public.app_config enable row level security;
alter table public.app_config force row level security;
revoke all on public.app_config from anon, authenticated;
grant select on public.app_config to anon, authenticated;
create policy "anyone reads config" on public.app_config for select to anon, authenticated using (true);
insert into public.app_config(key,value) values ('min_version','"1.0.0"'),('latest_version','"1.0.0"'),('store_url','""'),('maintenance','""'),('motd','""'),
  ('features','{"building":true,"crates":true,"multiplayer":true}');

-- ===== support_messages: send-only from the game and the support page =====
create table public.support_messages (
  id bigint generated always as identity primary key, created_at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  player_name text check (char_length(player_name) <= 20),
  topic text not null check (topic in ('bug','account','purchase','idea','report','other')),
  message text not null check (char_length(message) between 5 and 2000),
  contact text check (char_length(contact) <= 120), app_version text check (char_length(app_version) <= 20), device text check (char_length(device) <= 160));
alter table public.support_messages enable row level security;
alter table public.support_messages force row level security;
revoke all on public.support_messages from anon, authenticated;
grant insert (player_name, topic, message, contact, app_version, device) on public.support_messages to anon, authenticated;
create policy "anyone can send a message" on public.support_messages for insert to anon, authenticated with check (true);
create or replace function public.support_rate_limit() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.support_messages where created_at > now() - interval '1 hour'
      and ((new.user_id is not null and user_id = new.user_id) or (new.user_id is null and user_id is null and created_at > now() - interval '1 minute'))) >= 5 then
    raise exception 'too many messages, try again later';
  end if;
  return new;
end $$;
create trigger support_rate_limit before insert on public.support_messages for each row execute function public.support_rate_limit();
revoke all on function public.support_rate_limit() from public, anon, authenticated;

-- ===== client_errors: crash reports, write-only =====
create table public.client_errors (
  id bigint generated always as identity primary key, created_at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  app_version text check (char_length(app_version) <= 20), message text not null check (char_length(message) <= 400),
  stack text check (char_length(stack) <= 2000), where_ text check (char_length(where_) <= 60), device text check (char_length(device) <= 160));
alter table public.client_errors enable row level security;
alter table public.client_errors force row level security;
revoke all on public.client_errors from anon, authenticated;
grant insert (app_version, message, stack, where_, device) on public.client_errors to anon, authenticated;
create policy "anyone can report an error" on public.client_errors for insert to anon, authenticated with check (true);
create or replace function public.client_errors_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.client_errors where created_at > now() - interval '1 minute') >= 300 then return null; end if;
  return new;
end $$;
create trigger client_errors_guard before insert on public.client_errors for each row execute function public.client_errors_guard();
revoke all on function public.client_errors_guard() from public, anon, authenticated;

-- ===== admin (the game owner) =====
-- one admin; everything the admin can do is checked here, not in the game
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  one boolean not null default true unique check (one),
  created_at timestamptz not null default now());
alter table public.admins enable row level security;
alter table public.admins force row level security;
revoke all on public.admins from anon, authenticated;

-- the one-time admin code, stored only as a SHA-256 hash; service role only.
-- Insert your own hash by hand in the SQL editor; never commit it:
--   insert into public.admin_claim(code_hash) values ('<sha256 of your code>');
create table public.admin_claim (code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'));
alter table public.admin_claim enable row level security;
alter table public.admin_claim force row level security;
revoke all on public.admin_claim from anon, authenticated;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admins where user_id = (select auth.uid()))
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- remote game settings: only the admin may change them, and only with sane values
grant update (value) on public.app_config to authenticated;
create policy "admin changes config" on public.app_config for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create or replace function public.app_config_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.key <> old.key then raise exception 'config key cannot change'; end if;
  if new.key in ('min_version','latest_version') then
    if jsonb_typeof(new.value) <> 'string' or (new.value #>> '{}') !~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$' then raise exception 'version must look like 1.2.3'; end if;
  elsif new.key in ('motd','maintenance','store_url') then
    if jsonb_typeof(new.value) <> 'string' or char_length(new.value #>> '{}') > 300 then raise exception 'text up to 300 characters'; end if;
  elsif new.key = 'features' then
    if jsonb_typeof(new.value) <> 'object' or exists(select 1 from jsonb_each(new.value) e where jsonb_typeof(e.value) <> 'boolean') then raise exception 'features are on/off switches'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger app_config_guard before update on public.app_config for each row execute function public.app_config_guard();
revoke all on function public.app_config_guard() from public, anon, authenticated;

-- player messages and crash reports: only the admin can read and clear them
grant select, delete on public.support_messages to authenticated;
create policy "admin reads messages" on public.support_messages for select to authenticated using ((select public.is_admin()));
create policy "admin clears messages" on public.support_messages for delete to authenticated using ((select public.is_admin()));
grant select, delete on public.client_errors to authenticated;
create policy "admin reads errors" on public.client_errors for select to authenticated using ((select public.is_admin()));
create policy "admin clears errors" on public.client_errors for delete to authenticated using ((select public.is_admin()));

-- ===== "remember this phone" =====
-- a random key per device, stored only as a SHA-256 hash; service role only (edge function "device")
create table public.device_keys (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  label text check (char_length(label) <= 60),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now());
create index device_keys_user on public.device_keys(user_id);
alter table public.device_keys enable row level security;
alter table public.device_keys force row level security;
revoke all on public.device_keys from anon, authenticated;

-- ===== keep-alive: a daily GitHub Actions job (main branch, .github/workflows/supabase-keepalive.yml) calls this =====
-- so the free project never counts as inactive and is never paused
create table public.heartbeat (id int primary key check (id = 1), at timestamptz not null default now(), beats bigint not null default 0);
alter table public.heartbeat enable row level security;
alter table public.heartbeat force row level security;
revoke all on public.heartbeat from anon, authenticated;
insert into public.heartbeat(id) values (1);
create or replace function public.keepalive() returns timestamptz language sql security definer set search_path = '' as $$
  update public.heartbeat set at = now(), beats = beats + 1 where id = 1 and at < now() - interval '1 minute';
  select at from public.heartbeat where id = 1;
$$;
revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;

-- ===== active rooms (the in-game room list) =====
-- the host's phone refreshes its row every 15 s through room_upsert(); rows older than a minute are hidden.
-- One row per account. Room passwords are never stored here: the host's phone checks them itself.
create table public.rooms (
  code text primary key check (code ~ '^[A-Z0-9]{4,8}$'),
  host_uid uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  host_name text not null check (char_length(host_name) between 1 and 20),
  mode text not null check (char_length(mode) <= 24),
  map text not null check (char_length(map) <= 24),
  players int not null check (players between 1 and 24),
  max int not null check (max between 2 and 24),
  locked boolean not null default false,
  state text not null default 'lobby' check (state in ('lobby','playing')),
  proto int not null check (proto between 0 and 1000),
  updated_at timestamptz not null default now());
create index rooms_fresh on public.rooms (updated_at desc);
alter table public.rooms enable row level security;
alter table public.rooms force row level security;
revoke all on public.rooms from anon, authenticated;
grant select (code, host_name, mode, map, players, max, locked, state, proto, updated_at) on public.rooms to anon, authenticated;
create policy "anyone sees live rooms" on public.rooms for select to anon, authenticated using (updated_at > now() - interval '60 seconds');
create or replace function public.rooms_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger rooms_touch before insert or update on public.rooms for each row execute function public.rooms_touch();
revoke all on function public.rooms_touch() from public, anon, authenticated;
create or replace function public.room_upsert(p_code text, p_host_name text, p_mode text, p_map text, p_players int, p_max int, p_locked boolean, p_state text, p_proto int)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'sign in first'; end if;
  insert into public.rooms(code, host_uid, host_name, mode, map, players, max, locked, state, proto)
  values (upper(p_code), me, p_host_name, p_mode, p_map, p_players, p_max, coalesce(p_locked,false), p_state, p_proto)
  on conflict (host_uid) do update set code = excluded.code, host_name = excluded.host_name, mode = excluded.mode, map = excluded.map,
    players = excluded.players, max = excluded.max, locked = excluded.locked, state = excluded.state, proto = excluded.proto;
end $$;
create or replace function public.room_remove() returns void language sql security definer set search_path = '' as $$
  delete from public.rooms where host_uid = auth.uid();
$$;
revoke all on function public.room_upsert(text,text,text,text,int,int,boolean,text,int) from public, anon;
revoke all on function public.room_remove() from public, anon;
grant execute on function public.room_upsert(text,text,text,text,int,int,boolean,text,int) to authenticated;
grant execute on function public.room_remove() to authenticated;

-- ===== own multiplayer (PeerJS) server, switchable from the admin panel; empty = the free public one =====
insert into public.app_config(key, value) values ('peer_server', '""'::jsonb) on conflict (key) do nothing;
-- (app_config_guard also checks peer_server: empty or wss://host[:port]/path)
-- ===== invites: a player invites a friend by username; only the friend can read or remove it =====
create table if not exists public.invites (
  id bigint generated always as identity primary key,
  to_uid uuid not null references auth.users(id) on delete cascade,
  from_uid uuid not null references auth.users(id) on delete cascade,
  from_name text not null check (char_length(from_name) <= 20),
  code text not null check (code ~ '^[A-Z0-9]{4,8}$'),
  mode text check (char_length(mode) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists invites_to_uid on public.invites (to_uid);
create index if not exists invites_from_uid on public.invites (from_uid, created_at);
alter table public.invites enable row level security;
alter table public.invites force row level security;
revoke all on public.invites from anon, authenticated;
grant select, delete on public.invites to authenticated;
create policy "read my invites" on public.invites for select to authenticated using ((select auth.uid()) = to_uid);
create policy "remove my invites" on public.invites for delete to authenticated using ((select auth.uid()) = to_uid);
create or replace function public.invite_send(p_to text, p_code text, p_mode text) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); t uuid; nm text; n int;
begin
  if me is null then return 'login'; end if;
  if p_code is null or upper(p_code) !~ '^[A-Z0-9]{4,8}$' then return 'code'; end if;
  select id into t from public.players where lower(replace(name,' ','')) = lower(replace(trim(coalesce(p_to,'')),' ','')) limit 1;
  if t is null then return 'nouser'; end if;
  if t = me then return 'self'; end if;
  select count(*) into n from public.invites where from_uid = me and created_at > now() - interval '1 hour';
  if n >= 30 then return 'limit'; end if;
  select name into nm from public.players where id = me;
  insert into public.invites (to_uid, from_uid, from_name, code, mode) values (t, me, left(coalesce(nm, 'A friend'), 20), upper(p_code), left(p_mode, 40));
  return 'ok';
end $$;
revoke all on function public.invite_send(text, text, text) from public, anon;
grant execute on function public.invite_send(text, text, text) to authenticated;

-- ===== room list: how far the match is (0..100), so late joiners only get in before half time =====
alter table public.rooms add column if not exists progress int not null default 0 check (progress between 0 and 100);
grant select (progress) on public.rooms to anon, authenticated;
create or replace function public.room_upsert2(p_code text, p_host_name text, p_mode text, p_map text, p_players int, p_max int, p_locked boolean, p_state text, p_proto int, p_progress int)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'sign in first'; end if;
  insert into public.rooms(code, host_uid, host_name, mode, map, players, max, locked, state, proto, progress)
  values (upper(p_code), me, p_host_name, p_mode, p_map, p_players, p_max, coalesce(p_locked,false), p_state, p_proto, greatest(0, least(100, coalesce(p_progress,0))))
  on conflict (host_uid) do update set code = excluded.code, host_name = excluded.host_name, mode = excluded.mode, map = excluded.map,
    players = excluded.players, max = excluded.max, locked = excluded.locked, state = excluded.state, proto = excluded.proto, progress = excluded.progress;
end $$;
revoke all on function public.room_upsert2(text,text,text,text,int,int,boolean,text,int,int) from public, anon;
grant execute on function public.room_upsert2(text,text,text,text,int,int,boolean,text,int,int) to authenticated;
