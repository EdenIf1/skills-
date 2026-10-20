# Architecture

Cubefront is a client-heavy browser game. Almost all gameplay lives in one file. Supabase holds accounts, saves, the public room list, invites, and admin data. It does not simulate matches.

The iPhone app is that same page inside Capacitor, plus a signed zip for small live updates.

## Directory map

```
README.md                         this repo's entry point
CHANGELOG.md                      player-facing notes
docs/                             architecture, backend, backlog
.github/workflows/ios-testflight.yml
blockfire/
  game/cabin-fever.html           game source of truth (HTML, CSS, and JS)
  build/build.py                  turns the source into a shippable page
  build/assets/                   three.js, PeerJS, mixer, fonts, icons, legal pages, service worker
  app/                            Capacitor 8 iOS app (Swift package, not CocoaPods)
  app/scripts/make-bundle.mjs     signed live-update zip
  supabase/schema.sql             tables, RLS, triggers, room/invite RPCs
  supabase/identity.sql           bans, tickets, reports, admin ban RPCs
  supabase/config.toml            CLI config for linking the live project
  supabase/PULL.md                how the live baseline was captured, and how to pull again
  supabase/inventory.md           every live object and whether schema.sql / identity.sql had it
  supabase/migrations/            20261018000000_live_baseline.sql (full live schema)
  supabase/functions/             edge functions, including push (verify_jwt off)
  tests/                          Playwright scripts and a mock Supabase
  store/                          App Store copy, screenshots, capacity notes
```

`.agents/` and `.claude/` are HyperFrames skills. They are not loaded by the game.

`blockfire/supabase/migrations/20261018000000_live_baseline.sql` is the 2026-10-20 live schema. `schema.sql` and `identity.sql` were not rewritten. See [blockfire/supabase/PULL.md](../blockfire/supabase/PULL.md).

## How a frame runs

`requestAnimationFrame` calls `frame`, which calls `step`, then draws.

1. **Input.** Desktop keys and mouse, touch sticks and buttons, and a standard gamepad (Xbox, PlayStation, Switch Pro, MFi). Touch layout can be dragged or swapped for a preset. Settings live in `localStorage` key `blockfire.settings`.
2. **Simulation.** `step` advances the local match when this device is solo or the host. A client calls `stepClient` instead and applies the host's snapshots. The host runs bots, zombies, damage, and scores.
3. **World.** Maps are voxel grids. `genWorld` fills them, then the renderer merges block faces into chunk meshes (32×32 areas) with canvas textures and nearest-neighbor filtering. A second Three.js scene draws the viewmodel gun on top.
4. **Presentation.** HUD, menus, shop, inbox, and admin panel are DOM overlays on the canvas. The menu camera follows a bot match so the background stays live.

If `step` throws repeatedly during a match, the game returns to the menu and keeps the save. If the WebGL context is lost, it rebuilds the canvas a few times, then reloads.

Graphics quality is a setting (`high` / `med` / `low`). On touch devices the pixel ratio drops when the frame rate is low and comes back when it is smooth. A phone that already lost graphics or died mid-match is marked for a lower cap for 14 days (`blockfire.memsafe`).

## Rendering

- **Engine:** Three.js r128, vendored as `build/assets/three.min.js`. The source HTML still points at the cdnjs URL; `build.py` rewrites that to the local file.
- **Renderer:** `THREE.WebGLRenderer`. Antialiasing is on only for non-touch, non-safe, high quality, and device pixel ratio under 2.5.
- **Lights:** hemisphere plus a directional sun. Chunks record whether a block face is in shade when they are built. Muzzle flashes and explosions reuse one point light. High quality adds contact shadows and dust.
- **Sky:** a shader dome, plus special skies for Moon Base (space) and The Code (code rain). Clouds scroll on the dome.
- **Viewmodel:** separate scene and camera so the gun stays crisp when the world camera moves.
- **Audio:** Web Audio, with recordings played through `build/assets/mixer.js` so a fight does not build a new graph for every shot. Menu and match music are rendered in code. Sounds can be panned from the camera. Volume, a colorblind mode, and 3D sound are settings.

## Maps and modes

Playable maps are the `MAPS` object. Each entry names a generator, sky, fog, spawns, and (for battle maps) a 96×96 size.

