## 1. Content: rename/trim geografia, add cultura_general and curiosidades

- [x] 1.1 In `trivia-questions.json`, rename category `general` → `geografia` for all 180 existing items, then trim to ~50-60 varied items (keep a diversified subset: capitals, rivers, mountains, borders, flags — not 180 near-identical "capital de X" entries) — landed at 55 items
- [x] 1.2 Author `cultura_general` category (~60-80 items): art, literature, notable historical figures and their best-known works/ideas (per design.md's examples: who painted Guernica, who's credited with the law of the lever) — landed at 69 items
- [x] 1.3 Author `curiosidades` category (~60-80 items): fun/did-you-know natural and scientific facts (per design.md's examples: what determines a bee's sex, how long an alligator can hold its breath underwater) — distinct register from `ciencia` — landed at 68 items
- [x] 1.4 Top up `ciencia`/`cine`/`deporte`/`historia`/`musica` to at least 60 items each if currently below that — ciencia 90, cine 66, deporte 60 (already met), historia 56→60 (+4), musica 54→60 (+6)
- [x] 1.5 Verify every question has exactly 4 `opciones` with `correcta` matching one of them, and no duplicate `pregunta` text within a category — verified programmatically (0 violations across 528 questions)

## 2. Backend: category-scoped room creation

- [x] 2.1 `rooms.route.ts`: `POST /juegos/api/rooms` accepts an optional `categoria` field; validate against the known trivia category list when `gameType === 'trivia-live'` (reject unknown categories with 400); ignore/no-op for `impostor-live`
- [x] 2.2 `roomStore.ts`: when creating a `trivia-live` room, filter `contentBanks.triviaQuestions` by the requested `categoria` (or use the full pool if omitted/`todas`) before calling `createShuffleBag`
- [x] 2.3 Unit tests: room created with a category only ever draws questions from that category across many draws; room created without a category can draw from any category; unknown category rejected at creation

## 3. Frontend: category picker for Trivia room creation

- [x] 3.1 Room-creation UI for `trivia-live`: category picker (all categories + "todas"), sent as `categoria` in the `POST /juegos/api/rooms` call
- [x] 3.2 No changes needed to in-game question/answer/scoreboard UI (out of scope per design.md) — confirmed, `triviaLive.ts`/`TriviaLive.tsx` untouched

## 4. Verification

- [x] 4.1 `npm run build` (backend) and `npm run build` (frontend) both compile without errors
- [x] 4.2 Backend unit tests green (category-scoped room creation, content validation) — 65/65 passed (10 test files)
- [ ] 4.3 Manual: create a trivia-live room with `curiosidades` selected, confirm several questions in a row are all from that category — NOT RUN (requires manual/browser playtesting, out of scope for this automated apply pass)
- [ ] 4.4 Manual: spot-check the new `cultura_general`/`curiosidades` content reads well and isn't just reworded geography/science-class trivia — NOT RUN (same reason as 4.3)
