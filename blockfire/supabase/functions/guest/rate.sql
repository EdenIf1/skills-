-- Guest-account rate limit for the edge function "guest".
-- Run once in the Supabase SQL editor (project blockfire, eu-central-1).
-- The SQL editor reloads the API schema. If counters are not found, run: notify pgrst, 'reload schema';
--
-- Stores a hash of the caller IP, not the address. Service role only (the edge function).
-- Do not put the Turnstile secret in this file. Set TURNSTILE_SECRET_KEY as an Edge Function secret.
--
-- After this succeeds, the public site key (not the secret) goes in app_config:
--   insert into public.app_config(key, value)
--   values ('turnstile_site_key', to_jsonb('YOUR_SITE_KEY'::text))
--   on conflict (key) do update set value = excluded.value, updated_at = now();

create table if not exists public.guest_rate (
  ip_hash text primary key check (ip_hash ~ '^[0-9a-f]{64}$'),
  hour_bucket timestamptz not null,
  hour_count integer not null check (hour_count >= 0),
  day_bucket date not null,
  day_count integer not null check (day_count >= 0)
);

alter table public.guest_rate enable row level security;
alter table public.guest_rate force row level security;
revoke all on table public.guest_rate from public, anon, authenticated;

create table if not exists public.guest_rate_global (
  hour_bucket timestamptz primary key,
  hour_count integer not null check (hour_count >= 0)
);

alter table public.guest_rate_global enable row level security;
alter table public.guest_rate_global force row level security;
revoke all on table public.guest_rate_global from public, anon, authenticated;

create or replace function public.guest_rate_hit(
  p_ip_hash text,
  p_hour_max integer,
  p_day_max integer,
  p_global_max integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hour timestamptz := date_trunc('hour', now());
  v_day date := (now() at time zone 'utc')::date;
  v_hc integer;
  v_dc integer;
  v_gc integer;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_ip');
  end if;
  if p_hour_max is null or p_day_max is null or p_global_max is null
     or p_hour_max < 1 or p_day_max < 1 or p_global_max < 1 then
    return jsonb_build_object('ok', false, 'error', 'bad_limit');
  end if;

  insert into public.guest_rate_global as g (hour_bucket, hour_count)
  values (v_hour, 1)
  on conflict (hour_bucket) do update
    set hour_count = g.hour_count + 1
  returning hour_count into v_gc;

  insert into public.guest_rate as r (ip_hash, hour_bucket, hour_count, day_bucket, day_count)
  values (p_ip_hash, v_hour, 1, v_day, 1)
  on conflict (ip_hash) do update set
    hour_bucket = v_hour,
    hour_count = case when r.hour_bucket = v_hour then r.hour_count + 1 else 1 end,
    day_bucket = v_day,
    day_count = case when r.day_bucket = v_day then r.day_count + 1 else 1 end
  returning hour_count, day_count into v_hc, v_dc;

  if v_gc = 1 then
    delete from public.guest_rate_global where hour_bucket < v_hour - interval '2 days';
    delete from public.guest_rate where day_bucket < (v_day - 2);
  end if;

  if v_gc > p_global_max or v_hc > p_hour_max or v_dc > p_day_max then
    return jsonb_build_object('ok', false, 'hour', v_hc, 'day', v_dc, 'global', v_gc);
  end if;
  return jsonb_build_object('ok', true, 'hour', v_hc, 'day', v_dc, 'global', v_gc);
end;
$$;

revoke all on function public.guest_rate_hit(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.guest_rate_hit(text, integer, integer, integer) to service_role;

comment on function public.guest_rate_hit(text, integer, integer, integer) is
  'Increments guest-account rate counters. Service role only. Called by the guest edge function.';

notify pgrst, 'reload schema';
