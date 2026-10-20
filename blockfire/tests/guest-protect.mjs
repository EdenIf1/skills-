// Guest edge function: Turnstile and rate limits. No browser and no Supabase.
// node --experimental-strip-types --test tests/guest-protect.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleGuest, resetGuestProtect, clientIp } from '../supabase/functions/guest/protect.ts';

const URL_BASE = 'https://proj.supabase.co';
const SERVICE = 'service-role-test-key';
const TOKEN = 'turnstile-token-ok';

function envOf(extra = {}) {
  const map = {
    SUPABASE_URL: URL_BASE,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE,
    ...extra,
  };
  return (name) => map[name];
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function world(opts = {}) {
  const calls = [];
  let adminLeft = opts.admin422s ?? 0;
  const fetch = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.includes('siteverify')) {
      if (opts.verifyThrow) throw new Error('network');
      return json(opts.verify ?? { success: true, action: 'guest', hostname: 'edenif1.github.io' }, opts.verifyStatus ?? 200);
    }
    if (u.includes('guest_rate_hit')) {
      if (opts.rpc === 'throw') throw new Error('network');
      if (opts.rpc === 'down') return json({ code: 'PGRST202', message: 'not found' }, 404);
      if (opts.rpc === 'limited') return json({ ok: false, hour: 9, day: 9, global: 9 });
      if (opts.rpc === 'bad') return json({ nope: true });
      return json({ ok: true, hour: 1, day: 1, global: 1 });
    }
    if (u.includes('/auth/v1/admin/users')) {
      if (opts.admin === 'throw') throw new Error('network');
      if (adminLeft > 0) { adminLeft--; return json({ msg: 'exists' }, 422); }
      if (opts.admin === '422') return json({ msg: 'exists' }, 422);
      if (opts.admin === '500') return json({ msg: 'no' }, 500);
      return json({ id: 'user-1' }, 200);
    }
    return json({ error: 'unexpected ' + u }, 500);
  };
  return { fetch, calls };
}

function post(body, headers = {}, raw) {
  return new Request('https://example.test/functions/v1/guest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10', ...headers },
    body: raw !== undefined ? raw : JSON.stringify(body === undefined ? {} : body),
  });
}

async function call(opts, body, headers, raw) {
  resetGuestProtect();
  const w = world(opts.world || {});
  const res = await handleGuest(post(body, headers, raw), {
    env: envOf(opts.env || {}),
    fetch: w.fetch,
    now: opts.now || (() => 1_700_000_000_000),
  });
  const text = await res.text();
  let j = null;
  try { j = text ? JSON.parse(text) : null; } catch { j = text; }
  return { res, j, calls: w.calls };
}

const adminCalls = (calls) => calls.filter((c) => c.url.includes('/auth/v1/admin/users'));
const verifyCalls = (calls) => calls.filter((c) => c.url.includes('siteverify'));
const rpcCalls = (calls) => calls.filter((c) => c.url.includes('guest_rate_hit'));

test('client IP prefers cf-connecting-ip, else the first forwarded hop', () => {
  const h = new Headers({ 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '203.0.113.1, 10.0.0.8', 'x-real-ip': '192.0.2.1' });
  assert.deepEqual(clientIp(h), { ip: '198.51.100.7', source: 'cf' });
  assert.deepEqual(clientIp(new Headers({ 'x-forwarded-for': ' 203.0.113.1, 10.0.0.8 ' })), { ip: '203.0.113.1', source: 'xff' });
  assert.deepEqual(clientIp(new Headers({ 'x-real-ip': '192.0.2.9' })), { ip: '192.0.2.9', source: 'real' });
  assert.deepEqual(clientIp(new Headers()), { ip: 'unknown', source: 'none' });
  assert.equal(clientIp(new Headers({ 'x-forwarded-for': 'bad ip' })).ip, 'unknown');
});

test('OPTIONS and non-POST do not create a user', async () => {
  resetGuestProtect();
  const w = world();
  const opt = await handleGuest(new Request('https://example.test/functions/v1/guest', { method: 'OPTIONS' }), { env: envOf(), fetch: w.fetch });
  assert.equal(opt.status, 200);
  assert.equal(opt.headers.get('access-control-allow-origin'), '*');
  const get = await handleGuest(new Request('https://example.test/functions/v1/guest', { method: 'GET' }), { env: envOf(), fetch: w.fetch });
  assert.equal(get.status, 405);
  assert.equal(w.calls.length, 0);
});

