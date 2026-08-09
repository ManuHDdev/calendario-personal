## Context

`juegos` already established three reusable patterns:
1. **Pass-and-play content games** (El Impostor, Yo Nunca, Verdad o Reto): a static JSON content bank, a session-scoped `ShuffleBag` per filter combination in `content.ts` (keyed by a client-generated `sessionId`), and a client-side React state machine that calls a simple `GET .../prompt` endpoint. No server-side game state at all.
2. **Multi-device rooms** (Impostor en vivo, Trivia en vivo): `POST /juegos/api/rooms` creates a `RoomState` in an in-process `Map<roomCode, RoomState>`; players join via `GET /juegos/api/ws?token=&room=`; a `gameType`-specific module (`impostorLive.ts`, `triviaLive.ts`) handles the game logic and returns `Delivery` objects (broadcast/whisper/error) that `ws.route.ts` sends out. ~60s reconnection grace period is handled once, centrally, in `roomStore.ts` — every live game gets it for free.
3. **Shared taxonomy conventions**: single-select-plus-combined-option pickers (category, dureza, "todas"/"mezcla") for content filtering, established across all three content games.

This change adds a **fourth pattern — team play on a shared device** (Tabú, Mímica) — which turns out to need none of the room infrastructure: since one device is physically shared/passed between team members, the state machine is exactly as client-local as pass-and-play, just with a scoreboard keyed by team instead of by content category.

## Goals / Non-Goals

**Goals:** each new game reuses the closest existing pattern rather than inventing new infrastructure; Coup and Hombre Lobo (the two hardest games) get an in-app rules reference; every game respects the existing `requireAuthenticated` (any role) access model — no new auth pattern.

**Non-Goals:** no voice narration for Hombre Lobo (text-on-screen only — TTS is a possible follow-up, not in scope); no AI/NLP validation of Stop's answers or Bomb Party's words (both explicitly rely on the group validating out loud, per the owner's own spec); no persistence of scores/history across sessions (matches the rest of `juegos`); Coup's 2-player variant is explicitly out of scope (owner flagged it as a "maybe later").

## Decisions — pass-and-play games

### Bomb Party
Client-side state holds: player list (names, entered at setup like El Impostor), lives remaining per player (config, default 3), current holder, and a **hidden** target explosion time computed client-side at round start as `now + random(minSeconds, maxSeconds)` (config, default 15-45s) and never rendered to the screen — only a generic "pásalo" prompt, so the group genuinely doesn't know when it'll go off. `GET /juegos/api/bomb-party/silaba?sessionId=` (shuffle-bag, no-repeat-until-exhausted per session, same mechanism as everything else) returns a syllable; a `?modo=categoria` variant draws from the categories bank instead. When the timer elapses, the current holder loses a life (config), is eliminated at 0 lives, and the round restarts with a fresh syllable/timer among remaining players; game ends when one player has lives left.

### ¿Quién es más probable que...?
Setup: enter player names (reuse El Impostor's name-entry component). Each round: draw a prompt (`GET /juegos/api/quien-es-mas-probable/prompt?dureza=&sessionId=`, same familiar/fiesta/subido_de_tono taxonomy pattern as everywhere else, single-select + "mezcla"), show it, then a **tally screen**: one tap-counter per registered player name, the host taps once per raised hand, "Ver resultado" reveals who got the most taps and increments their running "veces señalado" total. Continuous rounds; a "Terminar partida" button shows the end-of-night summary (most-pointed-at player, per-player totals).

### 10/10
Two independent banks (`cualidad`, `pero`) drawn from two independent per-session shuffle-bags and combined client-side each round (`GET /juegos/api/diez-de-diez/ronda?intensidad=suave|picante&sessionId=` returns `{cualidad, pero}` drawn together so both respect the same intensity filter). Optional vote screen reuses the same show-of-hands tap-counter pattern as ¿Quién es más probable? (Sí/No), showing a percentage. No win condition — continuous rounds.

## Decisions — team play, shared device

### Tabú and Mímica share one client-side "team turn" module
Both games: setup (team names, ≥2 teams), then a turn loop — active team's device shows one card at a time (word+forbidden list for Tabú, word/phrase+category for Mímica) behind a "toca para revelar" gate (so it's not visible until the describing player is ready and holding the phone privately), a running turn timer (config, default Tabú 60s / Mímica 60-90s), and per-card buttons: Tabú has "Acierto" / "¡Prohibida!" (called by an opposing team, discards the card without scoring); Mímica has "Acierto" / "Pasar" (config: costs a point or free). At timer end, the round's correct count adds to that team's score; turn rotates to the next team. Config: rounds or target score to end the game. Both content banks support category filtering (same single-select+combined pattern).

### Tabú's rules-reference button
A "?" button during a team's turn opens a short overlay: reminds the describer they can't say the word, any forbidden word, "rima con", or use gestures — visible without pausing the timer.

## Decisions — multi-device rooms

### Respuestas falsas (`gameType: 'respuestas-falsas-live'`)
New content bank: `{pregunta, respuestaReal}` pairs (the real answer is never sent to clients until reveal). Round flow: host starts a question → server broadcasts the question (not the answer) and opens a submission window → each player sends a fake answer over WS → once all have submitted (or the host forces it), server shuffles [all fake answers + the real answer] and broadcasts the shuffled list with opaque ids → each player votes an id, excluded from voting for their own submission's id (tracked server-side, not by trusting the client) → server reveals which id was real and who submitted each fake, computes scores (+1 per player who guessed correctly, +1 per player fooled by your fake answer), broadcasts the scoreboard. Reuses the exact WS message shape (`broadcast`/`whisper`/`error` `Delivery` objects) `triviaLive.ts` already established.

### Stop / Basta (`gameType: 'stop-live'`)
Round flow: host starts a round → server picks a random letter (config: exclude hard letters like Ñ/X/W) and broadcasts it with the fixed category list → each player fills categories client-side and can submit at any time; the **first** "¡Stop!" received by the server ends the round immediately for everyone (broadcast `round-stopped`) → server collects whatever each player had submitted at that moment (partial submissions count, empty = 0 for that category) → server computes scores automatically per category: a non-empty answer unique across all players = 10, non-empty but matching another player's (case/accent-insensitive compare) = 5 each, empty = 0 — no real-word validation, exactly as specified. Broadcasts the full per-player, per-category grid so the group can eyeball/veto answers out loud (the app does not remove points based on a verbal veto — that's a live "gentleman's agreement" outside the app's scope, matching the owner's spec that validation is manual).

