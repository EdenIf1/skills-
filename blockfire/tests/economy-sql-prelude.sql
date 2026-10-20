-- Throwaway schema so the economy migration can be applied outside Supabase.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin') THEN CREATE ROLE supabase_admin NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
$$;

CREATE TABLE public.admins (user_id uuid PRIMARY KEY);
CREATE TABLE public.bans (user_id uuid PRIMARY KEY, until timestamptz);
CREATE FUNCTION public.is_banned(p uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT p IS NOT NULL AND false
$$;
CREATE FUNCTION public.lb_level(p_xp numeric)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT least(55, 1 + floor((-2500 + sqrt(2500.0 * 2500 + 4000.0 * greatest(0, coalesce(p_xp, 0)))) / 2000.0))::int
$$;

CREATE TABLE public.players (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  econ_at timestamptz,
  CONSTRAINT players_name_check CHECK (char_length(name) >= 2 AND char_length(name) <= 14 AND name ~ '^[A-Za-z0-9_ .-]+$'),
  CONSTRAINT players_updated_at_check CHECK (char_length(updated_at) <= 40),
  CONSTRAINT players_data_check CHECK (pg_column_size(data) < 200000)
);

CREATE FUNCTION public.players_econ_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  RETURN new;
END
$$;
CREATE TRIGGER players_econ_guard
  BEFORE INSERT OR UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.players_econ_guard();