test('without a Turnstile secret, a guest account is still created', async () => {
  const { res, j, calls } = await call({});
  assert.equal(res.status, 200);
  assert.match(j.name, /^Guest-\d{6}$/);
  assert.equal(j.password.length, 28);
  assert.equal(verifyCalls(calls).length, 0);
  assert.equal(adminCalls(calls).length, 1);
  const made = JSON.parse(adminCalls(calls)[0].init.body);
  assert.equal(made.email, j.name.toLowerCase() + '@players.blockfire.game');
  assert.equal(made.email_confirm, true);
  assert.equal(made.user_metadata.guest, true);
  assert.equal(made.app_metadata.guest, true);
  assert.equal(made.password, j.password);
  assert.equal(made.turnstile, undefined);
  const rpc = JSON.parse(rpcCalls(calls)[0].init.body);
  assert.match(rpc.p_ip_hash, /^[0-9a-f]{64}$/);
  assert.equal(rpc.p_ip_hash.includes('203.0.113'), false);
  assert.equal(rpc.p_hour_max, 120);
  assert.equal(rpc.p_day_max, 500);
  assert.equal(rpc.p_global_max, 5000);
});

test('a name collision retries, then gives up', async () => {
  const once = await call({ world: { admin422s: 1 } });
  assert.equal(once.res.status, 200);
  assert.equal(adminCalls(once.calls).length, 2);
  const all = await call({ world: { admin: '422' } });
  assert.equal(all.res.status, 500);
  assert.equal(all.j.error, 'busy');
  assert.equal(adminCalls(all.calls).length, 6);
  const down = await call({ world: { admin: '500' } });
  assert.equal(down.j.error, 'server');
  assert.equal(adminCalls(down.calls).length, 1);
  const boom = await call({ world: { admin: 'throw' } });
  assert.equal(boom.res.status, 500);
});

test('bad bodies are refused before any upstream call', async () => {
  const big = await call({}, undefined, {}, 'x'.repeat(4001));
  assert.equal(big.res.status, 400);
  assert.equal(big.calls.length, 0);
  const bad = await call({}, undefined, {}, '{');
  assert.equal(bad.res.status, 400);
  assert.equal(bad.calls.length, 0);
  const arr = await call({}, undefined, {}, '[1]');
  assert.equal(arr.res.status, 400);
});

test('Turnstile secret requires a token that siteverify accepts', async () => {
  const env = { TURNSTILE_SECRET_KEY: 'turnstile-secret' };
  const missing = await call({ env });
  assert.equal(missing.res.status, 403);
  assert.equal(missing.j.error, 'turnstile');
  assert.equal(verifyCalls(missing.calls).length, 0);
  assert.equal(adminCalls(missing.calls).length, 0);

  const huge = await call({ env }, { turnstile: 't'.repeat(2049) });
  assert.equal(huge.res.status, 403);
  assert.equal(verifyCalls(huge.calls).length, 0);

  const no = await call({ env, world: { verify: { success: false, 'error-codes': ['invalid-input-response'] } } }, { turnstile: TOKEN });
  assert.equal(no.res.status, 403);
  assert.equal(adminCalls(no.calls).length, 0);
  const sent = new URLSearchParams(verifyCalls(no.calls)[0].init.body);
  assert.equal(sent.get('secret'), 'turnstile-secret');
  assert.equal(sent.get('response'), TOKEN);
  assert.equal(sent.get('remoteip'), null);

  const timeout = await call({ env, world: { verifyThrow: true } }, { turnstile: TOKEN });
  assert.equal(timeout.res.status, 403);
  assert.equal(adminCalls(timeout.calls).length, 0);

  const http = await call({ env, world: { verifyStatus: 500, verify: { success: false } } }, { turnstile: TOKEN });
  assert.equal(http.res.status, 403);

  const action = await call({ env, world: { verify: { success: true, action: 'login', hostname: 'edenif1.github.io' } } }, { turnstile: TOKEN });
  assert.equal(action.res.status, 403);

  const host = await call({
    env: { ...env, TURNSTILE_HOSTNAMES: 'edenif1.github.io, localhost' },
    world: { verify: { success: true, action: 'guest', hostname: 'evil.test' } },
  }, { turnstile: TOKEN });
  assert.equal(host.res.status, 403);

  const ok = await call({
    env: { ...env, TURNSTILE_HOSTNAMES: 'EdenIf1.github.io' },
    world: { verify: { success: true, hostname: 'edenif1.github.io' } },
  }, { turnstile: TOKEN });
  assert.equal(ok.res.status, 200);
  assert.equal(ok.j.turnstile, undefined);
});

