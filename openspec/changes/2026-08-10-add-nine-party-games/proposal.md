## Why

The owner's group wants a much bigger catalog: nine named party/board games, spanning three very different play patterns already partially established in `juegos` (client-only pass-and-play, shared-device team play, and server-orchestrated multi-device rooms). This is the largest single expansion of `juegos` since it launched — comparable in scope to the original app across all nine games combined.

## What Changes

Nine new games, grouped by play pattern (reused from the existing architecture, not reinvented):

**Pass-and-play, client-side state (mirrors El Impostor / Yo Nunca / Verdad o Reto's existing pattern — content bank + shuffle-bag API, state machine lives in the browser):**
- **Bomb Party**: syllable (or category) shown, players pass a turn saying a matching word, a hidden random countdown "explodes" on whoever holds the turn, lives-based elimination.
- **¿Quién es más probable que...?**: prompt bank, players registered by name at setup, host taps up a show-of-hands tally per round, running "times pointed at" scoreboard, no win condition (continuous rounds + end-of-night summary).
- **10/10**: two independent banks (`cualidad` + `pero`) combined randomly per round, optional show-of-hands sí/no tally, suave/picante intensity toggle.

**Team play, shared device per team (new pattern, but architecturally identical to pass-and-play: content bank + client-side turn/timer/scoreboard state machine, no server coordination needed since the device itself is shared):**
- **Tabú**: word + 4-5 forbidden words per card, per-team timed turn, correct/forbidden-called buttons, team scoreboard across rounds.
- **Mímica**: word/phrase + category per card, per-team timed turn, correct/pass buttons, team scoreboard across rounds.

**Multi-device rooms (extends the existing `@fastify/websocket` room layer that already powers Impostor en vivo / Trivia en vivo — new `gameType`s, same `RoomState`/reconnection/host-authority patterns):**
- **Respuestas falsas** (Fibbage-style): hidden real-answer question bank, players submit fake answers, shuffled reveal, vote (not on own answer), scoring for correct guesses and for fooling others.
- **Stop / Basta / Tutti Frutti**: random letter, simultaneous per-category form-fill across devices, any player can call "¡Stop!" to cut everyone off, reveal-all for group validation, automatic duplicate-based scoring (10/5/0 — no dictionary validation, matches the owner's spec).
- **Coup**: full hidden-influence bluffing/economy game (5 character actions, challenges, blocks, elimination) — the most mechanically complex room game so far.
- **Hombre Lobo (Werewolf)**: the app acts as automatic narrator/moderator — orchestrates night phases (private per-role prompts), day debate timer, voting, and win-condition checks. Roles: Lobo, Aldeano, Vidente, Bruja, Cazador, scaled to player count. The most state-heavy game in the app.

**In-game help**: Coup and Hombre Lobo (and Tabú's forbidden-word rule) get an in-app "?" rules reference reachable mid-game, per the owner's explicit request, so no one needs to remember the full rule set.

## Capabilities

### Modified Capabilities
- `juegos`: nine new games added to the hub, three new room `gameType`s added to the WS layer (`respuestas-falsas-live`, `stop-live`, `coup-live`, `hombre-lobo-live` — four, not three; see design.md), new content banks.

## Impact

- New content bank JSON files: `bomb-party-silabas.json`, `bomb-party-categorias.json`, `quien-es-mas-probable.json`, `diez-de-diez-cualidades.json`, `diez-de-diez-peros.json`, `tabu-cartas.json`, `mimica-cartas.json`, `respuestas-falsas-preguntas.json`.
- `juegos/backend/src/content/loader.ts`: load/validate all new banks.
- `juegos/backend/src/routes/content.ts`: new pass-and-play endpoints for Bomb Party/¿Quién es más probable?/10/10 (Tabú and Mímica don't need session-scoped shuffle-bags in the same way — see design.md).
- `juegos/backend/src/rooms/*`: new `RoomState` shapes and game logic modules for the four new live games; `types.ts`'s `GameType` union extended.
- `juegos/frontend/src/games/*`: nine new game directories, `HubPage.tsx` updated to list all fourteen games (five existing + nine new), grouped by play pattern.
- No changes to El Impostor, Trivia en vivo, Yo Nunca, Verdad o Reto's existing logic, the AppLauncher, infra, Keycloak, or the access model.
