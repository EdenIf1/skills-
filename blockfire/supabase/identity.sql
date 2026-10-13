-- Cubefront: trusted identity in multiplayer, bans, reports that point to a real account.
-- Only additions and function replacements; nothing is dropped.
begin;
-- 1) the name and guest flag live where only the server can write (players can edit their own user_metadata)
update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb)
  || jsonb_build_object('name', raw_user_meta_data->>'name', 'guest', coalesce((raw_user_meta_data->>'guest')::boolean,false))
  where not (coalesce(raw_app_meta_data,'{}'::jsonb) ? 'name') and raw_user_meta_data ? 'name';

create or replace function public.players_force_name() returns trigger language plpgsql security definer set search_path = '' as $f$
declare nm text;
begin
  if coalesce(auth.role(), '') = 'service_role' then return new; end if;
  select u.raw_app_meta_data->>'name' into nm from auth.users u where u.id = new.id;
  if nm is not null and nm ~ '^[A-Za-z0-9_ .-]{2,14}$' then new.name := nm; end if;
  return new;
end $f$;

-- 2) bans (the owner decides; checked on every multiplayer door)
create table if not exists public.bans(
  user_id uuid primary key references auth.users(id) on delete cascade,
  until timestamptz,
  reason text check (char_length(reason) <= 200),
  created_at timestamptz not null default now());
alter table public.bans enable row level security;
create or replace function public.is_banned(p uuid) returns boolean language sql stable security definer set search_path = '' as $f$
  select exists(select 1 from public.bans b where b.user_id = p and (b.until is null or b.until > now()))
$f$;
revoke execute on function public.is_banned(uuid) from public, anon, authenticated;
create or replace function public.my_ban() returns jsonb language sql stable security definer set search_path = '' as $f$
  select coalesce((select jsonb_build_object('banned', true, 'until', b.until) from public.bans b
    where b.user_id = auth.uid() and (b.until is null or b.until > now())), jsonb_build_object('banned', false))
$f$;
revoke execute on function public.my_ban() from public, anon;
grant execute on function public.my_ban() to authenticated;

-- 3) room list: the host's checked name (server-only field), banned accounts cannot list rooms
create or replace function public.room_upsert2(p_code text, p_host_name text, p_mode text, p_map text, p_players integer, p_max integer, p_locked boolean, p_state text, p_proto integer, p_progress integer)
returns void language plpgsql security definer set search_path = '' as $f$
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
end $f$;

-- 4) invites: banned accounts cannot send; the mode text is plain letters only (no private messages hidden in it)
create or replace function public.invite_send(p_to text, p_code text, p_mode text) returns text language plpgsql security definer set search_path = '' as $f$
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
end $f$;

-- 5) room tickets: a player proves "I am this account" to one room only, without ever sharing who they are
create table if not exists public.mp_tickets(
  token text primary key check (token ~ '^[0-9a-f]{36}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  room text not null check (room ~ '^[A-Z0-9]{4,8}$'),
  created_at timestamptz not null default now());
create index if not exists mp_tickets_user on public.mp_tickets(user_id, created_at);
alter table public.mp_tickets enable row level security;
create table if not exists public.app_secret(id int primary key check (id = 1), s text not null);
alter table public.app_secret enable row level security;
insert into public.app_secret(id, s) values (1, encode(extensions.gen_random_bytes(32), 'hex')) on conflict (id) do nothing;

create or replace function public.mp_ticket(p_room text) returns text language plpgsql security definer set search_path = '' as $f$
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
end $f$;
revoke execute on function public.mp_ticket(text) from public, anon;
grant execute on function public.mp_ticket(text) to authenticated;

-- what a room learns from a ticket: the checked name, a private id that only means something inside this game
-- (for kicks and blocks), whether it is the game owner, and whether the account is banned. Never the account id.
create or replace function public.mp_check(p_token text, p_room text) returns jsonb language plpgsql stable security definer set search_path = '' as $f$
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
end $f$;
revoke execute on function public.mp_check(text, text) from public;
grant execute on function public.mp_check(text, text) to anon, authenticated;

-- 6) a report points to the real account (the owner sees who, the reporter never does)
alter table public.support_messages add column if not exists reported_uid uuid references auth.users(id) on delete set null;
create or replace function public.report_player(p_token text, p_room text, p_why text) returns text language plpgsql security definer set search_path = '' as $f$
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
end $f$;
revoke execute on function public.report_player(text, text, text) from public, anon;
grant execute on function public.report_player(text, text, text) to authenticated;

-- 7) the owner's tools: ban for N days (0 = for good) and lift a ban
create or replace function public.admin_ban(p_uid uuid, p_days integer, p_reason text) returns text language plpgsql security definer set search_path = '' as $f$
begin
  if not public.is_admin() then return 'denied'; end if;
  if p_uid is null or exists(select 1 from public.admins a where a.user_id = p_uid) then return 'no'; end if;
  insert into public.bans(user_id, until, reason) values (p_uid, case when coalesce(p_days,0) > 0 then now() + make_interval(days => p_days) end, left(coalesce(p_reason,''),200))
  on conflict (user_id) do update set until = excluded.until, reason = excluded.reason, created_at = now();
  return 'ok';
end $f$;
create or replace function public.admin_unban(p_uid uuid) returns text language plpgsql security definer set search_path = '' as $f$
begin
  if not public.is_admin() then return 'denied'; end if;
  update public.bans set until = now() where user_id = p_uid;
  return 'ok';
end $f$;
revoke execute on function public.admin_ban(uuid, integer, text) from public, anon;
revoke execute on function public.admin_unban(uuid) from public, anon;
grant execute on function public.admin_ban(uuid, integer, text) to authenticated;
grant execute on function public.admin_unban(uuid) to authenticated;
create or replace function public.admin_bans() returns table(user_id uuid, name text, until timestamptz, reason text, created_at timestamptz) language plpgsql stable security definer set search_path = '' as $f$
begin
  if not public.is_admin() then return; end if;
  return query select b.user_id, (u.raw_app_meta_data->>'name')::text, b.until, b.reason, b.created_at from public.bans b join auth.users u on u.id = b.user_id order by b.created_at desc limit 200;
end $f$;
revoke execute on function public.admin_bans() from public, anon;
grant execute on function public.admin_bans() to authenticated;
commit;
