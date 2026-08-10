Implementation is split into 5 independent batches by play-pattern/complexity (see design.md's "Risks" section on why). Each batch is delegated and merged separately; batches only ever ADD optional fields to shared files (`rooms/types.ts`, `roomStore.ts`, `rooms.route.ts`, `HubPage.tsx`), never restructure existing ones, to keep merges mechanical.

## Batch A — Pass-and-play: Bomb Party, ¿Quién es más probable?, 10/10

- [x] A.1 Content banks: `bomb-party-silabas.json` (≥60 syllables), `bomb-party-categorias.json` (≥20 categories), `quien-es-mas-probable.json` (≥90 prompts across familiar/fiesta/subido_de_tono, ≥30 each), `diez-de-diez-cualidades.json` + `diez-de-diez-peros.json` (≥30 each per suave/picante, ≥60 each total)
- [x] A.2 `loader.ts`: load/validate all four new banks, volume-minimum gates
- [x] A.3 `content.ts`: `GET /juegos/api/bomb-party/silaba?modo=silaba|categoria&sessionId=`, `GET /juegos/api/quien-es-mas-probable/prompt?dureza=&sessionId=`, `GET /juegos/api/diez-de-diez/ronda?intensidad=&sessionId=` — reuse the exact per-filter shuffle-bag pattern already in this file
- [x] A.4 Unit tests for the three new endpoints (category/intensity scoping, unknown-value 400)
- [x] A.5 Frontend: `juegos/frontend/src/games/bombparty/BombParty.tsx` (name+lives+timer-range setup, hidden-timer round loop, elimination, winner screen), `juegos/frontend/src/games/quienesmasprobable/QuienEsMasProbable.tsx` (name setup, prompt+tally loop, running scoreboard, end summary), `juegos/frontend/src/games/diezdediez/DiezDeDiez.tsx` (intensity setup, combined-prompt loop, optional sí/no tally)
- [x] A.6 `HubPage.tsx`: add all three under "Un móvil"

## Batch B — Team play: Tabú, Mímica

- [x] B.1 Content banks: `tabu-cartas.json` (≥80 cards, each `{palabra, prohibidas: string[4-5], categoria}`), `mimica-cartas.json` (≥80 items, each `{texto, categoria}`)
- [x] B.2 `loader.ts`: load/validate both, volume-minimum gates, verify every Tabú card has 4-5 forbidden words
- [x] B.3 `content.ts`: simple `GET /juegos/api/tabu/cartas?categoria=` and `GET /juegos/api/mimica/cartas?categoria=` — these can return a shuffled batch rather than one-at-a-time if simpler, since there's no live session concept here beyond the local game
- [x] B.4 Frontend: shared team-turn module (team setup, timer, card reveal-gate, scoreboard) used by both `juegos/frontend/src/games/tabu/Tabu.tsx` and `juegos/frontend/src/games/mimica/Mimica.tsx`; Tabú gets the "Acierto"/"¡Prohibida!" buttons + rules-reference "?" overlay, Mímica gets "Acierto"/"Pasar" (config pass-penalty)
- [x] B.7 `HubPage.tsx`: add both under "Equipos, un móvil"

## Batch C — Multi-device rooms: Respuestas falsas, Stop

- [x] C.1 Content bank: `respuestas-falsas-preguntas.json` (≥60 `{pregunta, respuestaReal}` pairs)
- [x] C.2 `rooms/types.ts`: extend `GameType` with `'respuestas-falsas-live' | 'stop-live'`; add `room.respuestasFalsas?`/`room.stop?` optional state (own namespace, don't touch `room.trivia`/`room.impostor`)
- [x] C.3 `games/respuestasFalsasLive.ts`: submit-fake-answer → shuffle+broadcast → vote (self-vote rejected) → reveal+score, per spec.md
- [x] C.4 `games/stopLive.ts`: start-round (random letter, category list) → per-category submissions → first "¡Stop!" ends the round for everyone → automatic 10/5/0 scoring, per spec.md
- [x] C.5 `ws.route.ts`/`rooms.route.ts`: wire the two new message types into the existing dispatch-by-`gameType` pattern
- [x] C.6 Unit tests: self-vote rejection, fooled-player scoring math (Respuestas falsas); stop-cutoff timing, duplicate-vs-unique scoring (Stop)
- [x] C.7 Frontend: `juegos/frontend/src/games/live/RespuestasFalsasLive.tsx`, `juegos/frontend/src/games/live/StopLive.tsx`, room-creation category/config options in `RoomLobby.tsx`
- [x] C.8 `HubPage.tsx`: add both under "En vivo"

## Batch D — Coup (multi-device room, standalone)

- [x] D.1 `rooms/types.ts`: `GameType` gains `'coup-live'`; `room.coup?: CoupState` (hidden per-player influence cards, coins, court deck, `pendingAction`)
- [x] D.2 `games/coupLive.ts`: full action/challenge/block/resolution state machine per design.md's `pendingAction` model and spec.md's scenarios — income/foreign-aid/coup as unconditional actions; Duke/Assassin/Captain/Ambassador as claimed actions with their specific counters; challenge resolution (reshuffle+redraw on a true claim, influence loss on a false one); elimination at zero influence; win at one player remaining
- [x] D.3 Unit tests: every action/challenge/block combination from the owner's spec resolves correctly (this is the highest-value test coverage in the whole batch — Coup's rules are unforgiving of off-by-one mistakes)
- [x] D.4 Frontend: `juegos/frontend/src/games/live/CoupLive.tsx` — private hand view, action declaration, challenge/block response window with a visible timer, elimination/winner screens, and an always-reachable "?" rules reference (character actions + their counters)
- [x] D.5 `HubPage.tsx`: add under "En vivo"

## Batch E — Hombre Lobo (multi-device room, standalone)

- [x] E.1 `rooms/types.ts`: `GameType` gains `'hombre-lobo-live'`; `room.hombreLobo?: HombreLoboState` (per-player role, alive/dead, current `phase`, night-action collection, day votes, death log)
- [x] E.2 `games/hombreLoboLive.ts`: phase state machine per design.md (`noche-lobos → noche-vidente → noche-bruja → resolucion-noche → dia-debate → dia-votacion → resolucion-dia → repeat|fin`); role assignment scaled to player count (~1 lobo/3-4 players, configurable override); private per-role prompts via `whisper`-equivalent (`toPlayer` map) delivery (reuse the exact mechanism `impostorLive.ts` uses to hide the word from the impostor); Cazador revenge-kill interrupt; win-condition check after every elimination
- [x] E.3 Unit tests: role assignment scaling; private prompts never leak to other sockets; Cazador interrupt fires on both night and day elimination; both win conditions trigger at the correct threshold
- [x] E.4 Frontend: `juegos/frontend/src/games/live/HombreLoboLive.tsx` — role reveal (private), night-phase "algunos jugadores están actuando..." holding screen for non-acting players, private action prompts for acting roles, day debate timer + voting UI, death log, always-reachable "?" rules reference (one card per role) and death log
- [x] E.5 `HubPage.tsx`: add under "En vivo"

## Verification (per batch, before merging)

- [ ] V.1 `npm run build` (backend) and `npm run build` (frontend) compile cleanly for the batch's worktree
- [ ] V.2 Backend unit tests for the batch pass
- [ ] V.3 After all batches are merged into one integration branch: full backend/frontend build+test pass together, `npm run build` for Docker Dockerfile sanity (per the CI lockfile lesson from earlier `juegos` changes — use `npm install`, not `npm ci`, matching the rest of the app)
- [ ] V.4 Manual playtests (owner, post-deploy, cannot be automated): one per new game, at minimum Coup and Hombre Lobo given their complexity