test('per-IP hour and day caps, and a separate bucket per IP', async () => {
  const base = { GUEST_RATE_LIMIT_HOUR: '2', GUEST_RATE_LIMIT_DAY: '10', GUEST_RATE_LIMIT_GLOBAL_HOUR: '100' };
  resetGuestProtect();
  const w = world();
  let now = 1_700_000_000_000;
  const hit = (ip) => handleGuest(post({}, { 'x-forwarded-for': ip }), { env: envOf(base), fetch: w.fetch, now: () => now });
  assert.equal((await hit('203.0.113.10')).status, 200);
  assert.equal((await hit('203.0.113.10')).status, 200);
  const third = await hit('203.0.113.10');
  assert.equal(third.status, 429);
  assert.equal((await third.json()).error, 'rate');
  assert.equal(third.headers.get('retry-after'), '60');
  assert.equal((await hit('203.0.113.11')).status, 200);
  assert.equal(adminCalls(w.calls).length, 3);

  resetGuestProtect();
  const w2 = world();
  now = 1_700_000_000_000;
  const dayEnv = envOf({ GUEST_RATE_LIMIT_HOUR: '10', GUEST_RATE_LIMIT_DAY: '2', GUEST_RATE_LIMIT_GLOBAL_HOUR: '100' });
  const dayHit = () => handleGuest(post({}), { env: dayEnv, fetch: w2.fetch, now: () => now });
  assert.equal((await dayHit()).status, 200);
  assert.equal((await dayHit()).status, 200);
  now += 2 * 3_600_000;
  const later = await dayHit();
  assert.equal(later.status, 429);
  assert.equal(adminCalls(w2.calls).length, 2);
});

test('the hour window rolls, and a zero limit setting falls back to the default', async () => {
  resetGuestProtect();
  const w = world();
  let now = 1_700_000_000_000;
  const env = envOf({ GUEST_RATE_LIMIT_HOUR: '1', GUEST_RATE_LIMIT_DAY: '10', GUEST_RATE_LIMIT_GLOBAL_HOUR: '100' });
  const hit = () => handleGuest(post({}), { env, fetch: w.fetch, now: () => now });
  assert.equal((await hit()).status, 200);
  assert.equal((await hit()).status, 429);
  now += 3_600_000 + 1;
  assert.equal((await hit()).status, 200);

  const loose = await call({ env: { GUEST_RATE_LIMIT_HOUR: '0', GUEST_RATE_LIMIT_DAY: 'nope' } });
  assert.equal(loose.res.status, 200);
  assert.equal(JSON.parse(rpcCalls(loose.calls)[0].init.body).p_hour_max, 120);
});

