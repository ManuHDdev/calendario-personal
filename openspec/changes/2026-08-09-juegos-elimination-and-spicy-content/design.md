## Context

`juegos` shipped with a one-shot El Impostor (assign roles → discuss → vote once → reveal immediately) and flat, uncategorized content banks for Yo Nunca and Verdad o Reto. Real play with the group surfaced that this is too shallow: the group plays El Impostor as an elimination game (like the physical/party version it's modeled on), wants to name players instead of anonymous slots, wants more than one impostor for bigger groups, and wants to pick content tone (family-friendly vs spicy) per session rather than getting one fixed pool.

El Impostor's word-bank already has a per-category shuffle-bag pattern (`impostorBags: Map<string, ShuffleBag>`, keyed by category, in `content.ts`) — Yo Nunca and Verdad o Reto reuse that exact pattern rather than inventing a new one.

## Goals / Non-Goals

**Goals:**
- El Impostor plays as a real elimination game: repeated discuss→vote→eliminate rounds, ending only when the group has actually resolved who the impostor(s) were.
- Every player has a name in pass-and-play, not "Jugador N" — this matters for accusing/voting in the game itself.
- Multiple impostors, scaled to group size, so bigger groups (the owner's group is ~8) still have real deduction tension.
- Yo Nunca and Verdad o Reto let the group pick a tone (category) per sitting, and Verdad o Reto explicitly separates "always OK" content from "only if nobody here is dating each other" content.
- Content that's actually spicy/entertaining, not watered down — this is explicit, repeated feedback from the owner.

**Non-Goals:**
- No live (multi-device) versions of Yo Nunca / Verdad o Reto in this change — confirmed out of scope with the owner; they stay pass-and-play.
- No player naming in live Impostor — the Keycloak display name already serves that role there.
- No explicit sexual content, no content instructing real sexual acts, no content about specific real people outside the game, nothing illegal or framed as non-consensual. "Picante"/"sin pareja" means flirty, embarrassing, secret-revealing, drinking/party-themed — bold for a friend-group party game, not explicit.
- No persistence of round history, no "who won last time" stats — matches the existing no-DB, ephemeral-state design of `juegos`.
- No changes to Trivia en vivo in this change.

## Decisions

### El Impostor: elimination loop, not single-round reveal

New round/game state machine (`impostorGame.ts`, shared by pass-and-play and live):

```
  assignRoles(players, impostorCount, word)
        │
        ▼
  ┌─────────────┐
  │  discussion  │◀───────────────┐
  └──────┬──────┘                 │
         ▼                        │
  ┌─────────────┐                 │
  │    voting    │                 │
  └──────┬──────┘                 │
         ▼                        │
  eliminate most-voted player      │
  (tie → no elimination this round)│
         │                        │
         ▼                        │
  all impostors eliminated? ──yes─┼──▶ REVEAL: Crew wins
         │no                      │
         ▼                        │
  exactly 3 players remain? ──yes─┴──▶ REVEAL: Impostors win
         │no
         └──────────────────────────▶ back to discussion (next round)
```

- **No per-elimination reveal**: when a player is eliminated, the group is told *who* was eliminated but not *whether they were the impostor* — that information only surfaces at the final reveal. This is a deliberate, explicit requirement from the owner ("no se debe revelar el impostor tras una ronda"), not an oversight; it keeps every round's deduction genuinely blind rather than turning into a checklist.
- **Tie handling**: if the vote is tied for most-voted, nobody is eliminated that round and discussion continues. Simpler than a random tiebreak and avoids the frustration of losing a player to a coin flip.
- **Win conditions**: "Crew wins" the instant the last impostor is eliminated (checked right after every elimination, so the game doesn't drag on with zero impostors left). "Impostors win" if the game reaches exactly 3 remaining players with at least one impostor still in — this matches the owner's stated rule verbatim ("se revela cuando quedan 3 personas y una de ellas es el impostor").
- **The word is fixed for the whole game**, drawn once at the start (same as today) — not re-drawn per round.
- **Impostors don't learn each other's identity.** With multiple impostors, each impostor only knows their own role (word is hidden from them, same as before) — not who else is also an impostor. This keeps the deduction harder and requires no new coordination UI; it's a deliberate simplification, not a limitation the owner asked to avoid.

### Setup: player count, names, and impostor count

New pass-and-play setup flow: **player count** (minimum raised from whatever the original allowed to **4**, since the elimination loop needs at least one round of margin above the 3-player end state) → **name entry** (one text field per player, defaulting to "Jugador N" placeholder, editable, no uniqueness requirement — duplicate names are allowed, players tell each other apart in person anyway) → **impostor count** (stepper, `1` to `floor((playerCount − 1) / 2)`, so the crew always starts as the strict majority) → role-reveal pass exactly as before, just now naming the current player by their entered name instead of "Jugador N".

Live Impostor keeps its existing lobby (players join via their own device/account) and only gains the impostor-count choice (host picks it before starting) plus the elimination loop — no name entry, since the room's player list already shows Keycloak display names.

### Yo Nunca / Verdad o Reto: categories via the existing per-category shuffle-bag pattern

Both games adopt the exact mechanism `impostorBags` already uses in `content.ts`: a `Map<string, ShuffleBag<...>>` keyed by the resolved filter (category for Yo Nunca; category+tipo+nivel for Verdad o Reto), created lazily per pass-and-play session (`sessionId`). No new architecture — literally the same function shape as `getImpostorBag`, applied to two more content types.

**Categories** (both games, shared taxonomy so the frontend can reuse one category picker component): `clasico` (the existing tone — safe, universally fun), `picante` (flirty, secret-revealing, embarrassing/adult-adjacent — the new content the owner explicitly asked for), `fiesta` (drinking-game energy, party dares/questions). A pre-game picker lets the group choose one category (or "todas" to draw from the combined pool) — same UX shape as El Impostor's existing category filter on its word bank.

**Verdad o Reto's extra axis — `nivel`:** each item is tagged `estandar` (safe even if some players in the room are a couple — flirting-about-others is fine, e.g. "¿a quién de aquí llamarías guapo/a?", but nothing that asks two players to physically do something together) or `sin_pareja` (bolder — assumes nobody present is dating another player). The **"Modo SIN PAREJA" toggle** in setup controls the pool: off → only `estandar` items; on → `estandar` + `sin_pareja` combined. This is additive (a superset), not a content swap, matching the owner's description ("se permiten retos más fuertes... en caso de no activarse, deberán ser preguntas/retos teniendo en cuenta que hay que respetarse en pareja").

### Content authoring guidance (for whoever writes the JSON)

Target volume: Yo Nunca ≥80 prompts per category (≥240 total, replacing the current flat 150). Verdad o Reto ≥15 items per (categoria × tipo × nivel) bucket — 3 categories × 2 tipos × 2 niveles = 12 buckets, ≥180 minimum, aim closer to 25/bucket (~300 total) so the shuffle-bag has real breadth in the "picante"/"sin_pareja" buckets specifically, since those are the ones the owner asked to not be an afterthought.

Tone guardrails (apply to every new "picante"/"sin_pareja" item, no exceptions): flirty, embarrassing, secret-revealing, or drinking/party-themed is in bounds; explicit sexual descriptions or instructions, content about real people outside the game, anything illegal, or anything framed as non-consensual is out of bounds — this is a private friend-group party game, not adult content. When in doubt, write the version a mixed group of adult friends would laugh at together, not wince at.

## Risks / Trade-offs

[Risk: multi-round elimination with no per-round reveal could feel confusing if players expect immediate feedback] → Mitigation: this is an explicit, deliberate request from the owner, not a guess — verified verbatim against their message before implementing.

[Risk: "picante" content authored by an LLM might land too tame (defeats the ask) or drift out of bounds] → Mitigation: explicit tone guardrails above, given directly to whoever authors the content; the owner can request specific item revisions after playing if the calibration is off — content is static JSON, trivial to edit and redeploy.

[Risk: raising El Impostor's minimum player count to 4 could annoy a smaller pre-game group] → Mitigation: necessary for the elimination loop to make sense at all (you can't eliminate anyone and still reach "3 remain" starting from 3); worth the trade-off since the group specifically plays with ~8 people.

[Risk: live Impostor's elimination state machine now has more edge cases (disconnects mid-vote, host leaving mid-round) than the old single-round version] → Mitigation: reuses the existing ~60s reconnection grace period unchanged; a disconnected player's vote (if not yet cast) simply doesn't count for that round, same as any player who hasn't voted yet.
