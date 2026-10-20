# Changelog

Player-facing notes for Cubefront, taken from the `blockfire-app` history of `blockfire/`. Dates are the days those changes were committed. Notes describe what a player can see or do. Store-only edits and version-number bumps with no gameplay change are left out.

The game in this tree reports itself as **1.9.10**. The iPhone project is still marketing version **1.9.0**. Small fixes can reach installed apps as a signed live update; a new minor version is an App Store update.

Work that is only planned or in progress is not listed here. See [docs/BACKLOG_DECISIONS.md](docs/BACKLOG_DECISIONS.md).

## 2026-10-20

### 1.9.10

Bots look for a fight. Between shots they walk toward the last place an enemy was seen, or onto the enemy side of the map, and they spend less time sitting in windows. Easy still aims slowly and misses. Medium and Hard push harder when they are healthy and still have ammo.

### 1.9.9

Any solo match can be picked up after the page closes. The phone keeps a plain snapshot of the mode, the fighters, and your weapons, and restores it the same way for every mode. You get a "Match restored" message.

### 1.9.8

Modes whose score is just the team totals and your K/D can be resumed the same way. 1.9.9 extends that to every mode.

### 1.9.7

If an online match's page closes (a crash, a swipe-away, the phone closing it), the next open offers to go back in or to leave and free the slot. Leaving tells the room immediately instead of waiting out the absence timer.

### Also this day

The old public web build from 12 October was removed. That is not a gameplay change. Anyone still on that build needs the current page.

## 2026-10-19

### 1.9.6

If a friend drops, the room says they lost connection and waits for them. An online exit you did not choose is reported with the last connection steps from that phone.

### 1.9.5

Leaving a ranked match early costs 16 RP. If the host's phone goes to another app during a match, the room passes to a friend so the match continues, and the original host is brought back in when they return. Reopening in the middle of a match can take the room back if nobody else has.

### 1.9.4

A cancelled sign-in asks you to log in again, and says so, instead of retrying forever. Claiming a username signs you straight back in, so you are not logged out about an hour later. Opening an invite on a device with no account asks you to sign in before you play online.

### 1.9.3

Tapping the dim area around the daily-gift calendar closes it.

### 1.9.2

Settings has ready-made button layouts. One tap applies a layout that stays on screen on phones and iPads.

### 1.9.1

If the button editor cannot open, you get a clear error and Settings stays usable.

## 2026-10-18

### 1.9.0

Sunlight and shade on buildings and walls, clouds, a shadow at your feet, dust in the light, and light from shots and explosions. Low graphics keeps the lighter look. Toasts no longer sit on the airstrike button during a match.

### 1.8.2

Toasts are glass cards coloured by kind (reward, level, problem, info). Kills and objectives show what they just paid, with a running total, beside the crosshair.

### 1.8.1

In Zombies, when you go down you watch as a ghost until the round ends, then you are back.

### 1.8.0

Music on the menu and in matches. Shots are louder on the side they come from. Double XP on the 1st and 3rd weekend of each month (Saturday to Monday UTC), and a featured mode each week that pays extra GP. A solo match the phone closed can be continued. Focus rings are stronger when a controller is in use. From this version, over-the-air updates are fixes for the App Store version you have; bigger releases wait for the store.

### 1.7.1

The loading-screen camera stays on the sunny side so soldiers are not silhouettes.

### 1.7.0

Ranked: climb from Bronze to Master against hard bots, with a new season each month. Weekly challenges pay 3,000 GP each, and finishing all three pays a box-only item. Kill-cam presentation when you go down.

### 1.6.0

Mystery boxes keep paying out. The in-game notes for this version call out box-only camos, kill effects, banners, charms, and gun stars (up to 3) that speed up reload and add spare ammo.

### 1.5.2

Every gun carries 30% more spare ammo. Twin pistols sit closer together while you aim.

## 2026-10-17

### 1.5.1

Loadout slots show pictures of the weapons.