test('callers with no IP header share one bucket; cf-connecting-ip wins over a forged forwarded-for', async () => {
  resetGuestProtect();
  const w = world();
  const env = envOf({ GUEST_RATE_LIMIT_HOUR: '1', GUEST_RATE_LIMIT_DAY: '10', GUEST_RATE_LIMIT_GLOBAL_HOUR: '100' });
  const bare = () => new Request('https://example.test/functions/v1/guest', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  const hitBare = () => handleGuest(bare(), { env, fetch: w.fetch, now: () => 1_700_000_000_000 });
  assert.equal((await hitBare()).status, 200);
  assert.equal((await hitBare()).status, 429);

  resetGuestProtect();
  const w2 = world();
  const spoof = (xff) => handleGuest(
    post({}, { 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': xff }),
    { env, fetch: w2.fetch, now: () => 1_700_000_000_000 },
  );
  assert.equal((await spoof('203.0.113.1')).status, 200);
  assert.equal((await spoof('203.0.113.2')).status, 429);
  const rpc = rpcCalls(w2.calls);
  assert.equal(rpc.length, 1);
  const hash = JSON.parse(rpc[0].init.body).p_ip_hash;
  assert.equal(hash.includes('203.0.113'), false);
  assert.equal(hash.includes('198.51.100'), false);
});

test('global cap counts different IPs together', async () => {
  resetGuestProtect();
  const w = world();
  const env = envOf({ GUEST_RATE_LIMIT_HOUR: '50', GUEST_RATE_LIMIT_DAY: '50', GUEST_RATE_LIMIT_GLOBAL_HOUR: '2' });
  const hit = (ip) => handleGuest(post({}, { 'x-forwarded-for': ip }), { env, fetch: w.fetch, now: () => 1_700_000_000_000 });
  assert.equal((await hit('203.0.113.1')).status, 200);
  assert.equal((await hit('203.0.113.2')).status, 200);
  assert.equal((await hit('203.0.113.3')).status, 429);
  assert.equal(adminCalls(w.calls).length, 2);
});

test('the shared counter can refuse, and a missing counter fails closed only when captcha is on', async () => {
  const env = { TURNSTILE_SECRET_KEY: 'turnstile-secret' };
  const limited = await call({ env, world: { rpc: 'limited' } }, { turnstile: TOKEN });
  assert.equal(limited.res.status, 429);
  assert.equal(adminCalls(limited.calls).length, 0);

  const down = await call({ env, world: { rpc: 'down' } }, { turnstile: TOKEN });
  assert.equal(down.res.status, 503);
  assert.equal(down.j.error, 'server');
  assert.equal(adminCalls(down.calls).length, 0);

  const thrown = await call({ env, world: { rpc: 'throw' } }, { turnstile: TOKEN });
  assert.equal(thrown.res.status, 503);

  const bad = await call({ env, world: { rpc: 'bad' } }, { turnstile: TOKEN });
  assert.equal(bad.res.status, 503);

  const open = await call({ world: { rpc: 'down' } });
  assert.equal(open.res.status, 200);
  assert.equal(adminCalls(open.calls).length, 1);
});

test('failed captcha checks are capped per IP without burning the success quota', async () => {
  resetGuestProtect();
  const w = world({ verify: { success: false, 'error-codes': ['invalid-input-response'] } });
  const env = envOf({
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    GUEST_RATE_LIMIT_HOUR: '1',
    GUEST_RATE_LIMIT_DAY: '10',
    GUEST_RATE_LIMIT_GLOBAL_HOUR: '100',
  });
  const hit = () => handleGuest(post({ turnstile: TOKEN }), { env, fetch: w.fetch, now: () => 1_700_000_000_000 });
  for (let i = 0; i < 4; i++) assert.equal((await hit()).status, 403);
  const blocked = await hit();
  assert.equal(blocked.status, 429);
  assert.equal(verifyCalls(w.calls).length, 4);
  assert.equal(rpcCalls(w.calls).length, 0);
  assert.equal(adminCalls(w.calls).length, 0);
});

test('same address with different spacing shares a bucket, and the hash does not contain the address', async () => {
  resetGuestProtect();
  const w = world();
  const env = envOf({ GUEST_RATE_LIMIT_HOUR: '1', GUEST_RATE_LIMIT_DAY: '10', GUEST_RATE_LIMIT_GLOBAL_HOUR: '100' });
  const hit = (ip) => handleGuest(post({}, { 'x-forwarded-for': ip }), { env, fetch: w.fetch, now: () => 1_700_000_000_000 });
  assert.equal((await hit('203.0.113.8')).status, 200);
  assert.equal((await hit('  203.0.113.8  ')).status, 429);
});

test('the game still posts an empty guest body; the token hook is outside the save region', () => {
  const html = readFileSync(new URL('../game/cabin-fever.html', import.meta.url), 'utf8');
  const lines = html.split('\n');
  assert.match(lines[1787], /\/functions\/v1\/guest/);
  assert.match(lines[1787], /body:\{\}/);
  assert.equal(lines[1787].includes('turnstile'), false);
  const saveMark = html.indexOf('/* ================= version, remote settings, crash reports ================= */');
  const hook = html.indexOf('turnstile_site_key');
  assert.ok(saveMark > 0 && hook > saveMark);
  const start = html.indexOf('<script>\n(()=>{');
  const end = html.indexOf('</script>', start);
  assert.ok(start > 0 && end > start);
  new Function(html.slice(start + '<script>\n'.length, end));
  const py = readFileSync(new URL('../build/build.py', import.meta.url), 'utf8');
  assert.match(py, /script-src \\'self\\' https:\/\/challenges\.cloudflare\.com/);
  assert.match(py, /frame-src https:\/\/challenges\.cloudflare\.com/);
  const index = readFileSync(new URL('../supabase/functions/guest/index.ts', import.meta.url), 'utf8');
  const sql = readFileSync(new URL('../supabase/functions/guest/rate.sql', import.meta.url), 'utf8');
  assert.match(index, /Deno\.serve/);
  assert.match(index, /handleGuest/);
  assert.match(sql, /guest_rate_hit/);
  assert.match(sql, /revoke all on function public\.guest_rate_hit/);
  assert.equal(/TURNSTILE_SECRET_KEY\s*=\s*['"][^'"]+['"]/.test(index + sql), false);
});
