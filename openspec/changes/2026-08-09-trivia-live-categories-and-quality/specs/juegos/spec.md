## MODIFIED Requirements

### Requirement: Live room creation and join
An authenticated user SHALL be able to create a live game room (`impostor-live` or `trivia-live`) and receive a short room code; other authenticated users SHALL be able to join that room using the code. For `trivia-live` rooms, the creator SHALL be able to specify a question category; the room's question pool SHALL be scoped to that category (or the full combined pool if omitted/`todas`) for the room's entire lifetime.

#### Scenario: Room created with a category
- **WHEN** an authenticated user calls `POST /juegos/api/rooms` with `gameType: 'trivia-live'` and `categoria: 'curiosidades'`
- **THEN** the created room only draws questions from the `curiosidades` category for as long as the room exists

#### Scenario: Room created without a category draws from the full pool
- **WHEN** an authenticated user calls `POST /juegos/api/rooms` with `gameType: 'trivia-live'` and no `categoria` (or `categoria: 'todas'`)
- **THEN** the created room draws questions from the full combined question pool

#### Scenario: Unknown category rejected
- **WHEN** `POST /juegos/api/rooms` is called with `gameType: 'trivia-live'` and a `categoria` that doesn't match any known category
- **THEN** the request is rejected and no room is created

### Requirement: Trivia en vivo scoring
Trivia en vivo SHALL present timed questions to all connected players simultaneously, accept one answer per player per question, and broadcast an updated scoreboard after each question closes. Questions SHALL be drawn from the room's category-scoped shuffle-bag (see "Live room creation and join").

#### Scenario: Correct answer scores
- **WHEN** a player submits the correct answer before the question's timer expires
- **THEN** that player's score increases and the broadcast scoreboard reflects it after the question closes

#### Scenario: Late answer not accepted
- **WHEN** a player submits an answer after the question's timer has expired
- **THEN** the answer is not scored
