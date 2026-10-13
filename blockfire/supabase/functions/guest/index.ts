// Blockfire guest: makes a confirmed account with a temporary name, so progress is saved online from the first game.
// The phone keeps the generated password and logs itself in; the player never types anything.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const out = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const rnd = (n: number, abc: string) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => abc[b % abc.length]).join('');

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return out(405, { error: 'method' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  for (let i = 0; i < 6; i++) {
    const name = 'Guest-' + rnd(6, '0123456789');
    const password = rnd(28, 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789');
    const email = name.toLowerCase() + '@players.blockfire.game';
    const r = await fetch(url + '/auth/v1/admin/users', {
      method: 'POST',
      headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name, guest: true }, app_metadata: { name, guest: true } }),
    });
    if (r.ok) return out(200, { name, password });
    if (r.status !== 422) return out(500, { error: 'server' });
  }
  return out(500, { error: 'busy' });
});
