## 1. Backend scaffold (`juegos/backend/`)

- [x] 1.1 Scaffold `juegos/backend/` as Fastify + TypeScript, copying `ytdl/backend`'s `package.json`/`tsconfig.json`/project layout as the starting point (closest precedent: no database, no ORM)
- [x] 1.2 Copy `mapacyd/backend/src/middleware/auth.ts` verbatim into `juegos/backend/src/middleware/auth.ts` (same accepted duplication as the other subapps)
- [x] 1.3 New `requireAuthenticated` guard (valid JWT only, no role check) applied to every `/juegos/api/*` route except `/health`; missing/invalid token gets HTTP 401
- [x] 1.4 `GET /juegos/api/health` endpoint
- [x] 1.5 Install `@fastify/websocket`, register the plugin
- [x] 1.6 Env vars: `KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`, `PORT` (default 3008)

## 2. Content banks (static, curated)

- [x] 2.1 `juegos/backend/src/content/impostor-words.json` — ≥300 words across categories (comida, animales, objetos cotidianos, profesiones, lugares, deportes, famosos genéricos — no personas reales)
- [x] 2.2 `juegos/backend/src/content/trivia-questions.json` — ≥500 questions across categories (general, cine, deporte, historia, ciencia, música), each with 4 options and 1 correct answer
- [x] 2.3 `juegos/backend/src/content/yo-nunca.json` — ≥150 prompts
- [x] 2.4 `juegos/backend/src/content/verdad-o-reto.json` — ≥150 prompts (≈75 verdad / ≈75 reto, tagged accordingly)
- [x] 2.5 Content loader: parse + validate all four JSON files at boot (fail fast on malformed content), expose in-memory pools
- [x] 2.6 Unit tests: loader rejects malformed JSON; each pool meets its minimum size

## 3. Shuffle-bag draw mechanism

- [x] 3.1 `createShuffleBag<T>(pool: T[])` — Fisher–Yates shuffle at creation, `draw()` returns next item, reshuffles automatically once exhausted
- [x] 3.2 Unit tests: no repeat among draws before exhaustion; reshuffle occurs and drawing continues after exhaustion; works correctly for pool sizes of 1 and 2 (edge cases)

## 4. Pass-and-play content API

- [x] 4.1 `GET /juegos/api/impostor/word?categoria=` — draws from the shuffle-bag (scoped per client session token or per request, per design), returns `{ word, category }`
- [x] 4.2 `GET /juegos/api/yo-nunca/prompt` — draws a Yo Nunca prompt
- [x] 4.3 `GET /juegos/api/verdad-o-reto/prompt?tipo=verdad|reto` — draws a prompt of the requested type
- [x] 4.4 Unit tests: each endpoint returns content from the correct category/type; role guard allows all three roles

## 5. Impostor domain logic (shared between pass-and-play and live)

- [x] 5.1 `juegos/backend/src/games/impostorGame.ts` — pure functions: `assignRoles(playerIds, word)`, `startRound()`, `revealRoles()`, `recordVote(playerId, votedForId)`, `tallyVotes()`
- [x] 5.2 Unit tests: exactly one impostor assigned per round; impostor never receives the word; vote tally is correct given a set of votes

## 6. WebSocket room layer

- [x] 6.1 `POST /juegos/api/rooms` — creates a room (`{ gameType: 'impostor-live' | 'trivia-live' }`), generates a unique 4-char room code (regenerate on collision), registers the caller as host, stores `RoomState` in the in-process `Map<roomCode, RoomState>`
- [x] 6.2 `GET /juegos/api/ws?token=&room=` — WebSocket upgrade route; verifies the JWT from the query param, validates the room exists, adds the player to `RoomState`, broadcasts the updated player list
- [x] 6.3 Reconnection: on disconnect, mark the player's slot as "grace period" (~60s) instead of removing immediately; on reconnect with the same `room`+user within the window, restore their prior role/state; after the window expires, free the slot and notify remaining players
- [x] 6.4 Room cleanup: idle rooms (no host action / no connected players for >2h) are dropped from the `Map`
- [x] 6.5 Unit tests: unknown room code rejected; player list broadcasts correctly on join/leave; reconnection within grace period preserves role, reconnection after grace period does not

## 7. Impostor en vivo (live game)

- [x] 7.1 Host-only "start round" WS message: draws a word via the shuffle-bag, calls `impostorGame.assignRoles`, sends each player their own role privately (word or "eres el impostor")
- [x] 7.2 Discussion/voting phase: WS messages for casting a vote, broadcast of vote tally once all connected players have voted (or host forces reveal)
- [x] 7.3 Reveal: broadcasts who the impostor was and the word
- [x] 7.4 Unit tests: covered by section 5 (shared logic) plus a room-level integration test that only the impostor's socket receives the impostor payload

## 8. Trivia en vivo (live game)

