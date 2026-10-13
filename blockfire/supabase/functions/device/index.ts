// Blockfire device: "remember this phone". After a login the phone gets a random key; only its SHA-256 is stored.
// When the phone's normal session is gone or expired, the key signs it back in without asking for the password.
// A key stops working after 30 days unused, when the player signs out on that phone, or when the account is deleted.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const out = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const sha256 = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, '0')).join('');
const b64url = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AGE = 30 * 864e5, MAX_KEYS = 8;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return out(405, { error: 'method' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adm = { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' };
  let body: { action?: unknown; uid?: unknown; key?: unknown; label?: unknown } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action || '');
  const me = async () => {
    const r = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: req.headers.get('Authorization') ?? '' } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? u : null;
  };

  if (action === 'create') {
    const user = await me();
    if (!user) return out(401, { error: 'login' });
    const key = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const label = typeof body.label === 'string' ? body.label.slice(0, 60) : null;
    const ins = await fetch(url + '/rest/v1/device_keys', { method: 'POST', headers: adm, body: JSON.stringify({ user_id: user.id, key_hash: await sha256(key), label }) });
    if (!ins.ok) return out(500, { error: 'server' });
    // keep only the newest few devices per account
    const list = await (await fetch(url + '/rest/v1/device_keys?user_id=eq.' + user.id + '&select=id&order=last_used_at.desc', { headers: adm })).json();
    if (Array.isArray(list) && list.length > MAX_KEYS) {
      const old = list.slice(MAX_KEYS).map((x: { id: number }) => x.id).join(',');
      await fetch(url + '/rest/v1/device_keys?id=in.(' + old + ')', { method: 'DELETE', headers: adm });
    }
    return out(200, { key });
  }

  if (action === 'revoke') {
    const user = await me();
    if (!user) return out(401, { error: 'login' });
    const key = typeof body.key === 'string' ? body.key : '';
    if (key) await fetch(url + '/rest/v1/device_keys?user_id=eq.' + user.id + '&key_hash=eq.' + (await sha256(key)), { method: 'DELETE', headers: adm });
    return out(200, { ok: true });
  }

  if (action === 'login') {
    const uid = typeof body.uid === 'string' ? body.uid : '', key = typeof body.key === 'string' ? body.key : '';
    if (!UUID.test(uid) || key.length < 20 || key.length > 100) return out(400, { error: 'bad' });
    const h = await sha256(key);
    const rows = await (await fetch(url + '/rest/v1/device_keys?user_id=eq.' + uid + '&key_hash=eq.' + h + '&select=id,last_used_at', { headers: adm })).json();
    if (!Array.isArray(rows) || !rows.length) { await new Promise((r) => setTimeout(r, 400)); return out(401, { error: 'unknown' }); }
    if (Date.now() - Date.parse(rows[0].last_used_at) > MAX_AGE) {
      await fetch(url + '/rest/v1/device_keys?id=eq.' + rows[0].id, { method: 'DELETE', headers: adm });
      return out(401, { error: 'expired' });
    }
    const ur = await fetch(url + '/auth/v1/admin/users/' + uid, { headers: adm });
    if (!ur.ok) return out(401, { error: 'unknown' });
    const user = await ur.json();
    // a one-time sign-in link made on the server and used right away: the phone gets a normal session
    const gl = await fetch(url + '/auth/v1/admin/generate_link', { method: 'POST', headers: adm, body: JSON.stringify({ type: 'magiclink', email: user.email }) });
    if (!gl.ok) return out(500, { error: 'server' });
    const link = await gl.json();
    const th = link.hashed_token ?? link.properties?.hashed_token;
    const vt = link.verification_type ?? link.properties?.verification_type ?? 'magiclink';
    const vr = await fetch(url + '/auth/v1/verify', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: vt, token_hash: th }) });
    if (!vr.ok) return out(500, { error: 'server' });
    const session = await vr.json();
    await fetch(url + '/rest/v1/device_keys?id=eq.' + rows[0].id, { method: 'PATCH', headers: adm, body: JSON.stringify({ last_used_at: new Date().toISOString() }) });
    return out(200, { access_token: session.access_token, refresh_token: session.refresh_token, expires_in: session.expires_in, user: { id: uid }, name: user.app_metadata?.name ?? user.user_metadata?.name ?? '', guest: (user.app_metadata?.guest ?? user.user_metadata?.guest) === true });
  }
  return out(400, { error: 'action' });
});
