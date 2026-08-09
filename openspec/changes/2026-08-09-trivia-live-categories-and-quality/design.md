## Context

Trivia en vivo's room state (`roomStore.ts`) builds one `ShuffleBag` over the entire `contentBanks.triviaQuestions` array at room creation, with no filtering. The content bank itself already has a `categoria` field per question (it was authored with categories in `add-juegos-app`), but nothing in the room-creation or question-drawing path ever uses it — so categories exist in the data but are invisible in play. The `general` category turned out, on inspection, to be 180 near-identical "¿Cuál es la capital de [país]?" questions — that's not "general knowledge," it's a geography sub-genre that happened to get the generic name and the largest share of the pool, which is exactly why the owner's sessions felt geography-heavy.

## Goals / Non-Goals

**Goals:**
- Let the host pick a category per room, same as every other content-driven game in `juegos` already allows.
- Fix the content itself, not just the plumbing: rename the mislabeled category, trim its repetitive "capital de X" glut, and add real general-knowledge and fun-fact content.
- Keep the fix scoped to Trivia en vivo — this is a content/room-creation change, not a scoring or WS-protocol change.

**Non-Goals:**
- No changes to question timing, scoring, or the answer-submission protocol (`handleAnswer`/`closeQuestion` in `triviaLive.ts` stay as-is).
- No mid-game category switching — the category is fixed for the room at creation, same as Impostor's word category is fixed for a pass-and-play session.
- No difficulty levels/tiers in this change (unlike Verdad o Reto's `nivel`) — categories alone address the owner's complaint; difficulty tiering can be a follow-up if it turns out to matter once categories are in place.

## Decisions

### Category chosen at room creation, not mid-game

`POST /juegos/api/rooms` gains an optional `categoria` field (validated against the known category list when `gameType === 'trivia-live'`; ignored for `impostor-live`). `roomStore.ts`'s room-creation function filters `contentBanks.triviaQuestions` by that category (or uses the full pool if `categoria` is omitted or `'todas'`) before building the room's `ShuffleBag`. This mirrors exactly how El Impostor's pass-and-play word bank is scoped per session by category — same shape, applied at room-creation time instead of per-request time, because a live room's bag is created once and shared by every player for the room's whole lifetime.

### `general` → `geografia`, trimmed and diversified

The current 180 "capital de X" questions are collapsed to a smaller (~50-60), more varied set: capitals stay (a trimmed, less line-by-line-country-listy subset), plus rivers, mountain ranges, borders, flags, and similar geography trivia — enough to still be a real category, not the accidental default.

### Two new categories: `cultura_general` and `curiosidades`

- `cultura_general`: the "who created/painted/wrote X" kind of general-knowledge question the owner asked for by example (who painted Guernica → Picasso, who's credited with the law of the lever → Archimedes) — art, literature, notable historical figures and their best-known works/ideas. Distinct from `historia` (which is about historical events/periods) and from `curiosidades` (which is about natural/scientific facts, not human works).
- `curiosidades`: fun, "did-you-know" facts anyone finds interesting regardless of expertise — the owner's own examples (what determines a bee's sex — haplodiploidy: unfertilized eggs become male drones, fertilized become female; how long an alligator can hold its breath underwater — routinely 20-30 minutes, up to a couple hours resting). Distinct from `ciencia` (which stays as more conventional science-class-style questions) — `curiosidades` is deliberately the "impress your friends" register.

### Content volume

Target per category after this change: `geografia` ~50-60 (down from 180, but re-diversified so it doesn't feel like the exact same question with a different country every time), `cultura_general` ~60-80 (new), `curiosidades` ~60-80 (new), and top up `ciencia`/`cine`/`deporte`/`historia`/`musica` to at least 60 each if they're currently below that. Net effect: total pool likely grows somewhat from 506, with a materially better mix — geography drops from ~36% of the pool to a normal-sized single category among eight.

## Risks / Trade-offs

[Risk: trimming 180 geography questions down to ~50-60 discards content] → Mitigation: the discarded items were highly repetitive (same question template, different country) and added volume without adding variety; a smaller, more varied geography category serves the game better than a large repetitive one.

[Risk: `cultura_general` and `curiosidades` overlap conceptually and could get miscategorized during authoring] → Mitigation: the definitions above are deliberately concrete (human-created works/ideas vs. natural/scientific facts) — apply that distinction consistently rather than by feel.
