// Abuse protection for the guest edge function.
// Turnstile: enforced only when TURNSTILE_SECRET_KEY is set (never commit that value).
// Rate limit: in-memory fast path on this isolate, plus guest_rate_hit (rate.sql) across isolates.
// Raw IPs are not stored. The bucket key is a hash of the IP and the service-role key.

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const HOUR = 3_600_000;
const DAY = 86_400_000;
const ATTEMPT_FACTOR = 4;

export type GuestDeps = {
  env: (name: string) => string | undefined;
  fetch: typeof fetch;
  now?: () => number;
};

const attempts = new Map<string, number[]>();
const successes = new Map<string, number[]>();
let globalHits: number[] = [];
let warnedOff = false;
let ops = 0;

export function resetGuestProtect(): void {
  attempts.clear();
  successes.clear();
  globalHits = [];
  warnedOff = false;
  ops = 0;
}

const out = (status: number, body: unknown, extra?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', ...extra },
  });

const rnd = (n: number, abc: string) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => abc[b % abc.length]).join('');

function cleanIp(v: string | null): string {
  const t = (v || '').trim();
  if (!t || t.length > 80 || /[\s,]/.test(t)) return '';
  return t;
}

// Supabase does not document that these headers are unspoofable. cf-connecting-ip is the
// value Cloudflare sets when it fronts the request. The global cap does not depend on it.
export function clientIp(headers: Headers): { ip: string; source: 'cf' | 'xff' | 'real' | 'none' } {
  const cf = cleanIp(headers.get('cf-connecting-ip'));
  if (cf) return { ip: cf, source: 'cf' };
  const xff = cleanIp((headers.get('x-forwarded-for') || '').split(',')[0] || '');
  if (xff) return { ip: xff, source: 'xff' };
  const real = cleanIp(headers.get('x-real-ip'));
  if (real) return { ip: real, source: 'real' };
  return { ip: 'unknown', source: 'none' };
}