- [x] 8.1 Host-only "start question" WS message: draws a question via the shuffle-bag, broadcasts it (without the correct answer) with a timer duration
- [x] 8.2 Answer submission: WS message per player; first answer per player per question is recorded, late answers (after timer expiry) are rejected
- [x] 8.3 Question close: broadcasts the correct answer and updated scoreboard (score increments for correct answers)
- [x] 8.4 Unit tests: one answer counted per player per question; late answers rejected; scoreboard math is correct across multiple questions

## 9. Frontend (`juegos/frontend/`)

- [x] 9.1 Scaffold `juegos/frontend/` as React + Vite + TypeScript, mirroring `ytdl/frontend`'s project setup (Keycloak login flow, no role-gating beyond "logged in")
- [x] 9.2 Game hub/menu: lists all five games, split into "Un móvil" and "En vivo" sections
- [x] 9.3 Pass-and-play El Impostor: local state machine (setup player count → reveal word/impostor per pass → discussion timer → vote → reveal), calling `GET /juegos/api/impostor/word`
- [x] 9.4 Pass-and-play Yo Nunca / Verdad o Reto: local state machine cycling through prompts via the respective endpoints
- [x] 9.5 Live room UI: create/join room screen (room code entry), lobby (player list, host-only "start" button), WebSocket client wrapper with automatic reconnect (carrying the JWT as `?token=`)
- [x] 9.6 Live Impostor UI: role reveal screen (private per player), discussion timer, voting UI, reveal screen
- [x] 9.7 Live Trivia UI: question + countdown timer, answer selection, live scoreboard
- [x] 9.8 `juegos/frontend/Dockerfile` mirroring `ytdl/frontend`'s

## 10. Infra wiring

- [x] 10.1 `infra/docker-compose.yml` + `.prod.yml`: `juegos-backend` + `juegos-frontend` services on the external `calendario-net` network, healthcheck against `/juegos/api/health` — DEVIATION: this monorepo does not actually keep all subapps in the root `infra/docker-compose*.yml` (that file only defines Calendario itself); every other subapp (ytdl, paraisos, etc.) ships its own `<subapp>/infra/docker-compose.prod.yml` instead, deployed independently by its own CI workflow. Followed that established convention: created `juegos/infra/docker-compose.prod.yml` mirroring `ytdl/infra/docker-compose.prod.yml` (no local-only compose file needed, same as ytdl, since juegos has no database).
- [x] 10.2 `nginx/calendario.conf`: new location block for `juegos`, including `Upgrade`/`Connection` headers on the WebSocket route so the reverse proxy doesn't break the upgrade
- [x] 10.3 `start-local.sh`/`start-local.ps1`: add `juegos-backend` (port 3008) and `juegos-frontend` (port 5180) to the local dev stack
- [x] 10.4 CI: GitHub Actions workflow for `juegos` mirroring the existing subapps' (build + push `ghcr.io` images)
- [x] 10.5 All 8 AppLauncher copies (`panel`, `storage`, `mapacyd`, `ytdl`, `gastos`, `ofertas`, `paraisos` frontends + `calendario-frontend`): add a `juegos` entry visible to `admin`, `familia`, and `invitado` (color, icon, local/prod URL)
- [x] 10.6 `infra/keycloak/realm-export.json` / `realm-export.prod.json`: add the `juegos` client/audience (no new roles) — DEVIATION: this realm does not actually give each subapp its own Keycloak client; every subapp frontend shares the single `calendario-frontend` public client, whose `redirectUris`/`webOrigins`/`post.logout.redirect.uris` list every subapp's local port. Followed that convention: added `http://localhost:5180/*` (and origin) to `realm-export.json`. `realm-export.prod.json` needed no change — prod already scopes the client to the domain wildcard (`https://elbunkerdelingeniero.duckdns.org/*`), which already covers `/juegos/`.
- [x] 10.7 Update `CLAUDE.md`: ports table (`juegos` :5180/:3008), and a new `## Juegos` section documenting stack/roles/routes/env vars following the existing per-subapp format — explicitly noting the "any authenticated role" access pattern as new

## 11. Verification

- [x] 11.1 `npm run build` (backend) and `npm run build` (frontend) both compile without errors
- [x] 11.2 Backend unit tests green (guard accepts all three roles + rejects invalid token, shuffle-bag no-repeat/reshuffle, content loader validation, Impostor role assignment, room join/reconnect, Trivia scoring)
- [ ] 11.3 Manual end-to-end, pass-and-play: play a full Impostor round on one phone with 4+ simulated players (pass the phone), confirm word/impostor reveal and no repeated word across multiple rounds in one sitting
- [ ] 11.4 Manual end-to-end, live: create an Impostor en vivo room from one device, join from 2+ other devices/browsers logged in as different users, run a full round (start → role reveal → vote → result), confirm the impostor never sees the word
- [ ] 11.5 Manual end-to-end, live: same for Trivia en vivo — run several questions, confirm scoreboard updates and late answers are rejected
- [ ] 11.6 Confirm an `invitado` account can open `juegos` from the AppLauncher and play, unlike every other subapp
- [ ] 11.7 Confirm a dropped WebSocket connection reconnecting within ~60s resumes the same role/state, and after ~60s the slot is freed
