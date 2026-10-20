# Cubefront

Cubefront (repository name **Blockfire**) is a blocky first-person shooter that runs in the browser and as an iPhone app. You build cover, fight with bots or friends, play Zombies, and keep guns, skins, and progress on an account.

The game itself is one HTML file: [`blockfire/game/cabin-fever.html`](blockfire/game/cabin-fever.html). A Python build copies it into a page you can open or ship. Accounts, saves, the room list, and admin tools go through Supabase. Online matches run on the host's device (WebRTC), not on a game server.

The iPhone app is a Capacitor wrapper. The App Store name is Cubefront. The bundle id is `com.edenif1.blockfire`.

This repository also contains HyperFrames skill packs under `.agents/` and `.claude/`. Those are not part of the game.

## Docs

| Doc | What it covers |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Modules, data flow, directory map |
| [docs/BACKEND.md](docs/BACKEND.md) | Supabase schema and how to rebuild it from git |
| [CHANGELOG.md](CHANGELOG.md) | Player-facing patch notes from `blockfire-app` history |
| [docs/BACKLOG_DECISIONS.md](docs/BACKLOG_DECISIONS.md) | Architect decisions |
| [blockfire/README.md](blockfire/README.md) | Short build and release notes kept next to the game |
| [blockfire/supabase/README.md](blockfire/supabase/README.md) | Backend security model, as checked in with the SQL |
| [blockfire/tests/README.md](blockfire/tests/README.md) | What the Playwright scripts are meant to cover |
| [blockfire/store/GUIDE.md](blockfire/store/GUIDE.md) | App Store release checklist |
| [blockfire/store/CAPACITY.md](blockfire/store/CAPACITY.md) | Load notes for accounts and matchmaking |
| [blockfire/store/APP_STORE_LISTING.md](blockfire/store/APP_STORE_LISTING.md) | Store listing text |

## Prerequisites