| Key | Name | Notes |
|---|---|---|
| `town` | Old Town | Default |
| `rail` | Rail Yard | |
| `outpost` | Outpost | |
| `farm` | Farm | Animals |
| `house` | Giant House | |
| `moon` | Moon Base | Lower gravity, space sky |
| `forest` | Deep Forest | |
| `city` | Downtown | |
| `code` | The Code | Jump pads, portals |
| `zombie` | Safehouse | Zombies only |

Generators `genCabin`, `genJunk`, `genFrost`, `genGlass`, `genLava`, `genHarbor`, `genKnife`, and `genCanyon` are still in the file. They are not keys of `MAPS`, so the mode picker cannot select them.

Modes are the `MODES` array. Battle rules include Elimination, Elimination Pro, Search & Destroy, Frontline 12v12 (big maps), Kill the King, Knives Only, Snipers Only, Indestructible, and Boom Only. Party rules (`XRULES`) include Gun Game, Capture the Flag, Domination, Free-for-All, Infected, Hardpoint, Battle Royale, One in the Chamber, and Build Battle. Zombies is its own mode on Safehouse (up to 4 players, bots fill empty seats).

Hide & Seek (`prop`) has loading copy, bot logic, and a rule id, and it is not an entry in `MODES`, so it is not offered on the mode list.

`store/APP_STORE_LISTING.md` says 45 guns. The armory is the `WEAPONS` object in the game file (rifles, SMGs, shotguns, LMGs, snipers, pistols, knives, a flamethrower, a minigun, a rocket launcher, and more unlocks). **TODO:** that listing count was not reconciled one-for-one with `WEAPONS` while writing these docs.

Bots fill teams (6 a side, or 4 in Zombies) unless the host turns fill off. Difficulty is easy, medium, or hard. Ranked forces hard bots.

## Game loop and match flow

`startMatch` loads the map, runs a short loading card (`MODE_INFO`, about ten seconds unless `blockfire.fastload` is set), then sets `state` to `play`.

During play the host (or a solo player) ticks the player, bots, liquids, round rules, killstreaks, the tutorial, and the party-mode rules (`xmTick`). A kill goal, a timer, or a mode-specific win ends the match. Results can show a final-kill replay and a top-three podium.

Progress (XP, GP, challenges, season pass, ranked points) is applied on this device and then saved. Ranked, the season pass, daily gifts, and weekly challenges are computed on the client from the profile. The server stores that profile as JSON. It does not recompute the economy. See the backlog: making the economy server-authoritative is in progress and is not how the checked-in game works today.

A first match can show a four-step guide (move, look, shoot, build). Solo matches can be resumed after the page closes (`resume` overlay). An online match can offer "return to the game" from a small local note.

Profile schema version is `SCHEMA` (currently 3). `migrateProfile` runs on load. Saves also carry `v`.

## UI

Menus are panels over the canvas: home, lobby, shop, crates, character, friends, inbox, season pass, settings, account, leaderboards, admin. The page itself does not scroll; long lists scroll inside the panel. On a phone held upright the game is drawn sideways rather than blocked by a message. Matches expect landscape.

In-game text for "what's new" is `inboxNews`, keyed by `NEWS_ID` (`v190` in this tree). That inbox is not the same document as `CHANGELOG.md`.

## Accounts and saves

```
browser localStorage  --blockfire.users-->  profile JSON
        |                                         |
        |  if signed in and online                |
        v                                         v
Supabase Auth (username mapped to *@players.blockfire.game)
        |
        v
public.players.data   (jsonb, one row per auth user)
```

- First visit (age 13 or older) calls the `guest` edge function, then signs in with the generated password. Under 13 stays on this device only (`blockfire.age`). Nothing for that player is sent online.
- Claiming a username calls `claim` and keeps the same auth user.
- A new username calls `signup`, then the password grant.
- The phone stores a device key (edge function `device`) so a dead session can sign in again for 30 days.
- Local saves happen about once a second. Cloud pushes are at most every 30 seconds during a match, and immediately on match end, purchase, or page hide.
- Two devices are merged from a snapshot (`syncSnap` / `syncMerge`): currency and XP add the deltas, ownership is unioned with removals respected. The write is conditional on `updated_at` so a stale phone does not blindly overwrite.