async function ipHash(ip: string, pepper: string): Promise<string> {
  const data = new TextEncoder().encode('guest-v1|' + pepper + '|' + ip);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function limit(raw: string, fallback: number): number {
  if (!raw.trim()) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(1_000_000, Math.floor(n));
}

function fresh(list: number[] | undefined, now: number, window: number): number[] {
  return (list || []).filter((t) => t > now - window);
}

function sweep(now: number): void {
  ops++;
  if (ops % 64 !== 0) return;
  for (const map of [attempts, successes]) {
    for (const [k, list] of map) {
      const kept = fresh(list, now, DAY);
      if (kept.length) map.set(k, kept);
      else map.delete(k);
    }
    while (map.size > 4000) {
      const k = map.keys().next().value;
      if (k === undefined) break;
      map.delete(k);
    }
  }
  globalHits = fresh(globalHits, now, HOUR);
}

function attemptsOver(hash: string, now: number, max: number): boolean {
  const list = fresh(attempts.get(hash), now, HOUR);
  if (list.length) attempts.set(hash, list);
  else attempts.delete(hash);
  return list.length >= max;
}

function noteAttempt(hash: string, now: number): void {
  const list = attempts.get(hash) || [];
  list.push(now);
  attempts.set(hash, list);
}

function successOver(hash: string, now: number, hourMax: number, dayMax: number): boolean {
  const list = fresh(successes.get(hash), now, DAY);
  if (list.length) successes.set(hash, list);
  else successes.delete(hash);
  const hourCount = list.filter((t) => t > now - HOUR).length;
  return hourCount >= hourMax || list.length >= dayMax;
}

function noteSuccess(hash: string, now: number): void {
  const list = fresh(successes.get(hash), now, DAY);
  list.push(now);
  successes.set(hash, list);
}

function globalOver(now: number, max: number): boolean {
  globalHits = fresh(globalHits, now, HOUR);
  return globalHits.length >= max;
}

function noteGlobal(now: number): void {
  globalHits.push(now);
}

const limited = () => out(429, { error: 'rate' }, { 'Retry-After': '60' });

async function verifyTurnstile(
  fetch: typeof globalThis.fetch,
  secret: string,
  token: string,
  hostnames: string[],
): Promise<{ ok: boolean; codes: string[] }> {
  if (!token || token.length > 2048) return { ok: false, codes: ['missing-input-response'] };
  const body = new URLSearchParams({ secret, response: token });
  let res: Response;
  try {
    res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    return { ok: false, codes: ['timeout'] };
  }
  if (!res.ok) return { ok: false, codes: ['http-' + res.status] };
  const j = await res.json().catch(() => null) as { success?: boolean; action?: string; hostname?: string; 'error-codes'?: string[] } | null;
  if (!j || j.success !== true) return { ok: false, codes: (j && j['error-codes']) || ['failed'] };
  if (typeof j.action === 'string' && j.action !== 'guest') return { ok: false, codes: ['bad-action'] };
  if (hostnames.length) {
    const host = String(j.hostname || '').toLowerCase();
    if (!hostnames.includes(host)) return { ok: false, codes: ['bad-hostname'] };
  }
  return { ok: true, codes: [] };
}

type StoreResult = 'ok' | 'limited' | 'down';

async function durableHit(
  fetch: typeof globalThis.fetch,
  url: string,
  service: string,
  hash: string,
  hourMax: number,
  dayMax: number,
  globalMax: number,
): Promise<StoreResult> {
  let res: Response;
  try {
    res = await fetch(url + '/rest/v1/rpc/guest_rate_hit', {
      method: 'POST',
      headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_ip_hash: hash, p_hour_max: hourMax, p_day_max: dayMax, p_global_max: globalMax }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    return 'down';
  }
  if (!res.ok) return 'down';
  const j = await res.json().catch(() => null) as { ok?: boolean } | null;
  if (j && j.ok === true) return 'ok';
  if (j && j.ok === false) return 'limited';
  return 'down';
}

export async function handleGuest(req: Request, deps: GuestDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return out(405, { error: 'method' });

  const env = (name: string) => {
    const v = deps.env(name);
    return v == null ? '' : String(v);
  };
  const now = deps.now ? deps.now() : Date.now();
  const fetch = deps.fetch;
  sweep(now);

  let body: Record<string, unknown> = {};
  const raw = await req.text();
  if (raw.length > 4000) return out(400, { error: 'bad_request' });
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out(400, { error: 'bad_request' });
      body = parsed as Record<string, unknown>;
    } catch {
      return out(400, { error: 'bad_request' });
    }
  }
  const token = typeof body.turnstile === 'string' ? body.turnstile : '';

  const url = env('SUPABASE_URL').replace(/\/$/, '');
  const service = env('SUPABASE_SERVICE_ROLE_KEY');
  const secret = env('TURNSTILE_SECRET_KEY').trim();
  const hourMax = limit(env('GUEST_RATE_LIMIT_HOUR'), 120);
  const dayMax = limit(env('GUEST_RATE_LIMIT_DAY'), 500);
  const globalMax = limit(env('GUEST_RATE_LIMIT_GLOBAL_HOUR'), 5000);
  const hostnames = env('TURNSTILE_HOSTNAMES').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

  if (!secret && !warnedOff) {
    warnedOff = true;
    console.warn('guest: TURNSTILE_SECRET_KEY is unset, captcha checks are off');
  }

  const who = clientIp(req.headers);
  const hash = await ipHash(who.ip, service || 'dev');

  if (attemptsOver(hash, now, hourMax * ATTEMPT_FACTOR)) {
    console.warn('guest rate limit', who.source, 'attempts');
    return limited();
  }
  noteAttempt(hash, now);

  if (secret) {
    const v = await verifyTurnstile(fetch, secret, token, hostnames);
    if (!v.ok) {
      console.warn('guest turnstile', v.codes.slice(0, 4).join(','));
      return out(403, { error: 'turnstile' });
    }
  }

  if (successOver(hash, now, hourMax, dayMax) || globalOver(now, globalMax)) {
    console.warn('guest rate limit', who.source, 'memory');
    return limited();
  }

  if (!url || !service) return out(500, { error: 'server' });

  const durable = await durableHit(fetch, url, service, hash, hourMax, dayMax, globalMax);
  if (durable === 'limited') {
    noteSuccess(hash, now);
    noteGlobal(now);
    console.warn('guest rate limit', who.source, 'store');
    return limited();
  }
  // Captcha on and the counter function missing or down: do not mint accounts.
  // Captcha off (local tests, secret not set yet): keep going, and the memory counters still apply.
  if (durable === 'down' && secret) {
    console.warn('guest rate store unavailable');
    return out(503, { error: 'server' });
  }
  noteSuccess(hash, now);
  noteGlobal(now);

  for (let i = 0; i < 6; i++) {
    const name = 'Guest-' + rnd(6, '0123456789');
    const password = rnd(28, 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789');
    const email = name.toLowerCase() + '@players.blockfire.game';
    let r: Response;
    try {
      r = await fetch(url + '/auth/v1/admin/users', {
        method: 'POST',
        headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          user_metadata: { name, guest: true },
          app_metadata: { name, guest: true },
        }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return out(500, { error: 'server' });
    }
    if (r.ok) {
      await r.body?.cancel().catch(() => {});
      return out(200, { name, password });
    }
    await r.text().catch(() => '');
    if (r.status !== 422) return out(500, { error: 'server' });
  }
  return out(500, { error: 'busy' });
}