### Coup (`gameType: 'coup-live'`)
Server holds the full authoritative state: each player's 2 influence cards (hidden — only sent to that player, `whisper` delivery), coins, the shared court deck. Turn-based action → challenge/block window (server tracks who has responded and what the current pending action is) → resolution exactly per the owner's rules (income/foreign aid/coup as unconditional actions; Duke/Assassin/Captain/Ambassador as claimed actions; challenge reveals-or-loses-influence; block-then-challenge nested resolution). This is state-machine-heavy — implement as an explicit `CoupState` with a `pendingAction: {type, actor, target?, blockers: [], challengers: []} | null` field rather than free-form message handling, so the challenge/block window logic has one clear place to live. **In-app rules reference** ("?" button): character actions and their counters (who can block what), always reachable, since this is the one game where forgetting a rule genuinely stalls the table.

### Hombre Lobo (`gameType: 'hombre-lobo-live'`)
The app is the moderator: a `phase` state machine (`noche-lobos → noche-vidente → noche-bruja → resolucion-noche → dia-debate → dia-votacion → resolucion-dia → [repeat or fin]`), advancing automatically or on a host "siguiente fase" tap. Each night sub-phase sends a **private** WS message only to the player(s) with that role (`whisper`, reusing the exact mechanism Impostor en vivo already uses to keep the word hidden from the impostor) asking for their action; everyone else sees a generic "algunos jugadores están actuando..." screen — nobody's screen reveals who's being prompted, which is what makes this work without a human moderator. Role assignment scales by player count per the owner's ~1 lobo per 3-4 players guideline (config override available). Cazador's "revenge kill" is handled as an interrupt: whenever the resolution step eliminates the Cazador (night or day), the server immediately asks that player (who is dead but still has one more action) to pick a target before continuing. Win conditions checked after every elimination (day or night): lobos ≤ 0 → aldeanos win; lobos ≥ aldeanos vivos → lobos win. **In-app rules reference** ("?" button): one card per role explaining what it does, reachable any time, plus a persistent "quién ha muerto y cuándo" log so players who lose track can catch up.

## Risks / Trade-offs

[Risk: this is nine games in one change — review/testing depth per game is necessarily shallower than a single-game change would get] → Mitigation: implementation is delegated in isolated batches by play-pattern (pass-and-play, team, and per-room-game for the complex ones), each independently build/test-verified before merging, same discipline as every prior `juegos` change.

[Risk: Hombre Lobo and Coup are both large enough to be their own subapp-sized effort] → Mitigation: each gets its own dedicated implementation batch (not bundled with anything else) precisely because of this.

[Risk: Stop's automatic duplicate-based scoring can't tell a real word from a plausible-looking fake, unlike a human judge] → Mitigation: explicitly accepted — this is exactly what the owner's spec says ("la app no verifica automáticamente si son palabras reales"); the group is expected to veto out loud, same social contract as the physical game.

[Risk: adding four new room `gameType`s multiplies the surface of `rooms.route.ts`/`roomStore.ts`/`types.ts` that different implementation batches all need to touch] → Mitigation: each game's `RoomState` fields are added under its own optional namespace (`room.coup?`, `room.hombreLobo?`, etc.), exactly like `room.trivia?`/`room.impostor?` already coexist — batches should only ever add a new optional field, never restructure an existing one, to keep merges mechanical.
