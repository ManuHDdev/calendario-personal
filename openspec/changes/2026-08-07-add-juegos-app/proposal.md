## Why

The owner and their group of ~8 friends want a party-game hub for weekend get-togethers (~4 hours each, practically every weekend). The classic single-phone games (like "El Impostor") and a couple of live multiplayer games should live inside the same monorepo as the rest of their self-hosted tools, reachable from the shared AppLauncher, without needing a separate account per player — everyone already has a Keycloak login. No existing subapp covers this, and unlike every other subapp, access should not be gated to `admin` (or `admin`+`familia`) — any logged-in user, including `invitado`, should be able to play.

## What Changes

- Add a new subapp `juegos`: a party-game hub with two play modes.
  - **Pass-and-play (single device)**: El Impostor, Yo Nunca, Verdad o Reto. Game state lives entirely in the frontend; the backend only serves content banks (words/phrases) and never sees which player is doing what.
  - **Live (multi-device)**: El Impostor en vivo (same domain logic as the pass-and-play version, but roles are pushed to each player's own device over a WebSocket instead of passing the phone around) and Trivia en vivo (timed questions, live scoreboard). This is the monorepo's first real-time feature — a new `@fastify/websocket`-based room layer, with room state held in the backend process's memory (`Map<roomCode, RoomState>`), consistent with every subapp running as a single Docker instance.
- Access: any authenticated user (`admin`, `familia`, or `invitado`) — the first subapp in the monorepo not gated to a subset of roles. No dedicated `juegos_admin` role in v1 (see Design: content is static, not admin-editable through a UI).
- Content banks are large, curated, and shipped as static seed data (not user-editable in v1): ~300 words across categories for Impostor, ~500 categorized questions for Trivia, ~150 prompts for Yo Nunca, ~150 prompts for Verdad o Reto. A shuffle-bag mechanism (draw without replacement, reshuffle only once the pool is exhausted) is used per session so a group playing for hours doesn't see repeats until the whole bank has been used.
- Auth: Keycloak JWT, same hand-verified pattern as panel/storage/mapacyd/gastos/ofertas/paraisos, but the guard checks only "has a valid token" — no role allowlist. The WebSocket upgrade carries the JWT as a query param (`?token=`), the same workaround `storage` already uses for browser contexts that can't set custom headers.
- Docker: new `juegos-backend`/`juegos-frontend` images, joining the existing external `calendario-net` network; nginx route added to `calendario.conf`. No new database — content banks are bundled JSON, and room state is in-memory and ephemeral by design.

## Capabilities

### New Capabilities
- `juegos`: party-game hub — pass-and-play games (El Impostor, Yo Nunca, Verdad o Reto) with client-side state and server-provided content banks; live multiplayer games (El Impostor en vivo, Trivia en vivo) with WebSocket-coordinated rooms; large no-repeat content pools for all games.

### Modified Capabilities
(none — this is additive; no existing subapp's behavior changes)

## Impact

- New directory `juegos/` (backend + frontend) at the monorepo root, alongside `panel/`, `storage/`, `mapacyd/`, `gastos/`, `ofertas/`, `paraisos/`.
- No new Postgres database — content banks are static JSON bundled in the backend image; room/session state lives only in process memory and is never persisted.
- `infra/docker-compose.yml` (+ `.prod.yml`): two new services on `calendario-net`.
- `nginx/calendario.conf`: new location block for `juegos`, including WebSocket upgrade headers (`Upgrade`/`Connection`) on the WS route.
- All 8 AppLauncher copies (`panel/frontend`, `storage/frontend`, `mapacyd/frontend`, `ytdl/frontend`, `gastos/frontend`, `ofertas/frontend`, `paraisos/frontend`, `calendario-frontend`): add a `juegos` entry visible to **all three roles** (`admin`, `familia`, `invitado`) — the first entry in any of these lists not restricted to a subset.
- `infra/keycloak/realm-export.json` / `realm-export.prod.json`: no new realm roles needed (reuses the existing three), but a new client/audience for `juegos`'s JWT verification, same as every other subapp.
- No changes to Calendario, Panel, Storage, MapaCYD, Ytdl, Gastos, Ofertas, or Paraísos code beyond the AppLauncher entry above.
- Local dev: new ports (backend `:3008`, frontend `:5180`, next free slot after Paraísos) added to `start-local.sh`/`start-local.ps1` and the CLAUDE.md ports table.
