-- Local proof for 20261020150000_server_economy.sql. Not applied to live.
-- Assumes the migration has just been applied in this session and auth.uid/auth.role
-- read request.jwt.claims. The extra UPDATE grant is only for this harness.

GRANT INSERT, SELECT, UPDATE ON public.players TO authenticated;

SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

INSERT INTO public.players (id, name, data, updated_at)
VALUES ('11111111-1111-1111-1111-111111111111', 'Ada', '{"gp":999999,"xp":999999,"owned":["rpg"],"map":"old"}'::jsonb, 'v0');

DO $t$
DECLARE
  d jsonb;
  ea timestamptz;
  i int;
  spent int;
  bought jsonb;
  opened jsonb;
  saved jsonb;
  xp bigint;
  rp int;
BEGIN
  SELECT data, econ_at, srv_xp INTO d, ea, xp FROM public.players WHERE id = '11111111-1111-1111-1111-111111111111';
  IF (d->>'gp')::int <> 1500 OR (d->>'xp')::int <> 0 OR d->>'map' <> 'old' OR xp <> 0 OR d -> 'owned' ? 'rpg' THEN
    RAISE EXCEPTION 'insert was not stripped: % xp %', d, xp;
  END IF;

  FOR i IN 1..12 LOOP
    UPDATE public.players
      SET data = data || jsonb_build_object('gp', 1000000 + i, 'xp', 500000 + i, 'crates', 40 + i, 'map', 'm' || i),
          srv_xp = 800000 + i,
          srv_rp = 4000 + i,
          econ_at = now()
    WHERE id = '11111111-1111-1111-1111-111111111111';
  END LOOP;
  SELECT data, econ_at, srv_xp, srv_rp INTO d, ea, xp, rp FROM public.players WHERE id = '11111111-1111-1111-1111-111111111111';
  IF (d->>'gp')::int <> 1500 OR (d->>'xp')::int <> 0 OR coalesce((d->>'crates')::int, 0) <> 0
     OR xp <> 0 OR rp <> 0 OR d->>'map' <> 'm12' OR ea IS NOT NULL THEN
    RAISE EXCEPTION 'save loop minted economy: gp % xp % crates % srv %/% econ_at %', d->>'gp', d->>'xp', d->>'crates', xp, rp, ea;
  END IF;

  INSERT INTO public.economy_stage (uid, data)
  VALUES (
    '11111111-1111-1111-1111-111111111111',
    (SELECT jsonb_set(jsonb_set(data, '{gp}', '200000'), '{xp}', '3500')
     FROM public.players WHERE id = '11111111-1111-1111-1111-111111111111'))
  ON CONFLICT (uid) DO UPDATE SET data = excluded.data;
  UPDATE public.players
    SET data = (SELECT s.data FROM public.economy_stage s WHERE s.uid = '11111111-1111-1111-1111-111111111111'),
        srv_xp = 3500
  WHERE id = '11111111-1111-1111-1111-111111111111';

  PERFORM set_config('economy.trusted', 'on', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.players SET data = jsonb_set(data, '{gp}', '999999'), srv_xp = 1
  WHERE id = '11111111-1111-1111-1111-111111111111';
  BEGIN
    INSERT INTO public.economy_stage (uid, data) VALUES ('11111111-1111-1111-1111-111111111111', '{"gp":1}'::jsonb);
    RAISE EXCEPTION 'authenticated inserted an economy stage';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('economy.trusted', 'off', true);
  SELECT data, srv_xp INTO d, xp FROM public.players WHERE id = '11111111-1111-1111-1111-111111111111';
  IF (d->>'gp')::int <> 200000 OR xp <> 3500 THEN
    RAISE EXCEPTION 'authenticated trusted flag bypassed the guard: % srv %', d->>'gp', xp;
  END IF;

  bought := public.buy_item('gun', 'm4a1', 'perm');
  IF coalesce((bought->>'ok')::boolean, false) IS NOT TRUE OR NOT ((bought->'econ'->'owned') ? 'm4a1') THEN
    RAISE EXCEPTION 'buy_item failed: %', bought;
  END IF;
  spent := (bought->>'spent')::int;
  IF spent NOT IN (70000, 52500) THEN
    RAISE EXCEPTION 'unexpected m4a1 price %', spent;
  END IF;
  IF (bought->'econ'->>'gp')::int <> 200000 - spent THEN
    RAISE EXCEPTION 'gp not charged';
  END IF;
  bought := public.buy_item('gun', 'm4a1', 'perm');
  IF bought->>'error' <> 'owned' THEN
    RAISE EXCEPTION 'second buy should be owned: %', bought;
  END IF;
  IF (public.buy_item('gun', 'awm', 'perm')->>'error') <> 'locked' THEN
    RAISE EXCEPTION 'awm should be locked at level 2';
  END IF;

  opened := public.open_crate();
  IF coalesce((opened->>'ok')::boolean, false) IS NOT TRUE OR (opened->'econ'->>'crates')::int <> 1 THEN
    RAISE EXCEPTION 'open_crate failed: %', opened;
  END IF;
  IF opened->>'paid' NOT IN ('gp', 'key', 'free') OR opened->'prize'->>'kind' IS NULL THEN
    RAISE EXCEPTION 'crate result missing: %', opened;
  END IF;

  UPDATE public.players
    SET data = jsonb_set(jsonb_set(data, '{owned}', '["rpg"]'::jsonb), '{crates}', '90'),
        srv_xp = 1, srv_rp = 1
  WHERE id = '11111111-1111-1111-1111-111111111111';
  SELECT data, srv_xp INTO d, xp FROM public.players WHERE id = '11111111-1111-1111-1111-111111111111';
  IF (d->>'crates')::int <> 1 OR NOT (d->'owned' ? 'm4a1') OR d->'owned' ? 'rpg' OR xp = 1 THEN
    RAISE EXCEPTION 'client overwrite of inventory stuck: crates % owned % srv %', d->>'crates', d->'owned', xp;
  END IF;

  saved := public.profile_save('{"gp":1,"xp":2,"map":"dock","hideLb":"1"}'::jsonb, '');
  IF coalesce((saved->>'ok')::boolean, false) IS NOT TRUE OR (saved->'data'->>'gp')::int = 1 OR saved->'data'->>'map' <> 'dock' THEN
    RAISE EXCEPTION 'profile_save wrote economy or dropped settings: %', saved;
  END IF;

  INSERT INTO public.economy_stage (uid, data)
  VALUES (
    '11111111-1111-1111-1111-111111111111',
    (SELECT jsonb_set(data, '{xp}', '1') FROM public.players WHERE id = '11111111-1111-1111-1111-111111111111'))
  ON CONFLICT (uid) DO UPDATE SET data = excluded.data;
  UPDATE public.players SET
    data = (SELECT s.data FROM public.economy_stage s WHERE s.uid = '11111111-1111-1111-1111-111111111111'),
    srv_xp = 9000,
    srv_matches = 3,
    srv_kills = 8,
    srv_rp = 120,
    srv_best = 140,
    srv_games = 4,
    srv_season = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM')
  WHERE id = '11111111-1111-1111-1111-111111111111';
END
$t$;

-- The block above set hideLb in a follow-up statement so the board is visible.
UPDATE public.players SET data = jsonb_set(data, '{hideLb}', '"0"')
WHERE id = '11111111-1111-1111-1111-111111111111';

DO $t$
DECLARE
  xp bigint;
  rp int;
  lvl int;
BEGIN
  SELECT l.xp, l.level INTO xp, lvl FROM public.public_leaderboard('xp', 10) l WHERE l.name = 'Ada';
  IF xp IS DISTINCT FROM 9000 OR lvl IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'public_leaderboard read client xp: xp % level %', xp, lvl;
  END IF;
  SELECT l.rp INTO rp FROM public.ranked_leaderboard(10) l WHERE l.name = 'Ada';
  IF rp IS DISTINCT FROM 120 THEN
    RAISE EXCEPTION 'ranked_leaderboard read client rp: %', rp;
  END IF;
END
$t$;
