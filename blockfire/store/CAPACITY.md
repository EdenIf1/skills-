# How many players the game can handle (goal: 10,000 users)

## How it is built
- **Accounts and saves:** Supabase (database). One player = one row of 1–4 KB.
- **Online play:** each room runs on the host's phone (peer-to-peer). The central server only introduces players to each other ("matchmaking"); it does not carry the game itself.
- **Open-room list:** a small Supabase table; each host refreshes its row every 15 seconds.

## What was actually tested (one test machine, 4 cores)
| Test | Result |
|---|---|
| 10 rooms at once (20 players), 45 s of nonstop fire | 10/10 connected (1.3–2.7 s), zero errors |
| 20 rooms at once (40 players) | 20/20 connected and stayed connected, zero errors |
| Full 12-player room | passes (multiplayer suite, scenario 3b) |
| Size of one player save | 1.1 KB new · 4.3 KB with everything unlocked |

On the test machine every "phone" shares the same CPU, so the update rate dropped with 20 rooms. In real life every player has their own phone.

## Estimate for 10,000 registered users
| Resource | Expected use | Free-plan limit | Verdict |
|---|---|---|---|
| Monthly active users | up to 10,000 | 50,000 | ✓ |
| Database size | ~40 MB | 500 MB | ✓ |
| Saves | during a match at most once every 30 s per player (on the phone itself every second) | — | ✓ |
| Outgoing traffic | a save returns only a timestamp, not the whole save | 5 GB / month | ✓ for a few hundred players at once; beyond that, Pro |
| Backups | none on the free plan | — | ✗ Pro recommended |

**Recommendation:** up to a few thousand users the free plan is enough (with the daily keep-alive). Once many people play every day, move to Supabase Pro ($25/month): 100,000 users, 8 GB, 250 GB traffic and daily backups.

## The real bottleneck: the multiplayer matchmaking server
- The game currently uses the free public PeerJS server. It has no availability guarantee and no published limits, and PeerJS itself recommends running your own for production.
- **The switch is already built in:** the admin panel has an "Own multiplayer server" field. Enter a wss://… address and every installed app moves to the new server, with no store update.
- Your own PeerJS server is one command (`docker run -p 9000:9000 peerjs/peerjs-server`) on a small server (~$5/month, e.g. Fly.io, Render or DigitalOcean).
- The "TURN" relay servers (the fallback route when a direct connection is impossible, e.g. on strict mobile networks) are currently free public ones. At 10,000 users use a paid TURN service or Cloudflare's.

## Already protected against load
- During a match a save goes online at most every 30 seconds (immediately at match end, after a purchase and when the app closes).
- The room list shows only rooms refreshed in the last minute, and one host = one listed room.
- Rate limits on support messages and crash reports on the server.
- A room holds at most 12 players (4 in Zombies); beyond that the room is "full".

Sources: [Supabase pricing overview](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/), [Supabase Free Plan](https://costbench.com/software/database-as-service/supabase/free-plan/), [PeerServer – self-hosting](https://peerjs.com/peerserver.html), [PeerJS docs](https://peerjs.com/docs).
