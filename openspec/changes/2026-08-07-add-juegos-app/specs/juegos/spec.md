## ADDED Requirements

### Requirement: Any authenticated role has access
Any user with a valid Keycloak session (`admin`, `familia`, or `invitado`) SHALL have access to the `juegos` API and its AppLauncher entry. No role SHALL be excluded, and no role check beyond token validity SHALL be applied.

#### Scenario: Invitado can access
- **WHEN** a user with only the `invitado` role calls any `/juegos/api/*` route with a valid JWT
- **THEN** the backend responds normally (not HTTP 403)

#### Scenario: Missing or invalid token rejected
- **WHEN** a request to `/juegos/api/*` (except `/health`) carries no JWT or an expired/invalid one
- **THEN** the backend responds with HTTP 401

#### Scenario: Every role sees the app
- **WHEN** an `admin`, `familia`, or `invitado` user opens the AppLauncher
- **THEN** the `juegos` entry is listed for all three

### Requirement: Pass-and-play content banks
The backend SHALL serve content banks for El Impostor (≥300 words across multiple categories), Yo Nunca (≥150 prompts), and Verdad o Reto (≥150 prompts, split between "verdad" and "reto") without requiring a live session or room.

#### Scenario: Impostor word requested
- **WHEN** a client requests a word for a pass-and-play Impostor round, optionally filtered by category
- **THEN** the response includes a word drawn from the matching category's bank

### Requirement: Shuffle-bag draw without replacement
Content draws (words, questions, prompts) within a single game session (one pass-and-play sitting or one live room) SHALL NOT repeat until every item in the relevant pool has been drawn at least once. Once the pool is exhausted, it SHALL reshuffle and resume drawing from the full pool.

#### Scenario: No repeat before exhaustion
- **WHEN** N draws are made within one session, where N is less than the pool size
- **THEN** no item appears more than once among those N draws

#### Scenario: Reshuffle after exhaustion
- **WHEN** every item in the pool has been drawn once within a session
- **THEN** the next draw reshuffles the full pool and drawing continues without error

### Requirement: Live room creation and join
An authenticated user SHALL be able to create a live game room (`impostor-live` or `trivia-live`) and receive a short room code; other authenticated users SHALL be able to join that room using the code.

#### Scenario: Room created
- **WHEN** an authenticated user calls `POST /juegos/api/rooms` with a valid `gameType`
- **THEN** the response includes a unique room code and the caller is registered as the room's host

#### Scenario: Player joins via WebSocket
- **WHEN** an authenticated user opens a WebSocket connection to `/juegos/api/ws` with a valid JWT and an existing room code
- **THEN** the player is added to the room's player list and all connected players receive the updated list

#### Scenario: Unknown room code rejected
- **WHEN** a WebSocket connection is opened with a room code that does not exist in the active room map
- **THEN** the connection is closed with an error, and no player is added anywhere

### Requirement: Impostor en vivo role assignment
When a live Impostor room's host starts a round, the server SHALL select a word via the shuffle-bag, assign exactly one connected player as the impostor, and deliver each player's role privately (the impostor does not receive the word; all other players do).

#### Scenario: Roles delivered privately
- **WHEN** the host starts an Impostor en vivo round with 5 connected players
- **THEN** exactly one player receives an "impostor" role without the word, and the other four each receive the word with a non-impostor role

### Requirement: Trivia en vivo scoring
Trivia en vivo SHALL present timed questions to all connected players simultaneously, accept one answer per player per question, and broadcast an updated scoreboard after each question closes.

#### Scenario: Correct answer scores
- **WHEN** a player submits the correct answer before the question's timer expires
- **THEN** that player's score increases and the broadcast scoreboard reflects it after the question closes

#### Scenario: Late answer not accepted
- **WHEN** a player submits an answer after the question's timer has expired
- **THEN** the answer is not scored

### Requirement: Reconnection grace period
A player whose WebSocket connection drops SHALL remain part of the room (including any already-assigned role) for a grace period of approximately 60 seconds, after which their slot SHALL be freed if they have not reconnected.

#### Scenario: Reconnect within grace period
- **WHEN** a player reconnects to the same room within 60 seconds of disconnecting
- **THEN** their prior role/state in the room is preserved and no other player is notified of a departure

#### Scenario: Slot freed after grace period
- **WHEN** a player does not reconnect within 60 seconds
- **THEN** their slot is freed and the remaining players are notified

### Requirement: No content management UI
Content banks SHALL be static, versioned files loaded at backend startup. The system SHALL NOT expose any endpoint to create, edit, or delete content bank entries in v1.

#### Scenario: No mutation endpoint exists
- **WHEN** any client attempts a write operation (POST/PUT/PATCH/DELETE) against a content-bank route
- **THEN** no such route exists (HTTP 404), regardless of the caller's role
