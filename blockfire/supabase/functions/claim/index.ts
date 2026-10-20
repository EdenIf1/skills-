// Blockfire claim: a guest picks a real username + password. Same account, same progress.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const out = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// names other players can see: refuse slurs, swearing and hate words, also written with numbers or symbols (same list as the game)
const BADSUB = ['fuck','fuk','shit','cunt','nigg','nigr','faggot','bitch','whore','slut','porn','penis','vagina','pussy','hitler','nazi','retard','twat','wank','jizz','rapist','molest','pedophil','kkk','asshole','bastard','motherf','dildo','boob','tits','sharmuta','benzona','kusemek','kusemak','kusomo'];
const BADWORD = ['fag','rape','cock','dick','anal','cum','sex','ass','zona','kus','homo','isis'];
// names that pretend to be the game team are refused too (only the owner's account is the GM, and it is marked by the server)
const RESSUB = ['admin','moderator','gamemaster','cubefront','blockfire','official'];
const RESWORD = ['gm','mod','mods','dev','devs','staff','support','owner','system','server'];
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '|': 'i' };
const nameBad = (n: string) => {
  const s = n.toLowerCase().replace(/[013457@$!|]/g, (c) => LEET[c]);
  const flat = s.replace(/[^a-z]/g, '');
  if (BADSUB.concat(RESSUB).some((w) => flat.includes(w))) return true;
  return s.split(/[^a-z]+/).concat([flat]).some((t) => BADWORD.includes(t) || RESWORD.includes(t));
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return out(405, { error: 'method' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  // who is asking: the guest's own login token
  const who = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: req.headers.get('Authorization') ?? '' } });
  if (!who.ok) return out(401, { error: 'login' });
  const user = await who.json();
  if (!user?.id || (user.app_metadata?.guest ?? user.user_metadata?.guest) !== true) return out(403, { error: 'not_guest' });
  let body: { name?: unknown; password?: unknown };
  try { body = await req.json(); } catch { return out(400, { error: 'bad_request' }); }
  const name = String(body.name ?? '').trim();
  const password = String(body.password ?? '');
  const key = name.toLowerCase().replace(/\s+/g, '');
  if (!/^[A-Za-z0-9_ .-]{2,14}$/.test(name) || key === 'player' || key.startsWith('guest') || nameBad(name)) return out(400, { error: 'bad_name' });
  // 8+ characters. Existing accounts are not reset; this only rejects a new password.
  if (password.length < 8 || password.length > 72) return out(400, { error: 'bad_password' });
  const email = key.replace(/[^a-z0-9._-]/g, '_') + '@players.blockfire.game';
  const adm = { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' };
  const r = await fetch(url + '/auth/v1/admin/users/' + user.id, {
    method: 'PUT', headers: adm,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name, guest: false }, app_metadata: { name, guest: false } }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    const msg = String(j.msg || j.message || j.error_code || '');
    if (r.status === 422 || /already|exists|registered/i.test(msg)) return out(409, { error: 'taken' });
    return out(500, { error: 'server' });
  }
  // the saved progress row takes the new name too
  await fetch(url + '/rest/v1/players?id=eq.' + user.id, { method: 'PATCH', headers: { ...adm, Prefer: 'return=minimal' }, body: JSON.stringify({ name }) });
  return out(200, { ok: true, name });
});
