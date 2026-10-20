# Tests (Playwright + Chromium)

Local servers the tests expect:
- the built game on http://127.0.0.1:8765 (`python3 build/build.py game/cabin-fever.html out --dev && cd out && python3 -m http.server 8765`). `--dev` (or `--test`) keeps the `window.__bf` hook these tests drive. A production build, including `npm run www` for the iPhone app, omits that hook. `localStorage` `blockfire.cloudcfg` is ignored; the game always uses the hardcoded `CLOUD_CFG` origin.
- a PeerJS server on 127.0.0.1:9000 (`npx peerjs --port 9000`)
- an MQTT-over-WebSocket broker on 127.0.0.1:8883 for the backup route (aedes + ws)
- `node tests/mock-supabase.js` on 127.0.0.1:54321 (stands in for Supabase auth, tables and functions)

| File | What it checks |
|---|---|
| invite.mjs | invite link → join → lobby → match → late joiner → leave → new room (direct and backup route) |
| build.mjs | building: place, shoot down, out of blocks, indestructible map, zombies off, multiplayer sync, cheating |
| crate.mjs | odds, pity over 200k crates, duplicates, every prize kind, kill effects |
| cloud.mjs, guest.mjs | accounts: guest, claim a name, login elsewhere, two devices, 90-day idle, wrong passwords |
| store.mjs | help form, account deletion, update-required screen, feature switches, crash guard, save migration |
| leave.mjs, rly.mjs, rob.mjs, mpsuite.mjs | multiplayer robustness: leaving, relays, reloads, packet loss, 21 scenarios |
| bot-aggression.mjs | headless bot match, 5 seeds per difficulty, base vs head: time to first shot at the human, idle/perch %, engagements per minute, distance closed while idle, Easy K/D. Node 18+ (no Node 22 WebSocket global). Build with `--test`. |
