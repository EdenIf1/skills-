// Blockfire guest: makes a confirmed account with a temporary name, so progress is saved online from the first game.
// The phone keeps the generated password and logs itself in; the player never types anything.
//
// Abuse protection lives in protect.ts:
//   TURNSTILE_SECRET_KEY          Cloudflare Turnstile secret (dashboard secret, never commit it)
//   TURNSTILE_HOSTNAMES           optional comma-separated hostname allowlist checked against siteverify
//   GUEST_RATE_LIMIT_HOUR         per IP, default 120 (clock hour in the database, rolling hour in memory)
//   GUEST_RATE_LIMIT_DAY          per IP, default 500
//   GUEST_RATE_LIMIT_GLOBAL_HOUR  all callers, default 5000
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase. JWT verification stays on;
// the game calls this with the anon key. Apply rate.sql before setting the Turnstile secret.
import { handleGuest } from './protect.ts';

Deno.serve((req) => handleGuest(req, {
  env: (name) => Deno.env.get(name),
  fetch: globalThis.fetch.bind(globalThis),
}));
