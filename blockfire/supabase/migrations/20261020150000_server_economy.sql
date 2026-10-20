-- Server-authoritative economy.
-- Apply ONLY this file on the live project. Do not re-push 20261018000000_live_baseline.sql.
-- Builds on the live players_econ_guard / econ_clamp / economy_flags objects. Does not recreate
-- economy_flags or the guard trigger, and does not change grants on existing tables or functions.
-- Does not touch referral_*, server_now, backup.take, support, or TURN.
--
-- QC (live schema):
--   (1) A client insert/update cannot change any economy value. Only SECURITY DEFINER RPCs
--       that set economy.trusted, running as postgres/supabase_admin, can.
--   (2) The guard has no EXCEPTION handler. A failure rejects the write.
--   (3) Inventory lists and crate results are written only by buy_item and open_crate.
--   (4) public_leaderboard and ranked_leaderboard score from srv_* columns, not client JSON.
--
-- econ_at is no longer moved on a client save, and econ_clamp no longer grants base+rate*hours.
-- Admins are not exempt. service_role (the claim function) still passes through.
-- Apply this file in one transaction (supabase db push does). Disabling the guard and
-- enabling it again commit together, so client writes are not accepted while columns are added.

ALTER TABLE public.players DISABLE TRIGGER players_econ_guard;

-- ---------- helpers ----------

