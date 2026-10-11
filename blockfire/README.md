# Blockfire

A blocky multiplayer FPS: web game + iPhone app (Capacitor) + Supabase backend.

```
game/cabin-fever.html     the whole game, one file (source of truth)
build/build.py            builds the playable page (web, or --native for the app)
build/assets/             engine, fonts, icons, offline cache, privacy/terms/support/licenses pages
app/                      iPhone app (Capacitor 8, Swift Package Manager)
app/scripts/make-bundle.mjs   packs a live update for the app
supabase/                 database schema and server functions (already applied to the live project)
store/                    App Store texts, icon, splash, screenshots
tests/                    automated tests (Playwright)
.github/workflows/ios-testflight.yml   cloud build → TestFlight
```

## Build
- Web: `python3 build/build.py game/cabin-fever.html out/` then serve `out/`.
- App: `cd app && npm ci && npm run sync` (copies the game into the iOS project).
- TestFlight: push a tag `ios-v1.0.0` (needs the 4 secrets listed in the workflow file).

## Releasing changes
1. Small fixes and new content (maps, items, balance): bump `APP_VERSION` in the game, then run
   `node app/scripts/make-bundle.mjs <gh-pages>/app` and push gh-pages. Installed apps download it and switch on next launch.
2. Native changes (plugins, Info.plist, icon) or big new features: bump `MARKETING_VERSION` in Xcode settings, push an `ios-v*` tag, submit for review.
3. Forcing everyone onto a new version: set `min_version` in the `app_config` table (Supabase dashboard). Old versions show "Update needed".
4. Saves stay compatible: every save carries `v`; add a step to `migrateProfile()` when the save format changes. Never remove fields.

## Remote switches (Supabase → Table editor → app_config)
`min_version`, `latest_version`, `store_url`, `maintenance` (message on the home screen), `motd`, `features` (`building`, `crates`, `multiplayer` can be turned off without an update).

## Where player messages and crash reports go
Supabase → Table editor → `support_messages` and `client_errors`.