### 1.5.0

Friends (add by name, see who is online, join or invite). A free monthly season pass. Mystery boxes in the store. Share an invite link: the game's own notes say both players get 5,000 GP and a crate when a friend makes an account from it. The server check for that reward is not in the SQL in git; the buttons and the client calls are.

### 1.4.3

Technical problem toasts (safe mode, a survived error) show for the game owner only. Everyone else keeps playing. The report still goes to the server.

### 1.4.1

Armor takes the colour of the skin you wear. Changing your callsign costs GP and stays locked until you tap Rename. The end screen has a Scores button. A king's minigun or rocket launcher is not left on the ground. Web notifications (rental ending, daily gift, friend invite) can be turned on in Settings. The iPhone app does not use that web push yet.

### 1.4.0

The store buy window has duration chips (rent or own) and a cleaner layout.

## 2026-10-16

### 1.3.8

Zombies mystery-box guns are built when the match starts. If the page dies, the crash note records whether the game was in the background.

## 2026-10-15

### 1.3.7

Invite links point at the public GitHub Pages game. The web frame keeps a phone in landscape.

### 1.3.6

A phone held upright shows the game turned sideways instead of a "please rotate" wall. A solo match pauses when it should.

### 1.3.5

If the page closes during play, the next open (even much later) reports it and tells you your progress is saved. Zombie events save immediately.

### 1.3.4

In Zombies, window repair sits with the reload button. Buying stays in the middle of the screen.

### 1.3.3

Zombie counts no longer double. A match ends once.

## 2026-10-14

### 1.3.2

Placement pay at the end of a match. Each rented item keeps its own end time. More zombies, and a High difficulty.

### 1.3.1

Bots hunt the last few enemies in one-life rounds, and a bot that has been stuck walks out instead of standing still.

### 1.3.0

A sky dome on maps that do not have a special sky, and the world is drawn in larger chunks so there is less to render.

### 1.2.0

Gunshots and other sounds go through one mixer on the audio thread instead of a new pile of audio nodes every shot.

### 1.1.4

Farm animals only shout ("MOO!", "BAWK!") on the screen of the player who shot them.

### 1.1.3

In Kill the King, the airstrike target sticks to the enemy king, and a tap near that king locks on. Both kings are marked (theirs large and gold, yours with a small crown).

### 1.1.2

Your own gun keeps a few voices so a long burst does not mute every other sound.

### 1.1.1

Two tabs no longer kick you out by refreshing the same sign-in at once. A dead sign-in stays dead and asks you to log in, and progress saved on that phone is combined when you do.

### 1.1.0

Sounds are recorded once and replayed, which is what keeps long fights from overloading the phone.

### 1.0.9

A cap on how many new sounds can start per second, aimed at the iPhone crashes during heavy fights.

### 1.0.8

A short flight recorder of the last things that happened in the match is sent with a crash or a graphics loss.

### 1.0.7

Each gunshot is recorded a few times and replayed, instead of being built live, so a minigun fight is less likely to take the picture down with it.

### 1.0.6

Crash reports still send if your sign-in token is old. Fences and corn on Farm no longer use a blending mode that was making iPhones drop graphics.

### 1.0.5

If the phone takes the graphics away, the game rebuilds them instead of sitting on a frozen picture.

### 1.0.4

A start that died last time is reported, and the next start uses a safer graphics mode.

### 1.0.3

A friend who joins late receives the blocks that were built, in batches, instead of an empty map. If someone else has already taken over a room you were hosting, you join them. Tapping Join again on the room you are already in does not lock you out. A match that was still loading does not start without its host.

### 1.0.2

If the host disappears, another player can take the room. Friends are marked in green. A run of stability fixes around disconnects.

### Same day, before the 1.0.x labels