CREATE OR REPLACE FUNCTION public.economy_json_int(j jsonb, maxv integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT least(maxv, greatest(0, trunc(
    CASE
      WHEN j IS NULL OR jsonb_typeof(j) <> 'number' THEN 0
      WHEN (j #>> '{}')::numeric > maxv THEN maxv
      WHEN (j #>> '{}')::numeric < 0 THEN 0
      ELSE (j #>> '{}')::numeric
    END
  )))::integer
$function$;

CREATE OR REPLACE FUNCTION public.economy_json_bigint(j jsonb)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT least(9223372036854775807::numeric, greatest(0::numeric, trunc(
    CASE
      WHEN j IS NULL OR jsonb_typeof(j) <> 'number' THEN 0
      WHEN (j #>> '{}')::numeric > 9223372036854775807 THEN 9223372036854775807
      WHEN (j #>> '{}')::numeric < 0 THEN 0
      ELSE (j #>> '{}')::numeric
    END
  )))::bigint
$function$;

CREATE OR REPLACE FUNCTION public.economy_catalog()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT $catalog${"blank":{"gp":1500,"xp":0,"keys":0,"crates":0,"pity":{"e":0,"l":0},"owned":["ak47","p9"],"knives":["knife"],"camos":["none"],"skins":["std"],"hitfxs":[],"gearOwn":[],"equipOwn":["frag"],"blocks":["dirt"],"titles":["recruit"],"cards":["steel"],"killfxs":[],"charms":[],"attOwn":{"m4a1":["holo"]},"rent":{},"paid":{},"stars":{},"gk":{},"rank":null,"nadeLvl":1,"mineLvl":0,"bagLvl":0,"calls":0,"daily":null,"cal":null,"weekly":null,"season":null,"login":{"last":"","streak":0},"tutPaid":false,"refBonus":[]},"guns":[{"id":"ak47","req":1,"price":0,"name":"KV-47","cls":"weak"},{"id":"p9","req":1,"price":0,"name":"P9 Sidearm","cls":"weak"},{"id":"m4a1","req":2,"price":70000,"name":"MK-4","cls":"weak"},{"id":"mp5","req":3,"price":75000,"name":"PX-9","cls":"weak"},{"id":"viper9","req":4,"price":85000,"name":"Viper 9","cls":"weak"},{"id":"spas","req":5,"price":95000,"name":"Breaker 12","cls":"weak"},{"id":"deagle","req":5,"price":95000,"name":"Magnum .50","cls":"weak"},{"id":"scout","req":6,"price":110000,"name":"Scout Carbine","cls":"weak"},{"id":"hornet","req":7,"price":125000,"name":"Hornet SMG","cls":"weak"},{"id":"stinger","req":7,"price":125000,"name":"Stinger MP","cls":"weak"},{"id":"pug","req":8,"price":140000,"name":"Pug 12","cls":"weak"},{"id":"falcon","req":9,"price":155000,"name":"Falcon DMR","cls":"weak"},{"id":"brass","req":10,"price":175000,"name":"Brass Revolver","cls":"weak"},{"id":"m249","req":11,"price":195000,"name":"Rhino LMG","cls":"weak"},{"id":"duke","req":11,"price":195000,"name":"Duke .45","cls":"weak"},{"id":"ranger","req":12,"price":215000,"name":"Ranger LR","cls":"weak"},{"id":"raptor","req":13,"price":235000,"name":"Raptor AR","cls":"medium"},{"id":"cobra","req":14,"price":255000,"name":"Cobra SMG","cls":"medium"},{"id":"twin","req":14,"price":255000,"name":"Twin Vipers","cls":"medium"},{"id":"awm","req":15,"price":275000,"name":"Longbow .338","cls":"medium"},{"id":"warden","req":16,"price":300000,"name":"Warden AR","cls":"medium"},{"id":"vandal","req":17,"price":325000,"name":"Vandal SMG","cls":"medium"},{"id":"mauler","req":18,"price":345000,"name":"Mauler 20","cls":"medium"},{"id":"sabre","req":19,"price":370000,"name":"Sabre DMR","cls":"medium"},{"id":"thunder","req":20,"price":395000,"name":"Thunder Auto-12","cls":"medium"},{"id":"ironside","req":21,"price":420000,"name":"Ironside LMG","cls":"medium"},{"id":"wasp","req":22,"price":450000,"name":"Wasp PDW","cls":"medium"},{"id":"talon","req":23,"price":475000,"name":"Talon AR","cls":"medium"},{"id":"jackal","req":24,"price":505000,"name":"Jackal AR","cls":"medium"},{"id":"eagle","req":25,"price":530000,"name":"Iron Eagle","cls":"medium"},{"id":"hammer","req":26,"price":560000,"name":"Twin Hammer","cls":"medium"},{"id":"reaper","req":28,"price":615000,"name":"Reaper .50","cls":"medium"},{"id":"hawk","req":29,"price":645000,"name":"Hawk Bolt","cls":"medium"},{"id":"tempest","req":31,"price":705000,"name":"Tempest AR","cls":"epic"},{"id":"goliath","req":32,"price":740000,"name":"Goliath LMG","cls":"epic"},{"id":"banshee","req":33,"price":770000,"name":"Banshee SMG","cls":"epic"},{"id":"dragon","req":34,"price":800000,"name":"Dragon Duals","cls":"epic"},{"id":"striker","req":35,"price":835000,"name":"Striker AR","cls":"epic"},{"id":"titan","req":36,"price":865000,"name":"Titan LMG","cls":"epic"},{"id":"sunflare","req":37,"price":900000,"name":"Sunflare","cls":"epic"},{"id":"b7","req":38,"price":930000,"name":"B7 Bullpup","cls":"epic"},{"id":"judge","req":39,"price":965000,"name":"Judge Auto","cls":"epic"},{"id":"phantom","req":42,"price":1070000,"name":"Phantom Bolt","cls":"epic"},{"id":"nova","req":45,"price":1175000,"name":"Nova Pulse","cls":"epic"},{"id":"rpg","req":40,"price":1000000,"name":"Viper RL","cls":"epic"}],"knives":[{"id":"knife","req":1,"price":0,"name":"Combat Knife"},{"id":"machete","req":8,"price":140000,"name":"Machete"},{"id":"karambit","req":18,"price":345000,"name":"Karambit"}],"camos":[{"id":"none","price":0,"name":"Gunmetal","tier":0,"crate":false},{"id":"desert","price":12000,"name":"Desert","tier":2,"crate":false},{"id":"arctic","price":12000,"name":"Arctic","tier":2,"crate":false},{"id":"woodland","price":12000,"name":"Woodland","tier":2,"crate":false},{"id":"urban","price":15000,"name":"Urban","tier":2,"crate":false},{"id":"gold","price":150000,"name":"Gold","tier":4,"crate":false},{"id":"diamond","price":0,"name":"Diamond","tier":5,"crate":true},{"id":"dragon","price":0,"name":"Dragon","tier":3,"crate":true},{"id":"tiger","price":0,"name":"Tiger","tier":3,"crate":true},{"id":"digital","price":0,"name":"Digital","tier":3,"crate":true},{"id":"toxic","price":0,"name":"Toxic","tier":3,"crate":true},{"id":"frost","price":0,"name":"Frost","tier":3,"crate":true},{"id":"carbon","price":0,"name":"Carbon","tier":4,"crate":true},{"id":"neon","price":0,"name":"Neon","tier":4,"crate":true},{"id":"lava","price":0,"name":"Lava","tier":4,"crate":true},{"id":"galaxy","price":0,"name":"Galaxy","tier":4,"crate":true},{"id":"circuit","price":0,"name":"Circuit","tier":2,"crate":true},{"id":"cobalt","price":0,"name":"Cobalt Storm","tier":2,"crate":true},{"id":"rustwave","price":0,"name":"Rust Wave","tier":2,"crate":true},{"id":"sunset","price":0,"name":"Sunset Flow","tier":2,"crate":true},{"id":"plasma","price":0,"name":"Plasma Flow","tier":3,"crate":true},{"id":"dragonfire","price":0,"name":"Dragonfire","tier":3,"crate":true},{"id":"aurora","price":0,"name":"Aurora Flow","tier":3,"crate":true},{"id":"bloodmoon","price":0,"name":"Bloodmoon","tier":3,"crate":true},{"id":"goldflow","price":0,"name":"Gold Flow","tier":4,"crate":true},{"id":"holo","price":0,"name":"Hologram","tier":4,"crate":true},{"id":"obsidian","price":0,"name":"Obsidian","tier":4,"crate":true},{"id":"solar","price":0,"name":"Solar Flare","tier":4,"crate":true}],"skins":[{"id":"std","tier":0,"price":0,"name":"Standard Issue"},{"id":"arctic","tier":2,"price":90000,"name":"Arctic Ops"},{"id":"desert","tier":2,"price":90000,"name":"Desert Ranger"},{"id":"jungle","tier":2,"price":90000,"name":"Jungle Recon"},{"id":"urban","tier":2,"price":90000,"name":"Urban Shadow"},{"id":"astro","tier":2,"price":90000,"name":"Astronaut"},{"id":"pirate","tier":2,"price":90000,"name":"Sea Pirate"},{"id":"viking","tier":2,"price":90000,"name":"Frost Viking"},{"id":"mummy","tier":2,"price":90000,"name":"Mummy"},{"id":"night","tier":3,"price":220000,"name":"Night Stalker"},{"id":"hazmat","tier":3,"price":220000,"name":"Hazmat"},{"id":"crimson","tier":3,"price":220000,"name":"Crimson Guard"},{"id":"ninja","tier":3,"price":220000,"name":"Shadow Ninja"},{"id":"samurai","tier":3,"price":220000,"name":"Red Samurai"},{"id":"robot","tier":3,"price":220000,"name":"Steel Robot"},{"id":"alien","tier":3,"price":220000,"name":"Green Alien"},{"id":"tiger","tier":3,"price":220000,"name":"Jungle Tiger"},{"id":"gold","tier":4,"price":600000,"name":"Gold Elite"},{"id":"comet","tier":4,"price":600000,"name":"Captain Comet"},{"id":"cyber","tier":4,"price":600000,"name":"Neon Cyber"},{"id":"magma","tier":4,"price":600000,"name":"Magma Golem"}],"gear":[{"id":"h_basic","price":15000,"req":1,"name":"Combat Helmet","slot":"helmet"},{"id":"h_runner","price":30000,"req":6,"name":"Runner Cap","slot":"helmet"},{"id":"h_tank","price":60000,"req":12,"name":"Tank Helmet","slot":"helmet"},{"id":"g_basic","price":10000,"req":2,"name":"Grip Gloves","slot":"gloves"},{"id":"g_runner","price":25000,"req":7,"name":"Runner Gloves","slot":"gloves"},{"id":"g_tank","price":45000,"req":11,"name":"Tank Gauntlets","slot":"gloves"},{"id":"b_basic","price":12000,"req":3,"name":"Utility Belt","slot":"belt"},{"id":"b_runner","price":30000,"req":8,"name":"Runner Belt","slot":"belt"},{"id":"b_tank","price":45000,"req":13,"name":"Tank Belt","slot":"belt"},{"id":"s_basic","price":30000,"req":4,"name":"Plate Carrier","slot":"shirt"},{"id":"s_runner","price":55000,"req":9,"name":"Runner Jersey","slot":"shirt"},{"id":"s_tank","price":90000,"req":15,"name":"Tank Vest","slot":"shirt"},{"id":"p_basic","price":15000,"req":3,"name":"Leg Guards","slot":"pants"},{"id":"p_runner","price":40000,"req":10,"name":"Runner Pants","slot":"pants"},{"id":"p_tank","price":65000,"req":14,"name":"Tank Greaves","slot":"pants"},{"id":"f_basic","price":12000,"req":2,"name":"Combat Boots","slot":"shoes"},{"id":"f_runner","price":60000,"req":16,"name":"Runner Sneakers","slot":"shoes"},{"id":"f_tank","price":45000,"req":12,"name":"Tank Boots","slot":"shoes"},{"id":"n_legend","price":2500000,"req":20,"name":"Legend Dog Tag","slot":"necklace"}],"equips":[{"id":"frag","price":0,"req":1,"name":"Frag grenade"},{"id":"smoke","price":800,"req":2,"name":"Smoke grenade"},{"id":"fire","price":1200,"req":4,"name":"Fire grenade"},{"id":"flash","price":1500,"req":6,"name":"Flashbang"},{"id":"impact","price":2500,"req":12,"name":"Impact grenade"}],"blocks":[{"id":"dirt","price":0,"tier":1,"name":"Dirt","crate":false},{"id":"plank","price":800,"tier":1,"name":"Wood Planks","crate":false},{"id":"glass","price":1200,"tier":2,"name":"Glass","crate":false},{"id":"sand","price":1800,"tier":2,"name":"Sandbags","crate":false},{"id":"cobble","price":2600,"tier":2,"name":"Cobblestone","crate":false},{"id":"brick","price":3600,"tier":3,"name":"Brick","crate":false},{"id":"concrete","price":5500,"tier":3,"name":"Concrete","crate":false},{"id":"steel","price":9500,"tier":4,"name":"Steel Plate","crate":false},{"id":"ice","price":0,"tier":3,"name":"Ice","crate":true},{"id":"cargo","price":0,"tier":4,"name":"Cargo Red","crate":true},{"id":"cargob","price":0,"tier":4,"name":"Cargo Blue","crate":true},{"id":"gold","price":0,"tier":5,"name":"Gold Crate","crate":true}],"hits":[{"id":"red","t":0,"price":0,"name":"Classic Red"},{"id":"ember","t":1,"price":25000,"name":"Ember"},{"id":"toxic","t":2,"price":0,"name":"Toxic"},{"id":"ice","t":2,"price":0,"name":"Ice Shards"},{"id":"void","t":3,"price":0,"name":"Void"},{"id":"gold","t":4,"price":0,"name":"Liquid Gold"},{"id":"rainbow","t":5,"price":0,"name":"Rainbow"}],"titles":[{"id":"recruit","t":0,"name":"Recruit","col":false},{"id":"grunt","t":0,"name":"Grunt","col":false},{"id":"camper","t":0,"name":"Camper","col":false},{"id":"lucky","t":0,"name":"Lucky Shot","col":false},{"id":"builder","t":1,"name":"Builder","col":false},{"id":"night","t":1,"name":"Night Owl","col":false},{"id":"sharp","t":1,"name":"Sharpshooter","col":false},{"id":"demo","t":2,"name":"Demolisher","col":false},{"id":"ghost","t":2,"name":"Ghost","col":false},{"id":"hunter","t":2,"name":"Headhunter","col":false},{"id":"architect","t":2,"name":"Architect","col":false},{"id":"warlord","t":3,"name":"Warlord","col":false},{"id":"fortress","t":3,"name":"Fortress","col":false},{"id":"legend","t":4,"name":"Legend","col":false},{"id":"apex","t":4,"name":"Apex Predator","col":false},{"id":"immortal","t":5,"name":"Immortal","col":false}],"cards":[{"id":"steel","t":0,"name":"Steel"},{"id":"sand","t":0,"name":"Sandstorm"},{"id":"moss","t":0,"name":"Moss"},{"id":"ocean","t":1,"name":"Deep Ocean"},{"id":"ember","t":1,"name":"Ember"},{"id":"aurora","t":2,"name":"Aurora"},{"id":"toxic","t":2,"name":"Toxic"},{"id":"inferno","t":3,"name":"Inferno"},{"id":"galaxy","t":3,"name":"Galaxy"},{"id":"royal","t":4,"name":"Royal"},{"id":"prism","t":5,"name":"Prism"}],"fx":[{"id":"sparks","t":1,"name":"Sparks"},{"id":"confetti","t":2,"name":"Confetti"},{"id":"hearts","t":3,"name":"Love Taps"},{"id":"lightning","t":3,"name":"Lightning"},{"id":"goldrush","t":4,"name":"Gold Rush"},{"id":"void","t":4,"name":"Void"},{"id":"prism","t":5,"name":"Prism"}],"attPrice":{"mag":800,"grip":1000,"red":700,"holo":900,"acog":1500},"attOk":{"ak47":["mag","grip","red","holo","acog"],"m4a1":["mag","grip","red","holo","acog"],"mp5":["mag","grip","red","holo","acog"],"spas":["grip","red","holo","acog"],"m249":["mag","grip","red","holo","acog"],"awm":["mag","grip"],"deagle":["mag","red"],"p9":["mag","red"],"hornet":["mag","grip","red","holo"],"falcon":["mag","grip"],"raptor":["mag","grip","red","holo","acog"],"vandal":["mag","grip","red","holo","acog"],"thunder":["grip","red","holo","acog"],"talon":["mag","grip","red","holo","acog"],"hammer":["red"],"hawk":["mag","grip"],"goliath":["mag","grip","red","holo","acog"],"striker":["mag","grip","red","holo","acog"],"b7":["mag","grip","red","holo","acog"]},"dupe":[60,120,300,700,1800,5000],"rent":[{"k":"1d","d":1,"f":0.03},{"k":"3d","d":3,"f":0.07},{"k":"7d","d":7,"f":0.12},{"k":"30d","d":30,"f":0.3},{"k":"90d","d":90,"f":0.6},{"k":"perm","d":0,"f":1}],"cratePrice":900}$catalog$::jsonb
$function$;

CREATE OR REPLACE FUNCTION public.economy_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT ARRAY['gp','xp','keys','crates','pity','owned','knives','camos','skins','hitfxs','gearOwn','equipOwn','blocks','titles','cards','killfxs','charms','attOwn','rent','paid','stars','gk','rank','nadeLvl','mineLvl','bagLvl','calls','daily','cal','weekly','season','login','tutPaid','refBonus','armorOwn']::text[]
$function$;

CREATE OR REPLACE FUNCTION public.economy_free_att(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  own jsonb;
  arr jsonb;
  g text;
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN
    p := '{}'::jsonb;
  END IF;
  own := p -> 'attOwn';
  IF jsonb_typeof(own) IS DISTINCT FROM 'object' THEN
    own := '{}'::jsonb;
  END IF;
  arr := own -> 'm4a1';
  IF jsonb_typeof(arr) IS DISTINCT FROM 'array' THEN
    arr := '[]'::jsonb;
  END IF;
  IF NOT (arr ? 'holo') THEN
    arr := arr || '"holo"'::jsonb;
  END IF;
  own := jsonb_set(own, '{m4a1}', arr, true);
  FOREACH g IN ARRAY ARRAY['spas','thunder'] LOOP
    arr := own -> g;
    IF jsonb_typeof(arr) IS DISTINCT FROM 'array' THEN
      arr := '[]'::jsonb;
    END IF;
    IF NOT (arr ? 'red') THEN
      arr := arr || '"red"'::jsonb;
    END IF;
    own := jsonb_set(own, ARRAY[g], arr, true);
  END LOOP;
  RETURN jsonb_set(p, '{attOwn}', own, true);
END
$function$;

CREATE OR REPLACE FUNCTION public.economy_blank()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT public.economy_free_att(public.economy_catalog() -> 'blank')
$function$;

-- Untrusted write: keep the previous economy (starter on insert) and overlay only non-economy keys.
-- data.name is a paid rename and is kept from the old row on update.
CREATE OR REPLACE FUNCTION public.economy_protect(old_data jsonb, incoming jsonb, is_insert boolean)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  base jsonb;
  src jsonb := CASE WHEN jsonb_typeof(incoming) = 'object' THEN incoming ELSE '{}'::jsonb END;
  k text;
  keys text[] := public.economy_keys();
BEGIN
  IF coalesce(is_insert, false) THEN
    base := public.economy_blank();
  ELSE
    base := CASE WHEN jsonb_typeof(old_data) = 'object' THEN old_data ELSE '{}'::jsonb END;
  END IF;
  FOR k IN SELECT jsonb_object_keys(src) LOOP
    IF k = ANY (keys) THEN
      CONTINUE;
    END IF;
    IF NOT coalesce(is_insert, false) AND k = 'name' THEN
      CONTINUE;
    END IF;
    base := jsonb_set(base, ARRAY[k], src -> k, true);
  END LOOP;
  RETURN public.economy_free_att(base);
END
$function$;

CREATE OR REPLACE FUNCTION public.economy_slice(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  s jsonb := '{}'::jsonb;
  k text;
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN
    RETURN s;
  END IF;
  FOREACH k IN ARRAY public.economy_keys() LOOP
    IF p ? k THEN
      s := s || jsonb_build_object(k, p -> k);
    END IF;
  END LOOP;
  RETURN s;
END
$function$;

-- Same signature as live. No longer grants a per-save budget. Kept so existing callers cannot mint.
CREATE OR REPLACE FUNCTION public.econ_clamp(o jsonb, n jsonb, hrs numeric, is_ins boolean, OUT data jsonb, OUT flags jsonb)
RETURNS record
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
BEGIN
  IF coalesce(is_ins, false) THEN
    data := public.economy_protect(NULL, n, true);
  ELSE
    data := public.economy_protect(o, n, false);
  END IF;
  flags := '[]'::jsonb;
END
$function$;

-- Fail closed: no EXCEPTION handler. Client saves do not move econ_at and do not touch srv_*.
-- A session GUC is not trusted: this trigger is SECURITY DEFINER, so current_user is the owner
-- even for a client update. buy_item and open_crate stage the new JSON in economy_stage, which
-- authenticated cannot write. Any other insert/update keeps the previous economy.
CREATE OR REPLACE FUNCTION public.players_econ_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  staged jsonb;
BEGIN
  SELECT s.data INTO staged FROM public.economy_stage s WHERE s.uid = new.id;
  IF FOUND THEN
    new.data := staged;
    DELETE FROM public.economy_stage s WHERE s.uid = new.id;
    RETURN new;
  END IF;
  IF tg_op = 'INSERT' THEN
    new.data := public.economy_protect(NULL, new.data, true);
    new.srv_xp := 0;
    new.srv_rp := 0;
    new.srv_best := 0;
    new.srv_games := 0;
    new.srv_season := '';
    new.srv_kills := 0;
    new.srv_deaths := 0;
    new.srv_wins := 0;
    new.srv_matches := 0;
    new.srv_streak := 0;
    new.srv_heads := 0;
    new.srv_zbest := 0;
  ELSE
    new.data := public.economy_protect(old.data, new.data, false);
    new.srv_xp := old.srv_xp;
    new.srv_rp := old.srv_rp;
    new.srv_best := old.srv_best;
    new.srv_games := old.srv_games;
    new.srv_season := old.srv_season;
    new.srv_kills := old.srv_kills;
    new.srv_deaths := old.srv_deaths;
    new.srv_wins := old.srv_wins;
    new.srv_matches := old.srv_matches;
    new.srv_streak := old.srv_streak;
    new.srv_heads := old.srv_heads;
    new.srv_zbest := old.srv_zbest;
    new.econ_at := old.econ_at;
  END IF;
  RETURN new;
END
$function$;

-- ---------- server score columns (existing JSON is copied once; players.data is not rewritten) ----------

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS srv_xp bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srv_rp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srv_best integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srv_games integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srv_season text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS srv_kills integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srv_deaths integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srv_wins integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srv_matches integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srv_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srv_heads integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srv_zbest integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.economy_stage (
  uid uuid NOT NULL,
  data jsonb NOT NULL,
  CONSTRAINT economy_stage_pkey PRIMARY KEY (uid)
);
ALTER TABLE public.economy_stage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.economy_stage FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS economy_stage_owner ON public.economy_stage;
CREATE POLICY economy_stage_owner ON public.economy_stage
  FOR ALL TO postgres, supabase_admin
  USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.economy_stage FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.economy_meta (
  id integer NOT NULL,
  backfilled boolean NOT NULL DEFAULT false,
  CONSTRAINT economy_meta_pkey PRIMARY KEY (id),
  CONSTRAINT economy_meta_id_check CHECK (id = 1)
);

ALTER TABLE public.economy_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.economy_meta FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS economy_meta_owner ON public.economy_meta;
CREATE POLICY economy_meta_owner ON public.economy_meta
  FOR ALL TO postgres, supabase_admin
  USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.economy_meta FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.economy_meta (id, backfilled) VALUES (1, false) ON CONFLICT (id) DO NOTHING;

DO $backfill$
BEGIN
  IF NOT coalesce((SELECT m.backfilled FROM public.economy_meta m WHERE m.id = 1), false) THEN
    UPDATE public.players SET
      srv_xp = public.economy_json_bigint(data -> 'xp'),
      srv_rp = public.economy_json_int(data #> '{rank,rp}', 99999),
      srv_best = public.economy_json_int(data #> '{rank,best}', 99999),
      srv_games = public.economy_json_int(data #> '{rank,n}', 1000000),
      srv_season = left(coalesce(data #>> '{rank,s}', ''), 16),
      srv_kills = public.economy_json_int(data #> '{stats,kills}', 2000000000),
      srv_deaths = public.economy_json_int(data #> '{stats,deaths}', 2000000000),
      srv_wins = public.economy_json_int(data #> '{stats,wins}', 2000000000),
      srv_matches = public.economy_json_int(data #> '{stats,matches}', 2000000000),
      srv_streak = public.economy_json_int(data #> '{stats,bestStreak}', 2000000000),
      srv_heads = public.economy_json_int(data #> '{stats,heads}', 2000000000),
      srv_zbest = public.economy_json_int(data #> '{stats,zbest}', 2000000000);
    UPDATE public.economy_meta SET backfilled = true WHERE id = 1;
  END IF;
END
$backfill$;

ALTER TABLE public.players ENABLE TRIGGER players_econ_guard;

-- ---------- leaderboards: scores come from srv_* (hideLb remains the client opt-out) ----------

CREATE OR REPLACE FUNCTION public.public_leaderboard(p_sort text DEFAULT 'xp'::text, p_limit integer DEFAULT 50)
RETURNS TABLE(rank integer, name text, level integer, xp bigint, kills integer, deaths integer, wins integer, matches integer, best_streak integer, headshots integer, zombie_best integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  with base as (
    select p.name,
      p.srv_xp xp,
      p.srv_kills kills,
      p.srv_deaths deaths,
      p.srv_wins wins,
      p.srv_matches matches,
      p.srv_streak best_streak,
      p.srv_heads headshots,
      p.srv_zbest zombie_best
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

CREATE OR REPLACE FUNCTION public.ranked_leaderboard(p_limit integer DEFAULT 50)
RETURNS TABLE(pos integer, name text, rp integer, best integer, games integer, level integer, me boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  with base as (
    select p.id, p.name,
      p.srv_rp rp,
      p.srv_best best,
      p.srv_games games,
      public.lb_level(p.srv_xp) lvl
    from public.players p
    where p.name is not null and length(p.name) > 0 and p.name !~* '^gm-'
      and p.srv_season = to_char(now() at time zone 'utc', 'YYYY-MM')
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

-- ---------- item / crate writers ----------

CREATE OR REPLACE FUNCTION public.economy_find(p_kind text, p_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE
  cat jsonb := public.economy_catalog();
  key text;
  el jsonb;
  gun text;
  att text;
  ok jsonb;
BEGIN
  IF p_kind = 'att' THEN
    gun := split_part(p_id, '.', 1);
    att := split_part(p_id, '.', 2);
    IF gun = '' OR att = '' OR split_part(p_id, '.', 3) <> '' THEN
      RETURN NULL;
    END IF;
    ok := cat -> 'attOk' -> gun;
    IF ok IS NULL OR jsonb_typeof(ok) <> 'array' OR NOT ok ? att THEN
      RETURN NULL;
    END IF;
    IF cat -> 'attPrice' ->> att IS NULL THEN
      RETURN NULL;
    END IF;
    RETURN jsonb_build_object('id', p_id, 'price', (cat -> 'attPrice' ->> att)::integer, 'req', 1, 'name', att);
  END IF;
  key := CASE p_kind
    WHEN 'gun' THEN 'guns' WHEN 'knife' THEN 'knives' WHEN 'camo' THEN 'camos'
    WHEN 'skin' THEN 'skins' WHEN 'hit' THEN 'hits' WHEN 'gear' THEN 'gear'
    WHEN 'equip' THEN 'equips' WHEN 'blk' THEN 'blocks' ELSE NULL END;
  IF key IS NULL THEN
    RETURN NULL;
  END IF;
  FOR el IN SELECT value FROM jsonb_array_elements(cat -> key) LOOP
    IF el->>'id' = p_id THEN
      IF el ->> 'req' IS NULL THEN
        el := el || jsonb_build_object('req', 1);
      END IF;
      RETURN el;
    END IF;
  END LOOP;
  RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION public.economy_owns(p jsonb, p_kind text, p_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_kind = 'att' THEN coalesce(p #> ARRAY['attOwn', split_part(p_id, '.', 1)], '[]'::jsonb) ? split_part(p_id, '.', 2)
    ELSE coalesce(p -> CASE p_kind
      WHEN 'gun' THEN 'owned' WHEN 'knife' THEN 'knives' WHEN 'camo' THEN 'camos'
      WHEN 'skin' THEN 'skins' WHEN 'hit' THEN 'hitfxs' WHEN 'gear' THEN 'gearOwn'
      WHEN 'equip' THEN 'equipOwn' WHEN 'blk' THEN 'blocks'
      WHEN 'title' THEN 'titles' WHEN 'card' THEN 'cards' WHEN 'fx' THEN 'killfxs'
      WHEN 'charm' THEN 'charms' ELSE '' END, '[]'::jsonb) ? p_id
  END
$function$;

CREATE OR REPLACE FUNCTION public.economy_push(p jsonb, p_kind text, p_id text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  key text;
  arr jsonb;
  gun text;
  att text;
BEGIN
  IF p_kind = 'att' THEN
    gun := split_part(p_id, '.', 1);
    att := split_part(p_id, '.', 2);
    IF jsonb_typeof(p -> 'attOwn') IS DISTINCT FROM 'object' THEN
      p := jsonb_set(p, '{attOwn}', '{}'::jsonb, true);
    END IF;
    arr := p #> ARRAY['attOwn', gun];
    IF jsonb_typeof(arr) IS DISTINCT FROM 'array' THEN
      arr := '[]'::jsonb;
    END IF;
    IF NOT (arr ? att) THEN
      arr := arr || to_jsonb(att);
    END IF;
    RETURN jsonb_set(p, ARRAY['attOwn', gun], arr, true);
  END IF;
  key := CASE p_kind
    WHEN 'gun' THEN 'owned' WHEN 'knife' THEN 'knives' WHEN 'camo' THEN 'camos'
    WHEN 'skin' THEN 'skins' WHEN 'hit' THEN 'hitfxs' WHEN 'gear' THEN 'gearOwn'
    WHEN 'equip' THEN 'equipOwn' WHEN 'blk' THEN 'blocks'
    WHEN 'title' THEN 'titles' WHEN 'card' THEN 'cards' WHEN 'fx' THEN 'killfxs'
    WHEN 'charm' THEN 'charms' ELSE NULL END;
  IF key IS NULL THEN
    RETURN p;
  END IF;
  arr := p -> key;
  IF jsonb_typeof(arr) IS DISTINCT FROM 'array' THEN
    arr := '[]'::jsonb;
  END IF;
  IF NOT (arr ? p_id) THEN
    arr := arr || to_jsonb(p_id);
  END IF;
  RETURN jsonb_set(p, ARRAY[key], arr, true);
END
$function$;

CREATE OR REPLACE FUNCTION public.economy_deal(p jsonb, now_ms bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE
  cat jsonb := public.economy_catalog();
  lv integer := public.lb_level(public.economy_json_bigint(p -> 'xp'));
  day bigint := floor(now_ms / 86400000.0);
  idx bigint;
  n integer;
  pool jsonb := '[]'::jsonb;
  el jsonb;
BEGIN
  FOR el IN SELECT value FROM jsonb_array_elements(cat -> 'guns') LOOP
    IF coalesce((el->>'price')::numeric, 0) > 0 AND coalesce((el->>'req')::integer, 1) <= lv + 3 THEN
      pool := pool || jsonb_build_array(jsonb_build_object('kind', 'gun', 'id', el->>'id'));
    END IF;
  END LOOP;
  FOR el IN SELECT value FROM jsonb_array_elements(cat -> 'skins') LOOP
    IF coalesce((el->>'price')::numeric, 0) > 0 THEN
      pool := pool || jsonb_build_array(jsonb_build_object('kind', 'skin', 'id', el->>'id'));
    END IF;
  END LOOP;
  FOR el IN SELECT value FROM jsonb_array_elements(cat -> 'gear') LOOP
    IF coalesce((el->>'price')::numeric, 0) > 0
       AND coalesce((el->>'req')::integer, 1) <= lv + 3
       AND (el->>'price')::numeric < 1000000 THEN
      pool := pool || jsonb_build_array(jsonb_build_object('kind', 'gear', 'id', el->>'id'));
    END IF;
  END LOOP;
  FOR el IN SELECT value FROM jsonb_array_elements(cat -> 'camos') LOOP
    IF coalesce((el->>'price')::numeric, 0) > 0 THEN
      pool := pool || jsonb_build_array(jsonb_build_object('kind', 'camo', 'id', el->>'id'));
    END IF;
  END LOOP;
  n := jsonb_array_length(pool);
  IF n = 0 THEN
    RETURN NULL;
  END IF;
  idx := ((day + 7) * 2654435761) % 4294967296;
  RETURN pool -> (idx % n)::integer;
END
$function$;

CREATE OR REPLACE FUNCTION public.economy_cost(p jsonb, p_kind text, p_id text, p_dur text, now_ms bigint)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE
  item jsonb := public.economy_find(p_kind, p_id);
  price numeric;
  factor numeric;
  cost numeric;
  deal jsonb;
BEGIN
  IF item IS NULL THEN
    RETURN 0;
  END IF;
  price := coalesce((item->>'price')::numeric, 0);
  IF price <= 0 THEN
    RETURN 0;
  END IF;
  factor := CASE p_dur
    WHEN '1d' THEN 0.03 WHEN '3d' THEN 0.07 WHEN '7d' THEN 0.12
    WHEN '30d' THEN 0.3 WHEN '90d' THEN 0.6 ELSE 1 END;
  IF factor >= 1 THEN
    cost := price;
  ELSE
    cost := greatest(50, round((price * factor / 50.0)::numeric, 0) * 50);
  END IF;
  deal := public.economy_deal(p, now_ms);
  IF deal IS NOT NULL AND deal->>'kind' = p_kind AND deal->>'id' = p_id THEN
    cost := greatest(50, round((cost * 0.75 / 50.0)::numeric, 0) * 50);
  END IF;
  RETURN least(2000000000, greatest(0, trunc(cost)))::integer;
END
$function$;

CREATE OR REPLACE FUNCTION public.economy_grant_free(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE
  lv integer := public.lb_level(public.economy_json_bigint(p -> 'xp'));
  el jsonb;
BEGIN
  FOR el IN SELECT value FROM jsonb_array_elements(public.economy_catalog() -> 'guns') LOOP
    IF coalesce((el->>'price')::numeric, 0) = 0
       AND coalesce((el->>'req')::integer, 1) <= lv
       AND NOT public.economy_owns(p, 'gun', el->>'id') THEN
      p := public.economy_push(p, 'gun', el->>'id');
    END IF;
  END LOOP;
  RETURN p;
END
$function$;

CREATE OR REPLACE FUNCTION public.economy_crate_tier(p jsonb)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SET search_path TO ''
AS $function$
DECLARE
  e integer := public.economy_json_int(p #> '{pity,e}', 1000000);
  l integer := public.economy_json_int(p #> '{pity,l}', 1000000);
  r numeric;
  t integer;
  odds numeric[] := ARRAY[62, 22, 10.5, 4.2, 1.1, 0.2];
BEGIN
  IF l >= 79 THEN
    IF random() < (0.2 / 1.3) THEN
      RETURN 5;
    END IF;
    RETURN 4;
  END IF;
  IF e >= 29 THEN
    r := random() * 5.5;
    IF r <= 4.2 THEN RETURN 3; END IF;
    r := r - 4.2;
    IF r <= 1.1 THEN RETURN 4; END IF;
    RETURN 5;
  END IF;
  r := random() * 100;
  FOR t IN 0..5 LOOP
    r := r - odds[t + 1];
    IF r <= 0 THEN
      RETURN t;
    END IF;
  END LOOP;
  RETURN 0;
END
$function$;

CREATE OR REPLACE FUNCTION public.economy_crate_add(pool jsonb, p jsonb, kind text, id text, label text, tier integer, weight numeric)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT pool || jsonb_build_array(jsonb_build_object(
    'kind', kind,
    'v', CASE WHEN kind IN ('gp', 'xp', 'key') THEN to_jsonb(id::integer) ELSE to_jsonb(id) END,
    'label', label, 'tier', tier, 'w', weight,
    'dupe', kind NOT IN ('gp', 'xp', 'key') AND public.economy_owns(p, kind, id)
  ))
$function$;

CREATE OR REPLACE FUNCTION public.economy_crate_prize(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path TO ''
AS $function$
DECLARE
  cat jsonb := public.economy_catalog();
  tier integer;
  lv integer;
  pool jsonb := '[]'::jsonb;
  el jsonb;
  tot numeric := 0;
  r numeric;
  win jsonb;
  gp_vals integer[];
  gp_v integer;
  w numeric;
  camo_ids text[];
  skin_w numeric;
BEGIN
  IF NOT public.economy_owns(p, 'gear', 'n_legend') AND random() < 0.002 THEN
    RETURN jsonb_build_object('kind','gear','v','n_legend','label','Legend Dog Tag','tier',5,'w',1,'dupe',false);
  END IF;
  tier := public.economy_crate_tier(p);
  lv := public.lb_level(public.economy_json_bigint(p -> 'xp'));
  gp_vals := CASE tier
    WHEN 0 THEN ARRAY[100,150,200] WHEN 1 THEN ARRAY[400,600] WHEN 2 THEN ARRAY[1200]
    WHEN 3 THEN ARRAY[3000] WHEN 4 THEN ARRAY[7000] ELSE ARRAY[15000] END;
  w := CASE WHEN tier < 2 THEN 2 ELSE 1 END;
  FOREACH gp_v IN ARRAY gp_vals LOOP
    pool := public.economy_crate_add(pool, p, 'gp', gp_v::text, gp_v::text || ' GP', tier, w);
  END LOOP;
  IF tier <= 1 THEN
    gp_v := CASE WHEN tier = 0 THEN 60 ELSE 150 END;
    pool := public.economy_crate_add(pool, p, 'xp', gp_v::text, gp_v::text || ' XP', tier, 1);
  END IF;
  FOR el IN SELECT value FROM jsonb_array_elements(cat -> 'titles') LOOP
    IF coalesce((el->>'t')::integer, -1) = tier AND coalesce((el->>'col')::boolean, false) = false THEN
      pool := public.economy_crate_add(pool, p, 'title', el->>'id', 'Title: ' || coalesce(el->>'name', el->>'id'), tier, 1);
    END IF;
  END LOOP;
  FOR el IN SELECT value FROM jsonb_array_elements(cat -> 'cards') LOOP
    IF coalesce((el->>'t')::integer, -1) = tier THEN
      pool := public.economy_crate_add(pool, p, 'card', el->>'id', coalesce(el->>'name', el->>'id') || ' banner', tier, 1);
    END IF;
  END LOOP;
  FOR el IN SELECT value FROM jsonb_array_elements(cat -> 'fx') LOOP
    IF coalesce((el->>'t')::integer, -1) = tier THEN
      pool := public.economy_crate_add(pool, p, 'fx', el->>'id', coalesce(el->>'name', el->>'id') || ' kill effect', tier, 1);
    END IF;
  END LOOP;
  FOR el IN SELECT value FROM jsonb_array_elements(cat -> 'hits') LOOP
    IF tier >= 2 AND coalesce((el->>'t')::integer, -1) = tier THEN
      pool := public.economy_crate_add(pool, p, 'hit', el->>'id', coalesce(el->>'name', el->>'id') || ' hit color', tier, 1);
    END IF;
  END LOOP;
  FOR el IN SELECT value FROM jsonb_array_elements(cat -> 'blocks') LOOP
    IF el->>'id' <> 'dirt' AND coalesce((el->>'tier')::integer, 0) = tier THEN
      pool := public.economy_crate_add(pool, p, 'blk', el->>'id', coalesce(el->>'name', el->>'id') || ' blocks', tier, 1);
    END IF;
  END LOOP;
  IF tier = 1 THEN
    pool := public.economy_crate_add(pool, p, 'blk', 'plank', 'Wood Planks blocks', tier, 1);
    pool := public.economy_crate_add(pool, p, 'blk', 'glass', 'Glass blocks', tier, 1);
  ELSIF tier = 2 THEN
    camo_ids := ARRAY['desert','arctic','woodland','urban'];
    skin_w := 0.3;
  ELSIF tier = 3 THEN
    camo_ids := ARRAY['dragon','tiger','digital','toxic','frost'];
    skin_w := 0.4;
    pool := public.economy_crate_add(pool, p, 'knife', 'machete', 'Machete', tier, 1);
  ELSIF tier = 4 THEN
    camo_ids := ARRAY['carbon','neon','lava','galaxy'];
    pool := public.economy_crate_add(pool, p, 'knife', 'karambit', 'Karambit', tier, 1);
    FOR el IN SELECT value FROM jsonb_array_elements(cat -> 'guns') LOOP
      IF coalesce((el->>'price')::numeric, 0) > 0 AND coalesce((el->>'req')::integer, 1) <= lv + 10 THEN
        pool := public.economy_crate_add(pool, p, 'gun', el->>'id', coalesce(el->>'name', el->>'id'), tier, 1);
      END IF;
    END LOOP;
  ELSIF tier = 5 THEN
    pool := public.economy_crate_add(pool, p, 'skin', 'gold', 'Gold Elite skin', tier, 1);
    pool := public.economy_crate_add(pool, p, 'camo', 'gold', 'Gold camo', tier, 1);
    pool := public.economy_crate_add(pool, p, 'camo', 'diamond', 'Diamond camo', tier, 1);
  END IF;
  IF camo_ids IS NOT NULL THEN
    FOR el IN SELECT value FROM jsonb_array_elements(cat -> 'camos') LOOP
      IF el->>'id' = ANY (camo_ids) THEN
        pool := public.economy_crate_add(pool, p, 'camo', el->>'id', coalesce(el->>'name', el->>'id') || ' camo', tier, 1);
      END IF;
    END LOOP;
  END IF;
  IF skin_w IS NOT NULL THEN
    FOR el IN SELECT value FROM jsonb_array_elements(cat -> 'skins') LOOP
      IF coalesce((el->>'tier')::integer, -1) = tier THEN
        pool := public.economy_crate_add(pool, p, 'skin', el->>'id', coalesce(el->>'name', el->>'id') || ' skin', tier, skin_w);
      END IF;
    END LOOP;
  END IF;
  FOR el IN SELECT value FROM jsonb_array_elements(pool) LOOP
    tot := tot + coalesce((el->>'w')::numeric, 0);
  END LOOP;
  IF tot <= 0 THEN
    RETURN NULL;
  END IF;
  r := random() * tot;
  FOR el IN SELECT value FROM jsonb_array_elements(pool) LOOP
    r := r - coalesce((el->>'w')::numeric, 0);
    IF r <= 0 THEN
      win := el;
      EXIT;
    END IF;
  END LOOP;
  IF win IS NULL THEN
    win := pool -> 0;
  END IF;
  RETURN win - 'w';
END
$function$;

CREATE OR REPLACE FUNCTION public.economy_give(p jsonb, win jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE
  kind text := coalesce(win->>'kind', '');
  id text := coalesce(win->>'v', '');
  tier integer := public.economy_json_int(win -> 'tier', 5);
  dupe boolean := coalesce((win->>'dupe')::boolean, false);
  rent_key text := kind || ':' || id;
  note text := '';
  gp integer;
  dupe_gp integer;
  cat jsonb;
  el jsonb;
  slot text := '';
BEGIN
  IF dupe AND jsonb_typeof(p -> 'rent') = 'object' AND p -> 'rent' ? rent_key THEN
    p := jsonb_set(p, '{rent}', (p -> 'rent') - rent_key, true);
    note := 'Yours forever now (was a rental)';
  ELSIF dupe AND kind NOT IN ('gp', 'xp', 'key') THEN
    cat := public.economy_catalog();
    dupe_gp := coalesce((cat -> 'dupe' -> least(5, greatest(0, tier)))::integer, 0);
    gp := public.economy_json_int(p -> 'gp', 2000000000);
    p := jsonb_set(p, '{gp}', to_jsonb(least(2000000000, gp + dupe_gp)), true);
    note := 'Duplicate · +' || dupe_gp::text || ' GP';
  ELSIF kind = 'gp' THEN
    gp := public.economy_json_int(p -> 'gp', 2000000000);
    p := jsonb_set(p, '{gp}', to_jsonb(least(2000000000, gp + public.economy_json_int(to_jsonb(id::numeric), 2000000000))), true);
  ELSIF kind = 'xp' THEN
    gp := public.economy_json_int(p -> 'xp', 2000000000);
    p := jsonb_set(p, '{xp}', to_jsonb(least(2000000000, gp + public.economy_json_int(to_jsonb(id::numeric), 2000000000))), true);
    p := public.economy_grant_free(p);
  ELSIF kind = 'key' THEN
    gp := public.economy_json_int(p -> 'keys', 2000000000);
    p := jsonb_set(p, '{keys}', to_jsonb(least(2000000000, gp + public.economy_json_int(to_jsonb(id::numeric), 2000000000))), true);
  ELSIF kind = 'gear' THEN
    p := public.economy_push(p, 'gear', id);
    FOR el IN SELECT value FROM jsonb_array_elements(public.economy_catalog() -> 'gear') LOOP
      IF el->>'id' = id THEN
        slot := coalesce(el->>'slot', '');
      END IF;
    END LOOP;
    IF slot <> '' THEN
      IF jsonb_typeof(p -> 'gear') IS DISTINCT FROM 'object' THEN
        p := jsonb_set(p, '{gear}', '{}'::jsonb, true);
      END IF;
      IF coalesce(p #>> ARRAY['gear', slot], '') = '' THEN
        p := jsonb_set(p, ARRAY['gear', slot], to_jsonb(id), true);
      END IF;
    END IF;
  ELSE
    p := public.economy_push(p, kind, id);
  END IF;
  RETURN jsonb_build_object('data', p, 'note', note);
END
$function$;

-- Internal writer. Rejects unless buy_item or open_crate set economy.writer in this transaction.
CREATE OR REPLACE FUNCTION public.economy_put(p_uid uuid, p_data jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  stamp text;
BEGIN
  IF current_setting('economy.writer', true) NOT IN ('buy', 'crate') THEN
    RAISE EXCEPTION 'economy writer is not buy_item or open_crate';
  END IF;
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'economy_put owner';
  END IF;
  IF p_uid IS DISTINCT FROM auth.uid() AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'economy_put caller';
  END IF;
  IF jsonb_typeof(p_data) <> 'object' THEN
    RAISE EXCEPTION 'economy_put data';
  END IF;
  INSERT INTO public.economy_stage (uid, data) VALUES (p_uid, p_data)
    ON CONFLICT (uid) DO UPDATE SET data = excluded.data;
  stamp := to_char(clock_timestamp() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  UPDATE public.players SET
    data = p_data,
    updated_at = stamp,
    srv_xp = public.economy_json_bigint(p_data -> 'xp'),
    srv_rp = public.economy_json_int(p_data #> '{rank,rp}', 99999),
    srv_best = public.economy_json_int(p_data #> '{rank,best}', 99999),
    srv_games = public.economy_json_int(p_data #> '{rank,n}', 1000000),
    srv_season = left(coalesce(p_data #>> '{rank,s}', ''), 16)
  WHERE id = p_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'economy_put missing profile';
  END IF;
  RETURN stamp;
END
$function$;

CREATE OR REPLACE FUNCTION public.buy_item(p_kind text, p_id text, p_dur text DEFAULT 'perm')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  me uuid := auth.uid();
  row public.players;
  p jsonb;
  item jsonb;
  rent_key text;
  rent jsonb;
  owned boolean;
  has_rent boolean;
  dur text := coalesce(p_dur, 'perm');
  days integer;
  cost integer;
  gp integer;
  now_ms bigint;
  prev_e bigint;
  prev_d bigint;
  prev_paid integer;
  add_ms bigint;
  stamp text;
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'signin');
  END IF;
  IF public.is_banned(me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'banned');
  END IF;
  IF p_kind IS NULL OR p_kind !~ '^(gun|knife|camo|skin|hit|gear|equip|blk|att)$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'item');
  END IF;
  IF p_id IS NULL OR p_id !~ '^[a-z0-9_.]{1,40}$' OR (p_kind <> 'att' AND position('.' IN p_id) > 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'item');
  END IF;
  IF dur !~ '^(1d|3d|7d|30d|90d|perm)$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dur');
  END IF;
  SELECT * INTO row FROM public.players WHERE id = me FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile');
  END IF;
  p := row.data;
  item := public.economy_find(p_kind, p_id);
  IF item IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'item');
  END IF;
  IF coalesce((item->>'price')::numeric, 0) <= 0
     OR coalesce((item->>'req')::integer, 1) > public.lb_level(public.economy_json_bigint(p -> 'xp')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'locked');
  END IF;
  owned := public.economy_owns(p, p_kind, p_id);
  rent_key := p_kind || ':' || p_id;
  rent := p -> 'rent' -> rent_key;
  has_rent := jsonb_typeof(rent) = 'object' AND coalesce((rent->>'e')::numeric, 0) > 0;
  IF owned AND NOT has_rent THEN
    RETURN jsonb_build_object('ok', false, 'error', 'owned');
  END IF;
  now_ms := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  cost := public.economy_cost(p, p_kind, p_id, dur, now_ms);
  gp := public.economy_json_int(p -> 'gp', 2000000000);
  IF gp < cost THEN
    RETURN jsonb_build_object('ok', false, 'error', 'gp');
  END IF;
  p := jsonb_set(p, '{gp}', to_jsonb(gp - cost), true);
  IF dur = 'perm' THEN
    IF jsonb_typeof(p -> 'rent') = 'object' THEN
      p := jsonb_set(p, '{rent}', (p -> 'rent') - rent_key, true);
    END IF;
    IF jsonb_typeof(p -> 'paid') IS DISTINCT FROM 'object' THEN
      p := jsonb_set(p, '{paid}', '{}'::jsonb, true);
    END IF;
    p := jsonb_set(p, ARRAY['paid', rent_key], to_jsonb(cost), true);
  ELSE
    days := CASE dur WHEN '1d' THEN 1 WHEN '3d' THEN 3 WHEN '7d' THEN 7 WHEN '30d' THEN 30 ELSE 90 END;
    IF jsonb_typeof(p -> 'rent') IS DISTINCT FROM 'object' THEN
      p := jsonb_set(p, '{rent}', '{}'::jsonb, true);
    END IF;
    prev_e := CASE WHEN has_rent THEN trunc((rent->>'e')::numeric)::bigint ELSE now_ms END;
    prev_d := CASE WHEN has_rent THEN trunc(coalesce((rent->>'d')::numeric, 0))::bigint ELSE 0 END;
    prev_paid := CASE WHEN has_rent THEN public.economy_json_int(rent -> 'p', 2000000000) ELSE 0 END;
    IF prev_e < now_ms THEN
      prev_e := now_ms;
    END IF;
    add_ms := days::bigint * 86400000;
    p := jsonb_set(p, ARRAY['rent', rent_key], jsonb_build_object('e', prev_e + add_ms, 'd', prev_d + add_ms, 'p', prev_paid + cost), true);
    IF jsonb_typeof(p -> 'paid') = 'object' THEN
      p := jsonb_set(p, '{paid}', (p -> 'paid') - rent_key, true);
    END IF;
  END IF;
  IF NOT owned THEN
    p := public.economy_push(p, p_kind, p_id);
  END IF;
  PERFORM set_config('economy.writer', 'buy', true);
  stamp := public.economy_put(me, p);
  RETURN jsonb_build_object(
    'ok', true, 'spent', cost, 'name', coalesce(item->>'name', p_id),
    'rent', dur <> 'perm', 'updated_at', stamp, 'econ', public.economy_slice(p));
END
$function$;

CREATE OR REPLACE FUNCTION public.open_crate()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  me uuid := auth.uid();
  row public.players;
  p jsonb;
  how text;
  win jsonb;
  given jsonb;
  note text;
  tier integer;
  e integer;
  l integer;
  stamp text;
  price integer := coalesce((public.economy_catalog() ->> 'cratePrice')::integer, 900);
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'signin');
  END IF;
  IF public.is_banned(me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'banned');
  END IF;
  SELECT * INTO row FROM public.players WHERE id = me FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile');
  END IF;
  p := row.data;
  IF p #>> '{daily,freeCrate}' = 'true' THEN
    p := jsonb_set(p, '{daily,freeCrate}', 'false'::jsonb, true);
    how := 'free';
  ELSIF public.economy_json_int(p -> 'keys', 2000000000) > 0 THEN
    p := jsonb_set(p, '{keys}', to_jsonb(public.economy_json_int(p -> 'keys', 2000000000) - 1), true);
    how := 'key';
  ELSIF public.economy_json_int(p -> 'gp', 2000000000) < price THEN
    RETURN jsonb_build_object('ok', false, 'error', 'gp');
  ELSE
    p := jsonb_set(p, '{gp}', to_jsonb(public.economy_json_int(p -> 'gp', 2000000000) - price), true);
    how := 'gp';
  END IF;
  win := public.economy_crate_prize(p);
  IF win IS NULL THEN
    RAISE EXCEPTION 'crate pool empty';
  END IF;
  tier := public.economy_json_int(win -> 'tier', 5);
  e := public.economy_json_int(p #> '{pity,e}', 1000000);
  l := public.economy_json_int(p #> '{pity,l}', 1000000);
  IF tier >= 3 THEN e := 0; ELSE e := e + 1; END IF;
  IF tier >= 4 THEN l := 0; ELSE l := l + 1; END IF;
  p := jsonb_set(p, '{pity}', jsonb_build_object('e', e, 'l', l), true);
  p := jsonb_set(p, '{crates}', to_jsonb(public.economy_json_int(p -> 'crates', 2000000000) + 1), true);
  given := public.economy_give(p, win);
  p := given -> 'data';
  note := coalesce(given->>'note', '');
  PERFORM set_config('economy.writer', 'crate', true);
  stamp := public.economy_put(me, p);
  RETURN jsonb_build_object(
    'ok', true, 'prize', win, 'note', note, 'paid', how,
    'updated_at', stamp, 'econ', public.economy_slice(p));
END
$function$;

-- Settings save. Does not set economy.trusted, so the guard freezes every economy key and every srv_* column.
CREATE OR REPLACE FUNCTION public.profile_save(p_data jsonb, p_ver text DEFAULT ''::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  me uuid := auth.uid();
  row public.players;
  stamp text;
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'signin');
  END IF;
  IF jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) >= 200000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'data');
  END IF;
  stamp := to_char(clock_timestamp() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  SELECT * INTO row FROM public.players WHERE id = me FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.players (id, name, data, updated_at)
    VALUES (me, 'Player', p_data, stamp);
    SELECT * INTO row FROM public.players WHERE id = me;
    RETURN jsonb_build_object('ok', true, 'updated_at', row.updated_at, 'data', row.data, 'econ', public.economy_slice(row.data));
  END IF;
  IF coalesce(p_ver, '') <> '' AND row.updated_at IS DISTINCT FROM p_ver THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'updated_at', row.updated_at);
  END IF;
  UPDATE public.players SET data = p_data, updated_at = stamp WHERE id = me;
  SELECT * INTO row FROM public.players WHERE id = me;
  RETURN jsonb_build_object('ok', true, 'updated_at', row.updated_at, 'data', row.data, 'econ', public.economy_slice(row.data));
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'size');
END
$function$;

-- New functions only. Existing ACLs (including econ_clamp, the guard, and both leaderboards) are left as they were.
REVOKE ALL ON FUNCTION public.economy_json_int(jsonb, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.economy_json_bigint(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.economy_catalog() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.economy_keys() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.economy_free_att(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.economy_blank() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.economy_protect(jsonb, jsonb, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.economy_slice(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.economy_find(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.economy_owns(jsonb, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.economy_push(jsonb, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.economy_deal(jsonb, bigint) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.economy_cost(jsonb, text, text, text, bigint) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.economy_grant_free(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.economy_crate_tier(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.economy_crate_add(jsonb, jsonb, text, text, text, integer, numeric) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.economy_crate_prize(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.economy_give(jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.economy_put(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.buy_item(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.open_crate() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profile_save(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_item(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_crate() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profile_save(jsonb, text) TO authenticated, service_role;

DO $assert$
DECLARE
  d jsonb;
  rec record;
  guard text;
  board text;
  savefn text;
BEGIN
  d := public.economy_protect('{"gp":10,"xp":4,"owned":["ak47"],"name":"Ada"}'::jsonb, '{"gp":999999,"xp":50,"owned":["rpg"],"name":"Bob","map":"yard"}'::jsonb, false);
  IF d IS NULL OR (d->>'gp')::integer IS DISTINCT FROM 10 OR (d->>'xp')::integer IS DISTINCT FROM 4 OR d->>'map' IS DISTINCT FROM 'yard' OR d->>'name' IS DISTINCT FROM 'Ada' OR (d -> 'owned' ? 'rpg') THEN
    RAISE EXCEPTION 'update protect failed: %', d;
  END IF;
  d := public.economy_protect(NULL, '{"gp":999999,"xp":50,"owned":["rpg"],"map":"yard"}'::jsonb, true);
  IF d IS NULL OR (d->>'gp')::integer IS DISTINCT FROM 1500 OR (d->>'xp')::integer IS DISTINCT FROM 0 OR d->>'map' IS DISTINCT FROM 'yard' OR d -> 'owned' IS DISTINCT FROM '["ak47","p9"]'::jsonb THEN
    RAISE EXCEPTION 'insert protect failed: %', d;
  END IF;
  IF (d -> 'attOwn' -> 'm4a1' ? 'holo') IS NOT TRUE OR (d -> 'attOwn' -> 'spas' ? 'red') IS NOT TRUE OR (d -> 'attOwn' -> 'thunder' ? 'red') IS NOT TRUE THEN
    RAISE EXCEPTION 'free attachments missing: %', d -> 'attOwn';
  END IF;
  SELECT * INTO rec FROM public.econ_clamp('{"gp":10}'::jsonb, '{"gp":9999999,"xp":9999999}'::jsonb, 1000, false);
  IF rec.data IS NULL OR (rec.data->>'gp')::integer IS DISTINCT FROM 10 OR jsonb_array_length(rec.flags) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'econ_clamp still mints: %', rec.data;
  END IF;
  SELECT * INTO rec FROM public.econ_clamp(NULL, '{"gp":999999}'::jsonb, 0, true);
  IF rec.data IS NULL OR (rec.data->>'gp')::integer IS DISTINCT FROM 1500 THEN
    RAISE EXCEPTION 'econ_clamp insert cap: %', rec.data;
  END IF;
  IF (public.economy_find('gun','m4a1')->>'price')::integer <> 70000 THEN
    RAISE EXCEPTION 'm4a1 price';
  END IF;
  IF public.lb_level(0) <> 1 OR public.lb_level(3500) <> 2 OR public.lb_level(8999) <> 2 OR public.lb_level(9000) <> 3 THEN
    RAISE EXCEPTION 'lb_level drifted';
  END IF;
  SELECT p.prosrc INTO guard FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'players_econ_guard';
  IF guard ILIKE '%when others%' OR guard ILIKE '%econ_at := now()%' OR guard ILIKE '%econ_at = now()%' THEN
    RAISE EXCEPTION 'guard still fails open or bumps econ_at';
  END IF;
  IF position('economy_stage' IN guard) = 0 OR position('economy.trusted' IN guard) > 0 THEN
    RAISE EXCEPTION 'guard must stage server writes and ignore session flags';
  END IF;
  SELECT p.prosrc INTO board FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'public_leaderboard';
  IF position('srv_xp' IN board) = 0 OR board LIKE '%data->>''xp''%' THEN
    RAISE EXCEPTION 'public_leaderboard still reads client xp';
  END IF;
  SELECT p.prosrc INTO board FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ranked_leaderboard';
  IF position('srv_rp' IN board) = 0 OR board LIKE '%rank,rp%' OR board LIKE '%data->>''xp''%' THEN
    RAISE EXCEPTION 'ranked_leaderboard still reads client rank';
  END IF;
  SELECT p.prosrc INTO savefn FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'profile_save';
  IF position('economy.trusted' IN savefn) > 0 OR position('economy.writer' IN savefn) > 0 OR position('economy_stage' IN savefn) > 0 THEN
    RAISE EXCEPTION 'profile_save must not be a trusted writer';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    IF has_function_privilege('anon', 'public.open_crate()'::regprocedure, 'EXECUTE')
       OR has_function_privilege('anon', 'public.buy_item(text,text,text)'::regprocedure, 'EXECUTE')
       OR has_function_privilege('anon', 'public.economy_put(uuid,jsonb)'::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon can write economy';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    IF NOT has_function_privilege('authenticated', 'public.open_crate()'::regprocedure, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.buy_item(text,text,text)'::regprocedure, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.profile_save(jsonb,text)'::regprocedure, 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.economy_put(uuid,jsonb)'::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated privileges are wrong';
    END IF;
  END IF;
END
$assert$;
