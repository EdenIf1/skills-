// Blockfire admin-claim: the game owner turns their own signed-up account into the game's only admin,
// using a one-time code. Only the code's SHA-256 is stored (table admin_claim, service role only).
// After one successful claim the code is erased and the single-admin rule blocks anyone else.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const out = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const sha256 = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, '0')).join('');
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return out(405, { error: 'method' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const who = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: req.headers.get('Authorization') ?? '' } });
  if (!who.ok) return out(401, { error: 'login' });
  const user = await who.json();
  if (!user?.id) return out(401, { error: 'login' });
  // the guest flag is read from the server-only field (players can edit user_metadata themselves)
  if ((user.app_metadata?.guest ?? user.user_metadata?.guest) === true) return out(403, { error: 'guest' });
  let body: { code?: unknown } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (code.length < 10 || code.length > 64) return out(400, { error: 'code' });
  const adm = { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' };
  const admins = await (await fetch(url + '/rest/v1/admins?select=user_id', { headers: adm })).json();
  if (Array.isArray(admins) && admins.some((a: { user_id: string }) => a.user_id === user.id)) return out(200, { ok: true, already: true });
  const rows = await (await fetch(url + '/rest/v1/admin_claim?select=code_hash', { headers: adm })).json();
  const h = await sha256(code);
  if (!Array.isArray(rows) || !rows.some((r: { code_hash: string }) => same(r.code_hash, h))) {
    await new Promise((r) => setTimeout(r, 800));
    return out(403, { error: 'code' });
  }
  if (Array.isArray(admins) && admins.length) return out(409, { error: 'taken' });
  const ins = await fetch(url + '/rest/v1/admins', { method: 'POST', headers: adm, body: JSON.stringify({ user_id: user.id }) });
  if (!ins.ok) return out(409, { error: 'taken' });
  await fetch(url + '/rest/v1/admin_claim?code_hash=eq.' + h, { method: 'DELETE', headers: adm });
  return out(200, { ok: true });
});