`localStorage` also holds settings, the cloud session (`blockfire.cloud`), remote config cache, and several debug overrides (`blockfire.ps`, `blockfire.turn`, `blockfire.mq`, `blockfire.rt`, `blockfire.cloudcfg`).

## Multiplayer

Rooms use **PeerJS / WebRTC**. The host's page is the referee. Friends send shots and movement; they draw other players from host snapshots. A lossy data channel (`bfu`, unreliable) carries positions so a dropped packet does not stall the next one. Reliable messages carry events (blocks, roster, mode state).

Protocol version is `PROTO` (7). A peer on another version is told to refresh. Room ids look like `blockfire-r1-` plus the code.

ICE is relay-only (`iceTransportPolicy: 'relay'`). The comment in the client says phones do not connect directly, so a player does not learn another player's IP. Default TURN servers are public hostnames in the source. An admin can set `app_config.turn` to another relay. Matchmaking defaults to the public PeerJS cloud unless `app_config.peer_server` is a `wss://` URL.

If WebRTC fails, a backup path sends game messages over MQTT WebSocket (public brokers first) and, last, Supabase Realtime broadcast (`realtime:bf-…`). The Realtime hop can be switched off with feature flag `rt`.

The open-room list is Supabase table `rooms`. The host calls `room_upsert2` about as often as the SQL comment says (every 15 seconds). Rows older than 60 seconds are hidden by RLS. The room password is checked on the host and is not a column.

Before joining, the client asks `mp_ticket` / `mp_check`. The check returns a display name, a per-game id, an admin flag, and a ban flag. It does not return the auth user id. Reports call `report_player` with that ticket.

Late join uses `rooms.progress` so a match that is already past the halfway point can be refused. That rule is enforced in the client; the column is what the list shows.

## Backend integration

The client is a thin `fetch` wrapper (`cloudReq`) around the Supabase REST, Auth, and Functions URLs. It does not use the Supabase JavaScript SDK.

| Concern | Where it goes |
|---|---|
| Sign-up, guest, claim, delete, device key, admin code | Edge functions |
| Profile row | `players` |
| Remote switches | `app_config` |
| Help form and fallback reports | `support_messages` |
| Crashes | `client_errors` |
| Room list | `rooms` + `room_upsert2` / `room_remove` |
| Username invites | `invites` + `invite_send` |
| Friends, presence, referrals, world ranked board, trusted clock | RPCs in the live baseline migration, not in `schema.sql` or `identity.sql` |
| Web push | `push_subs` in that baseline, and edge function `functions/push` |

The admin panel is a screen in the game, shown only after `is_admin` returns true. Writes still go through RLS and `app_config_guard`.

Trusted time for daily gifts is `rpc/server_now` when that function exists. If the call fails, the client keeps a cached offset.

## iPhone shell

`blockfire/app/capacitor.config.json`: app id `com.edenif1.blockfire`, app name Cubefront, `webDir` `www`, landscape-oriented iOS settings, splash, status bar, and `@capgo/capacitor-updater` with auto-update off.

On launch the game fetches `update.json` from the `gh-pages` raw URL, checks the ECDSA signature, checks that major.minor matches the native app, downloads the zip, and applies it on the next open. `notifyAppReady` runs only after a few frames, so a bundle that never draws rolls back.

Haptics use the Capacitor plugin when present.

## Build pipeline

`build.py` strips Google Fonts, points CSS at local `fonts.css`, swaps Three.js and PeerJS to local files, injects a Content-Security-Policy (scripts from `'self'` plus hashes of this build's inline scripts; `connect-src` allows https and wss, and localhost for tests), copies assets and legal pages, and registers `sw.js` on web builds only.

The service worker is network-first for the HTML page and cache-first for engine files. It also shows web push notifications. It does not cache other origins (the save server, relays, update host).

## Data flow (one online match)

```
Player A (host)                         Player B (client)
  |  room_upsert2                         |
  |-------------------------------------->|  rooms list (select)
  |  PeerJS signalling                    |
  |<------------------------------------->|
  |  TURN relay (game packets)            |
  |<------------------------------------->|
  |  players.data  (each saves self)      |
  v                                       v
Supabase: auth, players, rooms, app_config, invites, tickets
```

Bots and hit detection stay on the host. Supabase never sees positions or shots.