- **Python 3** for the page build. `blockfire/build/build.py` uses the standard library only.
- **A browser** with WebGL. Multiplayer also needs WebRTC (`RTCPeerConnection`).
- **Node.js 22 and npm** for the iPhone project (`blockfire/app`). The TestFlight workflow pins Node 22.
- **Xcode 26 or later** to archive the iOS app locally. The cloud workflow uses a `macos-26` runner for the same reason (Apple's upload rule called out in the workflow).
- **Tests** import `playwright` and launch Chromium from `/opt/pw-browsers/chromium`. There is no `package.json` in this repo that installs Playwright or PeerJS. See [Tests](#tests).

No root `package.json`, lockfile for the game, or Dockerfile is checked in. The live schema export is [blockfire/supabase/migrations/20261018000000_live_baseline.sql](blockfire/supabase/migrations/20261018000000_live_baseline.sql). See [blockfire/supabase/PULL.md](blockfire/supabase/PULL.md).

## Run locally

From the repository root:

```bash
python3 blockfire/build/build.py blockfire/game/cabin-fever.html blockfire/out
cd blockfire/out && python3 -m http.server 8765
```

Open `http://127.0.0.1:8765/`. The web build writes `play.html` (the game) and `index.html` (a frame that keeps phones in landscape). The build replaces the Three.js and PeerJS CDN tags with local copies from `blockfire/build/assets/`.

`BUILD` (optional) is stamped into the page as the build id and into the service-worker cache name. If unset, the id is `dev`.

The game talks to the Supabase project whose URL is hardcoded as `CLOUD_CFG` in `cabin-fever.html`, unless `localStorage` key `blockfire.cloudcfg` overrides `{url, key}`. The anon key is in that same object. It is a public client key. These docs do not copy it.

Offline play against bots works without that server. Guest accounts, cloud saves, the room list, friends, and the admin panel need it.

### iPhone project (does not upload)

```bash
cd blockfire/app
npm ci
npm run sync
```

`npm run sync` builds the game with `--native` into `app/www` and runs `npx cap sync ios`. The native build has no service worker. Open `blockfire/app/ios/App/App.xcodeproj` in Xcode to run on a device or simulator.

`app/www` is generated. It is gitignored.

## Build

| Target | Command | Output |
|---|---|---|
| Web | `python3 blockfire/build/build.py blockfire/game/cabin-fever.html <out-dir>` | `play.html`, landscape `index.html`, engine files, legal pages, `sw.js` |
| Native bundle | `cd blockfire/app && npm run www` | `blockfire/app/www/index.html` (game is the index) |
| Signed live update | `UPDATE_KEY=/path/to/key.pem node blockfire/app/scripts/make-bundle.mjs <out-dir>` | `bundle-<version>.zip` and `update.json` |

`APP_VERSION` in `cabin-fever.html` is the game version (currently `1.9.9`). The iOS marketing version in `app/package.json` and the Xcode project is `1.9.0`. Live updates install only when the bundle's major.minor matches the installed app.

`UPDATE_KEY` is the path to the owner's signing key. The script refuses to write an unsigned update. The matching public key is `UPD_PUB` in the game. Do not commit the private key.

## Tests

`blockfire/tests/README.md` is the procedure the scripts were written for:

1. Build the game and serve it at `http://127.0.0.1:8765`.
2. PeerJS on `127.0.0.1:9000` (`npx peerjs --port 9000`).
3. An MQTT-over-WebSocket broker on `127.0.0.1:8883` (the README names aedes + ws). No start script for that broker is in the repo.
4. `node blockfire/tests/mock-supabase.js` on `127.0.0.1:54321`.

Then run a script with Node, for example `node blockfire/tests/cloud.mjs`. Several scripts take a base URL from the environment variable `U`. Defaults differ: some use port `8765`, some `8766`, and `mpsuite.mjs` looks for a PeerJS binary at `/tmp/npmt/node_modules/peer/dist/bin/peerjs.js`. The mock server's token lifetime can be overridden with `EXP` (seconds).

Scripts on disk: `armory.mjs`, `build.mjs`, `cal.mjs`, `cloud.mjs`, `crate.mjs`, `gear.mjs`, `guest.mjs`, `invite.mjs`, `lay.mjs`, `leave.mjs`, `mpsuite.mjs`, `rly.mjs`, `rob.mjs`, `store.mjs`, plus `mock-supabase.js`. The tests README table does not list `armory`, `cal`, `gear`, or `lay`.

There is no single `npm test` entry point.

## Deploy

### Web

The build is static files. The game's public URL constant is `https://edenif1.github.io/skills-/index.html`. Live-update manifests are expected at `https://raw.githubusercontent.com/EdenIf1/skills-/gh-pages/app/update.json`. Publishing that `gh-pages` branch is a manual push. This branch has no GitHub Actions workflow that deploys the web build.

`blockfire/README.md` describes the live-update release steps (bump `APP_VERSION`, run `make-bundle.mjs`, push `gh-pages`).

### iPhone / TestFlight

Workflow: [`.github/workflows/ios-testflight.yml`](.github/workflows/ios-testflight.yml).

It runs on a tag `ios-v*` (for example `ios-v1.0.0`) or when someone starts **iOS · TestFlight** by hand. It needs these repository secrets (names only):

- `APPLE_TEAM_ID`
- `ASC_KEY_ID`
- `ASC_ISSUER_ID`
- `ASC_PRIVATE_KEY`

Signing is automatic via the App Store Connect API key. The workflow does not print those values.

More of the store process is in [blockfire/store/GUIDE.md](blockfire/store/GUIDE.md).

### Backend

Supabase project name recorded in `blockfire/supabase/README.md`: `blockfire`, region `eu-central-1`. The client URL is hardcoded in the game. Rebuild steps, tables, and what is **not** in git are in [docs/BACKEND.md](docs/BACKEND.md).

Edge functions read `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Supabase injects those. Do not commit the service-role key.

Remote switches (table `app_config`, edited in the admin panel or the Supabase dashboard): `min_version`, `latest_version`, `store_url`, `maintenance`, `motd`, `features`, `peer_server`. The admin panel also writes `turn`. Players see maintenance or motd text on the home screen, and an update wall when `min_version` is newer than `APP_VERSION`.

## Versions in this tree

| Place | Value |
|---|---|
| `APP_VERSION` in the game | `1.9.9` |
| `blockfire/app/package.json` | `1.9.0` |
| Xcode `MARKETING_VERSION` | `1.9.0` |
| Xcode `CURRENT_PROJECT_VERSION` | `1` (CI replaces this with the Actions run number) |
| Multiplayer protocol `PROTO` | `7` |