- Leaving a match asks first (or takes two taps) so a stray touch on the weapon buttons does not end the round.
- A damaged or half-written save falls back to defaults instead of breaking the game. If storage is full, throw-away caches are dropped and the save is tried again.
- Problems you can see get a short code (the same problem keeps the same code).
- Jump height is about one block. Holding jump against a wall climbs at most a few blocks, so you can leave a crater and cannot spider up to the roof. Bots use the same rule.
- If graphics stay lost, the game saves and reloads instead of leaving a frozen screen. Very sharp iPhone screens skip extra smoothing that was blowing the memory budget during airstrikes.
- Graphics starts on the best picture. It is no longer an "Auto" option that quietly drops quality. On touch devices it can still ease off when frames are actually slow.
- Bots use window lookouts: they walk to the stairs, hop up, and hold the spot for a while.
- Bots running a flag or a point take different lanes instead of all meeting in the middle, and they only fight what is close.
- One short tip at the start of a match, then it goes away.
- The ghost/spectator panel closes when you are back in the menu.
- Spawn protection shows a label and a bubble while it is up. Free-for-all colours everyone else as an enemy.
- The big maps in rotation (Old Town, Rail Yard, Outpost, Farm, Giant House, and the later arena maps) and the home-screen mode picker.

Several commits that day are titled only "Update Blockfire app" and do not say more than the code comments above.

## 2026-10-13

Security and stability, in player terms:

- Names and other text coming from the host are treated as text, not as page markup.
- Phones that were running out of memory get a safer graphics path, and joining a room after that failure works again.
- If the host is briefly away you are not kicked immediately. Errors you can report show a code.
- Less memory used for effects and voices when the phone is struggling.

## 2026-10-12

The large gameplay drop before the numbered patches:

- Kill the King, with a stage when someone is crowned, a nuke cinematic, an airstrike you aim from a tablet, a replay of the last kill, loading cards that explain the mode, rentals, an inbox, a ghost view in Search & Destroy, and a backup connection path for phones that cannot link directly.
- Ten party modes (Gun Game, Capture the Flag, Domination, Free-for-All, Infected, Hardpoint, Battle Royale, One in the Chamber, Build Battle, and the set shipped with them), an online room list, bot difficulty, a hidden weapons stash, zombie hounds, a taller safehouse, teammate health, and a podium on the game-over screen.
- Objective markers for Hardpoint, Domination, and Capture the Flag, on screen and on the minimap. Timers show whole seconds. The HUD hides during the nuke. Sounds do not queue while audio is paused.
- The party-modes tile is marked so it stands out.
- The end screen fits short browser windows.
- Long minigun bursts on iPhone Safari no longer pile up audio until the tab dies.
- Spawns, the secret stash, and Battle Royale loot stay inside the playable part of every map.
- Account screen redesign. You can block a player. Infected, Capture the Flag, and ghost-view fixes. Zombie kills no longer inflate your K/D. Explosions sound different from each other.
- The build id is shown in Settings.

Same-day commits titled only "Update Blockfire app" are the follow-up fixes above (button editor safety, match tips, bot routes, and the big-map set), not a separate feature list.

## 2026-10-11

First checked-in game:

- The block shooter itself: build cover, a store with 3D previews, supply crates with rarities, and online accounts.
- iPhone app shell (landscape, full screen, icon, splash).
- Later the same day: armory, gear and shields, a daily gift calendar, buttons you can move, and an admin code so one account can open the admin panel.
- Progress saves on its own. Legal pages (privacy, terms, support, licenses) open inside the app.

## Gaps in the history

**TODO:** Many commits on 12–14 October are titled only "Update Blockfire app" or "live update" and have no message body. The notes above come from comments and UI strings in those diffs. Anything those diffs do not say is not invented here.

**TODO:** `1.8.3` only changes `APP_VERSION`. No gameplay change is described.

**TODO:** The in-game inbox (`NEWS_ID` `v190`) summarises 1.5 through 1.9 in the player's own words. Where this file and that inbox disagree, the inbox is the copy shipped inside the client, and this file is the commit history.
