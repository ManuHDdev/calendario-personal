## Why

After playing Trivia en vivo, the owner reports that sessions feel dominated by geography questions and lack real general-knowledge or "learn something interesting" content. Inspecting the content bank confirms it: the `general` category (180 of 506 questions, the single largest category) is almost entirely "¿Cuál es la capital de X?" questions, so a plain shuffle-bag over the whole pool statistically front-loads capitals early in a session. There's also no way for the host to pick a category — Trivia en vivo always draws from the full combined pool, unlike every other content-driven game in `juegos`.

## What Changes

- Trivia en vivo rooms gain **category selection at room creation**: the host picks a category (or "todas") when creating the room, and the room's question shuffle-bag is scoped to that category for the whole game — same shape as the category scoping El Impostor's word bank and (per the sibling change `juegos-elimination-and-spicy-content`) Yo Nunca/Verdad o Reto already use.
- **Rename and shrink the misleading `general` category to `geografia`**, trimmed from 180 near-duplicate "capital de X" questions down to a smaller, more varied geography set (capitals, rivers, mountains, borders, flags — not just capitals).
- **Add two new categories the owner explicitly asked for**:
  - `cultura_general`: real general-knowledge/culture questions (art, literature, notable historical figures and their works — e.g. who painted Guernica, who's credited with the law of the lever).
  - `curiosidades`: fun, "did-you-know" facts people enjoy learning regardless of expertise — e.g. what determines a bee's sex, how long an alligator can hold its breath underwater.
- Existing `ciencia`, `cine`, `deporte`, `historia`, `musica` categories are kept and topped up where thin.

## Capabilities

### Modified Capabilities
- `juegos`: Trivia en vivo's question source (category-scoped instead of one flat combined pool) and its content taxonomy/volume.

## Impact

- `juegos/backend/src/content/trivia-questions.json`: `general` renamed to `geografia` and trimmed/diversified; new `cultura_general` and `curiosidades` categories authored; existing categories topped up.
- `juegos/backend/src/rooms/rooms.route.ts`: `POST /juegos/api/rooms` gains an optional `categoria` field, used only when `gameType === 'trivia-live'`.
- `juegos/backend/src/rooms/roomStore.ts`: trivia room's shuffle-bag is built from the filtered pool (or the full pool if no category/`todas` was requested) instead of always `contentBanks.triviaQuestions` unfiltered.
- `juegos/frontend/src/games/live/RoomLobby.tsx` (or wherever room creation happens): category picker shown when creating a `trivia-live` room.
- No changes to Impostor en vivo, pass-and-play games, the AppLauncher, infra, or access model. This change is scoped entirely to Trivia en vivo's content and room-creation flow — it does not touch the same WS message handlers the sibling `juegos-elimination-and-spicy-content` change is modifying for Impostor.
