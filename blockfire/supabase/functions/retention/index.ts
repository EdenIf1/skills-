// Cubefront retention: keeps what the privacy policy promises. Only data older than the stated limits is removed:
// Help messages, reports and crash reports after 30 days, room tickets and invites after 2 days, fair play notes after 90 days.
// Safe to run any number of times (it can never remove anything newer). Called once a day by the database scheduler.
const out = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return out(405, { error: 'method' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adm = { apikey: service, Authorization: 'Bearer ' + service, Prefer: 'return=minimal' };
  const ago = (ms: number) => encodeURIComponent(new Date(Date.now() - ms).toISOString());
  const D = 864e5;
  const jobs: [string, number, string][] = [['support_messages', 30 * D, 'created_at'], ['client_errors', 30 * D, 'created_at'], ['mp_tickets', 2 * D, 'created_at'], ['invites', 2 * D, 'created_at'], ['economy_flags', 90 * D, 'at']];
  const res: Record<string, number> = {};
  for (const [t, age, col] of jobs) {
    const r = await fetch(url + '/rest/v1/' + t + '?' + col + '=lt.' + ago(age), { method: 'DELETE', headers: adm });
    res[t] = r.status;
  }
  return out(200, { ok: true, res });
});
