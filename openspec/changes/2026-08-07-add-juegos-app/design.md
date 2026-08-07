## Context

Seven sibling subapps already exist on the same stack — Fastify + TypeScript backend, React + Vite + TypeScript frontend, joined to the external `calendario-net` Docker network, gated by a hand-rolled Keycloak JWT verification copied per app. All of them gate access to a subset of roles (`admin` only, or `admin`+`familia`), and none of them has any real-time/push infrastructure — every existing API is plain request/response.

`juegos` breaks two of those patterns on purpose: access is open to any authenticated role (including `invitado`, which currently has access to nothing), and two of its five games need a server-coordinated live session instead of a stateless request/response cycle. The production VPS already runs Postgres, Keycloak, seven subapps' worth of Node processes, and microk8s in parallel — the live-game layer has to stay cheap: no Redis, no second database, no horizontal scaling story, because every subapp here runs as exactly one container.

## Goals / Non-Goals

**Goals:**
- Ship a party-game hub the group can actually use for a full ~4-hour weekend session without the content repeating.
- Reuse the same domain logic (roles, word/question selection, voting) between the pass-and-play and live variants of El Impostor, rather than building two unrelated implementations.
- Keep the live-game infrastructure (WebSocket rooms) simple enough to run on a single process with no new infrastructure component.
- Make `juegos` visible to every logged-in user, establishing the "any authenticated role" access pattern cleanly so a future subapp can reuse it.

**Non-Goals:**
- No Hundir la Flota, Pictionary/live drawing, or Mafia/Lobos-style night-phase games in v1 — each needs materially more state (grid combat, shared canvas streaming, or asymmetric night/day phases) and is deferred to a v2.
- No persistence of past games, scores across sessions, or player statistics — a room's state is thrown away once the game ends or the room is abandoned.
- No admin UI for managing content banks — words/questions/prompts are static, versioned JSON shipped with the backend. Editing means editing the JSON and redeploying, same as any other static content in this monorepo. If the group outgrows this (wanting to add content without a redeploy), a `juegos_admin` role + CRUD UI is a contained follow-up.
- No horizontal scaling of the WebSocket layer (no Redis pub/sub, no sticky-session concerns beyond what a single container already gives for free) — matches every other subapp's single-instance deployment.
- No anonymous/guest play without a Keycloak account — every player is an already-authenticated user of the monorepo, consistent with the owner's requirement.

## Decisions

### Access guard: "any valid role" instead of a role allowlist

Every existing subapp's middleware calls something like `hasAnyRole(user, ['admin'])`. `juegos` instead only requires `authMiddleware` (valid, non-expired Keycloak JWT) with no role check at all — `admin`, `familia`, and `invitado` all pass. This is a new, smaller guard function (`requireAuthenticated`, not `requireRole`), not a hack of stuffing `['admin','familia','invitado']` into the existing role-array pattern, so the intent ("anyone with a login") is explicit at the call site rather than implied by listing every current role (which would silently under-grant access if a new role were ever added).

### No database: content is static JSON, room state is memory-only

Unlike `mapacyd`/`gastos`/`ofertas`/`paraisos`, `juegos` needs no Postgres database. Two kinds of state exist, and neither needs a table:
- **Content banks** (words, questions, prompts) — read-only at runtime, versioned in git as JSON files under `juegos/backend/src/content/`, loaded into memory at boot. Curated content that changes rarely is a deploy-time concern, not a database concern.
- **Room/session state** — inherently ephemeral (a party game lasts a few hours at most, never needs to survive a restart), held in a single `Map<roomCode, RoomState>` in the backend process.

This keeps `juegos` closer to `ytdl` (stateless, no DB) than to `gastos` (owns a database) in operational footprint, despite being a more feature-rich subapp.

### Shared domain logic between pass-and-play and live Impostor

Both Impostor variants use the same core module (`impostorGame.ts`): given a player count and a word-bank category, pick a word via the shuffle-bag, assign exactly one player as the impostor, and expose `startRound()`/`revealRoles()`/`recordVote()`. The **pass-and-play** frontend calls this logic client-side (imported into the frontend bundle, or re-served through a simple `POST /juegos/api/impostor/round` that returns the same shape without persisting anything). The **live** variant runs the identical module server-side inside a `RoomState`, pushing each player's role to their own socket instead of rendering it on a shared screen. This avoids maintaining two divergent implementations of "how Impostor works" and means a bug fix in the round logic benefits both modes at once.

### Content volume and no-repeat guarantee: shuffle-bag per room/session

