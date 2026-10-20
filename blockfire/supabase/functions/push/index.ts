// Cubefront push notifications.
//  GET  ?op=key            -> the public VAPID key (made on first use; the private half never leaves the server)
//  POST {op:'cron'}        -> hourly: rentals ending within 24h, daily gift reminder (needs x-cron token)
//  POST {op:'invite',id}   -> a friend invite was just sent (needs x-cron token; called by a DB trigger)
//  POST {op:'test'}        -> sends a test notification to the signed-in caller's own devices
import webpush from "npm:web-push@3.6.7";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GAME = "https://edenif1.github.io/skills-/";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const H = { apikey: SRV, Authorization: `Bearer ${SRV}`, "Content-Type": "application/json" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`rest ${path.split("?")[0]} ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

let KEYS: { vapid_public: string; vapid_private: string; cron_token: string } | null = null;
async function keys() {
  if (KEYS) return KEYS;
  let k = (await rest("push_keys?id=eq.1&select=vapid_public,vapid_private,cron_token"))[0];
  if (!k) {
    const v = webpush.generateVAPIDKeys();
    await rest("push_keys", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ id: 1, vapid_public: v.publicKey, vapid_private: v.privateKey }) });
    k = (await rest("push_keys?id=eq.1&select=vapid_public,vapid_private,cron_token"))[0];
  }
  KEYS = k;
  webpush.setVapidDetails("https://edenif1.github.io/skills-/support.html", k.vapid_public, k.vapid_private);
  return k;
}

type Sub = { endpoint: string; user_id: string; p256dh: string; auth: string; tz_offset: number; prefs: Record<string, boolean>; sent: Record<string, string> };

async function send(s: Sub, msg: { t: string; b: string; u?: string; tag?: string }) {
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 6 * 3600, urgency: "normal" });
    return "ok";
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode || 0;
    if (code === 404 || code === 410) { await rest(`push_subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE" }); return "gone"; }
    return "fail";
  }
}

const KIND: Record<string, string> = { gun: "weapon", skin: "skin", camo: "camo", gear: "gear", knife: "knife", att: "attachment", equip: "grenade", hit: "hit color", block: "block", blk: "block set", killfx: "kill effect" };
const prettyId = (id: string) => id.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

async function cron() {
  const subs: Sub[] = await rest("push_subs?select=*&limit=5000");
  if (!subs.length) return { subs: 0, sent: 0 };
  const ids = [...new Set(subs.map((s) => s.user_id))];
  const players: Record<string, { rent?: Record<string, { e: number }>; cal?: { last?: string } }> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const rows = await rest(`players?select=id,rent:data->rent,cal:data->cal&id=in.(${ids.slice(i, i + 100).join(",")})`);
    for (const r of rows) players[r.id] = r;
  }
  const now = Date.now();
  let sent = 0;
  for (const s of subs) {
    const p = players[s.user_id];
    if (!p) continue;
    const local = new Date(now + (s.tz_offset | 0) * 60000);
    const today = local.toISOString().slice(0, 10), hour = local.getUTCHours();
    const was = { ...(s.sent || {}) }, out: Record<string, string> = {};
    const cutoff = new Date(now - 40 * 86400000).toISOString().slice(0, 10);
    for (const [k, v] of Object.entries(was)) if (v >= cutoff) out[k] = v; // forget old marks
    let n = Object.values(out).filter((v) => v === today).length;
    const prefs = s.prefs || {};
    if (prefs.rent !== false && p.rent && hour >= 9 && hour < 22) {
      for (const [k, r] of Object.entries(p.rent)) {
        const e = +(r && r.e) || 0, left = e - now;
        if (left <= 0 || left > 24 * 3600000 || n >= 3) continue;
        const mark = `r:${k}:${e}`;
        if (out[mark]) continue;
        const [kind, ...more] = k.split(":"), id = more.join(":");
        const h = Math.max(1, Math.round(left / 3600000));
        const res = await send(s, { t: "⏳ Rental ending soon", b: `Your ${KIND[kind] || "item"} ${prettyId(id)} ends in about ${h} hour${h === 1 ? "" : "s"}. Extend it in the Store.`, u: GAME, tag: "rent-" + k });
        if (res === "gone") break;
        out[mark] = today; n++; sent++;
      }
    }
    if (prefs.gift !== false && hour === 17 && n < 3 && out.gift !== today && (p.cal?.last || "") !== today) {
      const res = await send(s, { t: "🎁 Your daily gift is waiting", b: "Open Cubefront and claim today's free gift before midnight.", u: GAME, tag: "gift" });
      if (res !== "gone") { out.gift = today; sent++; }
    }
    if (JSON.stringify(out) !== JSON.stringify(was)) {
      await rest(`push_subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "PATCH", body: JSON.stringify({ sent: out }) }).catch(() => {});
    }
  }
  return { subs: subs.length, sent };
}

async function invite(id: number) {
  const inv = (await rest(`invites?id=eq.${id | 0}&select=to_uid,from_name,code,mode,created_at`))[0];
  if (!inv || Date.now() - Date.parse(inv.created_at) > 10 * 60000) return { sent: 0 };
  const subs: Sub[] = await rest(`push_subs?user_id=eq.${inv.to_uid}&select=*`);
  let sent = 0;
  const code = String(inv.code || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 6);
  const from = String(inv.from_name || "A friend").slice(0, 24), mode = String(inv.mode || "a match").slice(0, 30);
  for (const s of subs) {
    if ((s.prefs || {}).invite === false) continue;
    if ((await send(s, { t: "🎮 Game invite", b: `${from} invited you to play ${mode}. Tap to join.`, u: GAME + (code ? "#room-" + code : ""), tag: "invite" })) === "ok") sent++;
  }
  return { sent };
}

async function whoAmI(req: Request) {
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!tok || tok === SRV) return null;
  const r = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: SRV, Authorization: `Bearer ${tok}` } });
  if (!r.ok) return null;
  return (await r.json()).id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const k = await keys();
    if (req.method === "GET") return json({ key: k.vapid_public });
    const body = await req.json().catch(() => ({}));
    const op = body && body.op;
    if (op === "test") {
      const uid = await whoAmI(req);
      if (!uid) return json({ error: "sign in first" }, 401);
      const subs: Sub[] = await rest(`push_subs?user_id=eq.${uid}&select=*`);
      let sent = 0;
      for (const s of subs) if ((await send(s, { t: "✅ Notifications are on", b: "You'll hear from Cubefront when a rental ends, your daily gift is ready, or a friend invites you.", u: GAME, tag: "test" })) === "ok") sent++;
      return json({ sent });
    }
    if (req.headers.get("x-cron") !== k.cron_token) return json({ error: "forbidden" }, 403);
    if (op === "cron") return json(await cron());
    if (op === "invite") return json(await invite(+body.id));
    return json({ error: "unknown op" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e).slice(0, 200) }, 500);
  }
});
