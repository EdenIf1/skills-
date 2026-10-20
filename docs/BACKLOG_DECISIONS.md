# Backlog decisions

Architect decisions for Cubefront. Record a decision when the team chooses an approach, even if the code is not written yet. Do not treat an entry here as a shipped player change. Shipped gameplay belongs in [CHANGELOG.md](../CHANGELOG.md).

## Template

Copy this block for the next decision. Leave fields blank rather than guessing.

```
### YYYY-MM-DD — Short title

- **Date:** YYYY-MM-DD
- **Decision:** What was chosen, in one or two sentences.
- **Rationale:** Why this and not another approach.
- **Status:** proposed | planned | active | in progress | shipped | deferred | dropped
- **Notes:** Links, PR numbers, or follow-ups. Optional.
```

| Status | Means |
|---|---|
| proposed | Written down, not accepted |
| planned | Accepted as future work, not started |
| active | Accepted and in force (a rule, not a feature) |
| in progress | Accepted, code not finished |
| shipped | In the tree players or operators already have |
| deferred | Accepted, deliberately waiting on something else |
| dropped | No longer the plan |

## Already in the repo

No decision log was found under `.agents/`, `.claude/`, or `docs/` before this file. Those trees hold HyperFrames skills and, previously, no Cubefront architecture notes. Comments in `blockfire/store/GUIDE.md` and the SQL files describe how the current build works. They are not a decision record, so they are not copied here as decisions.

## Recorded decisions

### 2026-10-20 — Remove the old gh-pages build from 12 October

- **Date:** 2026-10-20
- **Decision:** Remove the vulnerable old `gh-pages` / 12 October build.
- **Rationale:** Security exposure.
- **Status:** shipped (PR #1 merged).

### 2026-10-20 — Server-authoritative economy

- **Date:** 2026-10-20
- **Decision:** Make the economy server-authoritative. Coins, XP, and purchases are validated in Supabase. The client save is not trusted for those.
- **Rationale:** A client-side economy can be edited. This is also a prerequisite for monetization.
- **Status:** in progress (PR pending). The work touches save code in `blockfire/game/cabin-fever.html` and Supabase SQL.
- **Notes:** The game checked in today still writes `players.data` from the client. [docs/BACKEND.md](BACKEND.md) describes that behavior. Do not document the new economy as live until the PR has merged.

### 2026-10-20 — WO-1: spawn-protection label

- **Date:** 2026-10-20
- **Decision:** WO-1: fix the SPAWN PROTECTION label so it clears. The tutorial reuses `spawnProt`, which is why the label never goes away. The fix is a separate tutorial-safe flag, so spawn protection and the tutorial no longer share that timer.
- **Rationale:** Top playtest bug. The change is small and isolated. The root cause is the shared `spawnProt` flag, not the label markup.
- **Status:** in progress.
- **Assigned:** dev lead.
- **Notes:** The label exists in the current client (`#protTag`). The separate tutorial-safe flag is not in this tree yet.

### 2026-10-20 — No parallel edits in unaudited regions

- **Date:** 2026-10-20
- **Decision:** No parallel pull requests may touch economy/save code, bots, mode HUD rules, or camera until a code audit has mapped those regions.
- **Rationale:** Avoid merge collisions.
- **Status:** active, relaxed for Batch 1.
- **Notes:** Batch 1 below relaxes this rule for bots, the mode HUD, and the Rail Yard camera, because those work orders sit in separate regions and do not overlap each other or the economy/save work. Economy and save code stay serialized. SQL hardening still waits until the economy pull request has merged.

### 2026-10-20 — Batch 1, parallel work orders

- **Date:** 2026-10-20
- **Decision:** Run these together. They touch separate code regions, so they do not wait on each other. This relaxes the sequencing rule above for these regions only.
  - **WO-2:** more aggressive bots.
  - **WO-3:** `BiquadFilter` warning (the 16000 Hz clamp in the audio code).
  - **WO-4:** Rail Yard spawn and camera clipping through walls.
  - **WO-5:** mode-correct UI. Free-for-All shows no teams. Search & Destroy, Elimination, and Kill the King do not show kills-to-win. Lobby slots show 8.
  - **WO-6:** security. Strip the test hook from production builds, drop `unsafe-eval`, and hard-code the backend origin.
  - **WO-7:** guest signup rate limit and captcha.
- **Rationale:** Top playtest bugs plus P0 security, and the edits do not overlap.
- **Status:** planned.
- **Assigned:** dev lead.

### 2026-10-20 — Queued behind Batch 1 and the economy work

- **Date:** 2026-10-20
- **Decision:** These stay queued. They are not part of Batch 1.
  - **WO-8:** one-click PLAY and faster loading.
  - **WO-9:** auto-listed bot matches so an empty lobby is not empty. Same owner as WO-8, because the two overlap.
  - **Loading tips:** tips that do not apply to the current mode.
  - **SQL hardening:** crash-report limits, the player-name trigger, and schema drift. Starts only after the economy work has merged.
- **Rationale:** WO-8 and WO-9 share code, so they stay with one owner. SQL hardening touches the same save and schema surface as the economy change, so it waits for that merge.
- **Status:** planned (queued).
- **Assigned:** dev lead. WO-9 stays with the WO-8 owner.

### 2026-10-20 — Gear stats stay until the economy lands

- **Date:** 2026-10-20
- **Decision:** Gear stat removal is deferred. Gear that changes health, shield, or speed stays as it is until the server-authoritative economy has landed and player feedback is in. The earlier plan to make gear cosmetic-only is not scheduled yet.
- **Rationale:** The change overlaps shop code. The design call is still pending.
- **Status:** deferred.
- **Assigned:** unassigned until the design call.
