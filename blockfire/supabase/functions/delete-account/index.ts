// Blockfire delete-account: a logged-in player deletes their own account and all saved progress (App Store rule 5.1.1).
// The account is found from the player's own login token, so nobody can delete someone else.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const out = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

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
  let body: { confirm?: unknown } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  if (body.confirm !== 'DELETE') return out(400, { error: 'confirm' });
  // progress row first (also removed by the cascade), then the account itself
  const adm = { apikey: service, Authorization: 'Bearer ' + service };
  await fetch(url + '/rest/v1/players?id=eq.' + user.id, { method: 'DELETE', headers: adm });
  const r = await fetch(url + '/auth/v1/admin/users/' + user.id, { method: 'DELETE', headers: adm });
  if (!r.ok) return out(500, { error: 'server' });
  return out(200, { ok: true });
});