The owner's group plays ~4 hours, ~8 players, almost every weekend — a naive `pickRandom(pool)` would repeat words/questions constantly within a single session and very likely across consecutive weekends with a small pool. Two things address this:
1. **Pool size**: curated content banks large enough that a full weekend session doesn't exhaust them under normal play — ~300 words (Impostor, split across categories like food, animals, everyday objects, professions, places), ~500 categorized questions (Trivia: general knowledge, movies, sports, history, science, music), ~150 prompts each for Yo Nunca and Verdad o Reto (split evenly between "verdad" and "reto" prompts).
2. **Draw algorithm**: a shuffle-bag (Fisher–Yates shuffle of the full pool at session start, draw sequentially, reshuffle only once the bag is empty) scoped to one game session (one pass-and-play sitting, or one live room) — guarantees zero repeats until the entire bank has been used once, unlike sampling-with-replacement which can repeat immediately.

Cross-weekend repetition (bank exhausted this weekend, so next weekend reshuffles from the start) is accepted as a v1 trade-off — a ~300-500 item pool reshuffling weekly is a reasonable repeat interval for a casual group game, and tracking "don't repeat across sessions" would require persistence this design deliberately avoids (see Non-Goals).

### WebSocket room layer

`@fastify/websocket` (official Fastify plugin, already fits the existing Fastify-per-subapp pattern — no new HTTP framework). One route, `/juegos/api/ws`, handles both games' connections; the room's `gameType` (`impostor-live` | `trivia-live`) is set when the room is created and dispatches to the matching game module.

```
Room lifecycle:
  1. Host creates a room  → POST /juegos/api/rooms { gameType } → { roomCode }
  2. Players connect      → WS /juegos/api/ws?token=<jwt>&room=<roomCode>
  3. Server validates JWT, adds player to RoomState, broadcasts updated player list
  4. Host starts the game → server runs the matching game module, pushes
     per-player or broadcast messages depending on the event (role assignment
     is per-player; question/timer/scoreboard updates are broadcast)
  5. Game ends / room idle > 2h → RoomState is dropped from the Map
```

- **Auth on the WS upgrade**: the JWT travels as a query param (`?token=`), mirroring `storage`'s existing workaround for contexts where custom headers aren't available — browsers' native `WebSocket` constructor cannot set an `Authorization` header.
- **Reconnection**: a disconnected socket doesn't immediately remove the player from `RoomState` — a ~60s grace period keeps their slot (and, for Impostor, their already-assigned role) so a dropped mobile connection can rejoin without restarting the game. After the grace period, the slot is freed.
- **No cross-instance concerns**: because every subapp is a single Docker instance, `Map<roomCode, RoomState>` living in one process is sufficient — no pub/sub, no sticky sessions beyond nginx already routing all traffic for a given path to the one running container.

### Room codes

4-character alphanumeric codes (uppercase, excluding visually ambiguous characters like `0`/`O`/`1`/`I`), generated server-side on room creation, checked for collision against the live `Map` (regenerate on collision — the room count at any moment is small, so this is effectively O(1)). Short enough for a host to read aloud to a table of friends.

## Risks / Trade-offs

[Risk: a backend restart mid-game destroys all active rooms, unlike a disconnect which has a grace period] → Mitigation: accepted for v1 — this is a casual party tool, not a system with an uptime SLA; a restart mid-session means starting a new room, which is a minor inconvenience, not data loss (nothing of lasting value was ever persisted).

[Risk: content banks are static, so refreshing them requires a code change + redeploy, not a quick in-app edit] → Mitigation: intentional trade-off to avoid building a content-management UI before it's known whether the group will even want to edit content themselves; the JSON files are easy to hand-edit and redeploy in the meantime, and the shuffle-bag + large pool size means this need shouldn't arise often.

[Risk: opening a subapp to `invitado` for the first time might reveal something unintended if the guard is implemented incorrectly] → Mitigation: the new `requireAuthenticated` guard is a separate, narrowly-scoped function (not a modification of `hasAnyRole`), and is unit-tested to confirm it accepts all three roles and rejects a missing/invalid token — no existing subapp's guard logic is touched.

[Risk: WebSocket infrastructure is new to this monorepo — more surface for bugs than the well-worn request/response pattern] → Mitigation: scoped to exactly one new route (`/juegos/api/ws`) inside one subapp; the two live games share the same room/connection-handling code, so there's one WS code path to get right, not two independent ones.

[Risk: cross-weekend content repetition once a pool is exhausted] → Mitigation: explicitly accepted (see Decisions) — pool sizes are chosen to make same-session repeats effectively impossible and cross-weekend repeats infrequent; can be revisited if the group finds it noticeable in practice.
