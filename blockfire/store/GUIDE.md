# Guide: from the code to the App Store

## What is already done
- iPhone app (Capacitor) with icon, launch screen, full-screen landscape, privacy manifest (PrivacyInfo.xcprivacy) and encryption declaration.
- Live updates: fixes and new content reach players without waiting for Apple's review.
- Remote "update required", home-screen messages and feature switches through the app_config table.
- In-game account deletion (Apple requirement), privacy policy, terms of use, support page, licenses.
- Crash reports and player messages are saved in the database.
- Automatic cloud build to TestFlight through GitHub Actions, no Mac needed.
- Store texts, age-rating and privacy answers, and 7 screenshots in the required size.

## What is left for you
1. **Apple Developer account** ($99 a year): developer.apple.com/programs. Approval takes a day or two.
2. **Create the app in App Store Connect**: Apps → + → New App. Platform iOS, name: Cubefront: Block War Shooter, Bundle ID: com.edenif1.blockfire (register it first under Certificates, Identifiers & Profiles → Identifiers), SKU: blockfire-ios-001.
3. **API key**: App Store Connect → Users and Access → Integrations → App Store Connect API → create a key with the App Manager role. Download the .p8 file (you can only download it once).
4. **Four GitHub secrets**: github.com/EdenIf1/skills- → Settings → Secrets and variables → Actions → New repository secret:
   - `APPLE_TEAM_ID`: your team ID (Membership details)
   - `ASC_KEY_ID`: the key ID
   - `ASC_ISSUER_ID`: shown above the list of keys
   - `ASC_PRIVATE_KEY`: the whole content of the .p8 file
5. **Build**: GitHub → Actions → "iOS · TestFlight" → Run workflow (on the blockfire-app branch). After about 20 minutes the build appears in TestFlight.
6. **Test in TestFlight** on your phone and your friends' phones.
7. **Fill in the store page** from store/APP_STORE_LISTING.md, upload the screenshots from store/screenshots, and Submit for Review.

## Open items (as of 12 October 2026)
- [x] GitHub Pages is on: edenif1.github.io/skills-/privacy.html and support.html open for everyone (checked in a private tab).
- [ ] **Final app name**: still being decided. When it is picked, change it in the game title and logo, Info.plist (CFBundleDisplayName), capacitor.config.json (appName), the App Store listing, the legal pages and the icon. Check that the name is free in the App Store and as a trademark.
- [ ] **Support email**: add it to support.html, privacy.html and terms.html (Apple wants a published contact).
- [ ] **Apple Developer account** ($99/year), then create the app in App Store Connect and add the 4 GitHub secrets.
- [ ] **Test account** for the App Review notes (never in the repository).

## Admin rights
- The one-time admin code is not in the code or in git; the server keeps only its hash.
- To become admin: create a real account (not a guest) → Profile → "Game owner? Enter admin code" → paste the code. The code is deleted after one use, and only one account can ever be admin.
- Settings then show an "Admin" row: live settings, player messages and reports, crash reports, and the optional own multiplayer server.

## Staying signed in
- After signing in, the phone gets a random "device key" (the server keeps only its hash). If the session expires, the key signs the player back in without a password. It expires after 90 days unused, or when signing out.
- Safari, the home-screen app and the Claude app each keep separate storage, so you sign in once in each.

## Online: rooms, modes and load
- **Rooms lobby:** every open room is listed under Lobby → Rooms for all players. The host can hide it ("Listed in Rooms") or lock it with a password. The password is checked only on the host's phone and never stored on the server.
- **When someone leaves:** everyone sees a small "X left the game" line, the slot opens for another player, and the leaver can rejoin that room only after one minute.
- **Round modes:** Elimination (regular, with respawns), Elimination Pro (one life per round, first to 5) and Search & Destroy (bomb, sites A/B, sides switch at halftime).
- **Load and 10,000 users:** full details in store/CAPACITY.md. In short: the database handles it. The bottleneck is the free public multiplayer matchmaking server, and the admin panel can switch to your own server without a store update.

## Economy and store
- **Progress:** a kill gives 25 XP; a match ends with a 40–100 XP bonus. A typical player (about 10 kills) reaches level 2 after about 10 matches and level 3 after about 26.
- **GP:** a match pays 100–300 GP. Weapons cost 70,000 GP (level 2) up to 1,000,000 GP (level 40).
- **Rentals:** every item can be rented for 1 day (3% of the forever price), 3 days (7%), a week (12%), a month (30%) or 90 days (60%), or bought forever. Renting again adds time. Rentals never run out in the middle of a match.
- **Selling:** forever items sell back for 70% of what was paid. Items from crates sell for their crate duplicate value. Rentals and starter items cannot be sold.
- **Deal of the day:** one weapon, skin, gear piece or camo is 25% off each day.

## Player safety (Apple guideline 1.2)
- Offensive usernames are refused, in the game and on the server.
- In a room: ⚑ reports a player (the report lands in the admin panel, Messages tab), and the host's ✕ removes a player who then cannot rejoin.
- ⊘ Block: anyone can block a player. A host refuses blocked players, a guest leaves a room with a blocked player in it, and rooms hosted by blocked players are hidden. Settings → Blocked players lists them and can unblock.
- **Your commitment:** the terms say reports are reviewed within 24 hours. Apple expects you to keep that, so check the admin panel once a day.

## Before you submit
- **Required:** turn on GitHub Pages (Settings → Pages → Branch: gh-pages → Save). The privacy and support URLs on the store page are edenif1.github.io/skills-/privacy.html and support.html, and Apple checks that they open.
- The cloud build uses Xcode 26 (since 28 April 2026 Apple rejects uploads built with older versions).
- Apple's age-rating questionnaire changed in 2025; the updated answers are in APP_STORE_LISTING.md. Expect a 13+ rating.
- Check that the name "Cubefront" is free as a trademark and in the store.
- Create a test account in the game and put its details only in the reviewer notes in App Store Connect.
- **The server stays awake:** a GitHub Action (Supabase keep-alive, on the main branch) writes to the database once a day, so the free project is not paused. If it fails, GitHub emails you; then open supabase.com/dashboard and press Restore. Pro ($25/month) is still recommended once there are many players, for daily backups.
