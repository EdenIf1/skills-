# Backlog decisions

Architect decisions for Cubefront. Record a decision when the team chooses an approach, even if the code is not written yet. Do not treat an entry here as a shipped player change. Shipped gameplay belongs in [CHANGELOG.md](../CHANGELOG.md).

## Template

Copy this block for the next decision. Leave fields blank rather than guessing.

```
### YYYY-MM-DD — Short title

- **Date:** YYYY-MM-DD
- **Decision:** What was chosen, in one or two sentences.
- **Rationale:** Why this and not another approach.
- **Status:** proposed | active | in progress | shipped | dropped
- **Notes:** Links, PR numbers, or follow-ups. Optional.
```

| Status | Means |
|---|---|
| proposed | Written down, not accepted |
| planned | Accepted as future work, not started |
| active | Accepted and in force (a rule, not a feature) |
| in progress | Accepted, code not finished |
| shipped | In the tree players or operators already have |
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
- **Decision:** WO-1: fix the SPAWN PROTECTION label so it clears.
- **Rationale:** Top playtest bug. The change is small and isolated.
- **Status:** in progress.
- **Notes:** The label exists in the current client (`#protTag`). The fix is not in this tree.

### 2026-10-20 — No parallel edits in unaudited regions

- **Date:** 2026-10-20
- **Decision:** No parallel pull requests may touch economy/save code, bots, mode HUD rules, or camera until a code audit has mapped those regions.
- **Rationale:** Avoid merge collisions.
- **Status:** active.

### 2026-10-20 — Planned work, waiting on the code audit

- **Date:** 2026-10-20
- **Decision:** The following are planned. Priority order is not decided. They wait on the code audit named in the sequencing rule.
  - Rail Yard camera clips through walls.
  - Free-for-All still shows teams.
  - Search & Destroy shows kills-to-win.
  - Loading tips that do not apply to the mode.
  - `BiquadFilter` 16000 console warning.
  - Fewer steps to enter a match.
  - Bots that play passively.
  - Gear stat advantages; move gear to cosmetic-only.
  - Empty online lobby; bot backfill / matchmaking.
- **Rationale:** Known playtest and design follow-ups. Order is explicitly TBD.
- **Status:** planned.
- **Notes:** None of these are released. The 16000 Hz filter value is set in the game's audio code today (`BiquadFilter.frequency` clamped with an upper bound of 16000). That line is the current behavior, not a fix.
