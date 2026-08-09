## 1. El Impostor domain logic (shared pass-and-play + live)

- [x] 1.1 Rewrite `impostorGame.ts`: `assignRoles(players, impostorCount, word)` supports N impostors (validate `1 <= impostorCount <= floor((playerCount-1)/2)`, reject otherwise); track per-player alive/eliminated state
- [x] 1.2 `recordVote`/`tallyVotes`: unchanged shape, but add `resolveElimination(votes)` — returns the most-voted player id, or `null` on a tie (no elimination)
- [x] 1.3 `checkGameEnd(state)` — returns `{ ended: false }` | `{ ended: true, winner: 'crew' }` (all impostors eliminated) | `{ ended: true, winner: 'impostors' }` (exactly 3 remain, impostor(s) present)
- [x] 1.4 Unit tests: N-impostor assignment respects the max; tie produces no elimination; crew-wins triggers the instant the last impostor is eliminated even with >3 players left; impostors-win triggers exactly at 3 remaining; a non-decisive elimination does not end the game and does not leak the eliminated player's role in the returned state

## 2. Pass-and-play Impostor frontend

- [x] 2.1 Setup: raise minimum player count to 4; add a name-entry step (one text input per player, placeholder "Jugador N", editable, duplicates allowed) after the count step
- [x] 2.2 Setup: add impostor-count stepper (1 to `floor((playerCount-1)/2)`), shown after names are entered
- [x] 2.3 Role-reveal pass: address each player by their entered name instead of "Jugador N"
- [x] 2.4 New round loop UI: discussion timer (existing) → voting screen (vote for one of the still-alive named players) → "X ha sido eliminado" announcement (name only, no role disclosed) → loop back to discussion, or final reveal screen if the game ended
- [x] 2.5 Final reveal screen: word, full list of who was/wasn't an impostor, winner (crew/impostors)
- [x] 2.6 Component/unit tests for the round loop state transitions (or integration test against `impostorGame.ts` if the frontend delegates the state machine to a shared module) — covered via `impostorGame.test.ts` (shared elimination logic that the pass-and-play UI mirrors client-side); the frontend package has no component-test runner configured (pre-existing repo-wide gap, see CLAUDE.md "Deuda técnica conocida")

## 3. Impostor en vivo (WS room layer)

- [x] 3.1 `RoomState` for `impostor-live`: track alive/eliminated players, current round votes, impostor count chosen by host
- [x] 3.2 Host "start round" WS message gains `impostorCount` param, validated server-side against the max
- [x] 3.3 New WS message types: `round-eliminated` (broadcast: eliminated player's name only, no role), `game-ended` (broadcast: full reveal — word, impostors, winner). Deviation: vote casting keeps the pre-existing `vote` message type (per player, per round) instead of introducing `cast-vote`, since its contract didn't change; the host-forced round-resolution message was renamed from `reveal` to `resolve-round` to match its new "may or may not end the game" semantics.
- [x] 3.4 Server-side round loop: the host forces round resolution (`resolve-round`) once discussion/voting is done; computes elimination, checks end conditions, either broadcasts `round-eliminated` and returns to discussion, or broadcasts `game-ended`
- [x] 3.5 Reconnection: a disconnected player's not-yet-cast vote simply doesn't count for the round (no special-casing beyond the existing ~60s grace period)
- [x] 3.6 Unit/integration tests: multi-round elimination sequence reaches both win conditions correctly; only the impostors' own sockets receive impostor-identifying data at any point before `game-ended`

## 4. Live Impostor frontend

- [x] 4.1 Host setup: impostor-count stepper before starting (lobby already has the player list from Keycloak identities)
- [x] 4.2 Round loop UI: discussion timer → voting (vote for a connected player) → elimination announcement (name only) → loop, or final reveal on `game-ended`
- [x] 4.3 Final reveal screen mirrors the pass-and-play one (word, impostors, winner)

## 5. Yo Nunca: categories

- [x] 5.1 Content schema: add `categoria: 'clasico' | 'picante' | 'fiesta'` to every item in `yo-nunca.json`; re-tag the existing ~150 prompts as `clasico` (they're already that tone) and author new `picante`/`fiesta` content
- [x] 5.2 Content volume: ≥80 prompts per category (≥240 total) — author the missing volume per design.md's tone guardrails (flirty/embarrassing/secret-revealing/party-themed; no explicit content). Final counts: clasico 150, picante 80, fiesta 80 — 310 total.
- [x] 5.3 `content.ts`: `yoNuncaBags: Map<string, ShuffleBag<string>>` keyed by category (mirrors `impostorBags`/`getImpostorBag`); `GET /juegos/api/yo-nunca/prompt?categoria=&sessionId=` — `categoria` optional, omitted/`todas` draws from the combined pool
- [x] 5.4 Unit tests: category-scoped draw only returns items from that category; unknown category returns 400; "todas" draws from the full combined pool
- [x] 5.5 Frontend: category picker (`clasico`/`picante`/`fiesta`/`todas`) in setup, before the first prompt is drawn

## 6. Verdad o Reto: categories + Modo SIN PAREJA

- [x] 6.1 Content schema: add `categoria: 'clasico' | 'picante' | 'fiesta'` and `nivel: 'estandar' | 'sin_pareja'` to every item in `verdad-o-reto.json`; re-tag existing ~150 prompts as `clasico`/`estandar` and author the missing categoria/nivel combinations
- [x] 6.2 Content volume: ≥15 items per (categoria × tipo × nivel) bucket (12 buckets), aiming for ~25/bucket — author per design.md's `sin_pareja` tone guardrails, additive not a content swap. Final counts: the pre-existing `clasico:verdad:estandar` and `clasico:reto:estandar` buckets have 75 each (untouched, just re-tagged); the 10 newly authored buckets have 20 each; 350 total.
- [x] 6.3 `content.ts`: `verdadORetoBags: Map<string, ShuffleBag<string>>` keyed by `${tipo}:${categoria}:${sinPareja ? 'con_sin_pareja' : 'estandar_solo'}`; `GET /juegos/api/verdad-o-reto/prompt?tipo=verdad|reto&categoria=&sinPareja=true|false&sessionId=`
- [x] 6.4 Unit tests: `sinPareja=false` never returns a `sin_pareja`-level item; `sinPareja=true` can return both levels; category/tipo filtering correct; missing/invalid `tipo` still returns 400 as before
- [x] 6.5 Frontend: category picker + "Modo SIN PAREJA" toggle in setup (toggle has the explanatory copy from design.md: off = safe even with couples present, on = unlocks bolder content)

## 7. Verification

- [x] 7.1 `npm run build` (backend) and `npm run build` (frontend) both compile without errors
- [x] 7.2 Backend unit tests green: elimination/win-condition logic, multi-impostor validation, category/nivel-scoped shuffle-bags for all three content types (73/73 passing)
- [ ] 7.3 Manual: play a full pass-and-play Impostor game with 5+ players and 2 impostors through to both a crew-win and an impostors-win outcome
- [ ] 7.4 Manual: play a full live Impostor room the same way, across multiple devices
- [ ] 7.5 Manual: confirm Yo Nunca and Verdad o Reto category pickers work, and Modo SIN PAREJA visibly changes the pool (spot-check a few draws)
