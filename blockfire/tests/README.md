# Tests (Playwright + Chromium)

Local servers the tests expect:
- the built game on http://127.0.0.1:8765 (`python3 build/build.py game/cabin-fever.html out && cd out && python3 -m http.server 8765`)
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
| bot-aggression.mjs | headless 120s bot match: time to first shot, gap between fights, K/D by difficulty |
