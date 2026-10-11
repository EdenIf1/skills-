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
