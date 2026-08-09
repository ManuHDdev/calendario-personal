## ADDED Requirements

### Requirement: Bomb Party elimination loop
Bomb Party SHALL run a hidden, randomly-timed countdown (configurable range, default 15-45s) that continues across passed turns within a round; the player holding the turn when it elapses SHALL lose a life (configurable, default 3) and, at zero lives, SHALL be eliminated. The game SHALL end when exactly one player has lives remaining.

#### Scenario: Timer not shown to players
- **WHEN** a Bomb Party round is in progress
- **THEN** no UI element reveals how much time remains before the explosion

#### Scenario: Elimination and continuation
- **WHEN** a player's lives reach zero
- **THEN** that player is removed from the turn order and the game continues with a new syllable/category and a new hidden timer among the remaining players

### Requirement: ¿Quién es más probable que...? tally and running scoreboard
The game SHALL let the group register player names before starting, present a prompt per round, allow the host to record a show-of-hands tally against the registered players, and maintain a running "veces señalado" count per player across rounds. The game SHALL have no win condition; it SHALL support an end-of-session summary showing the most-selected player.

#### Scenario: Tally increments the running total
- **WHEN** the host records the round's most-tapped player
- **THEN** that player's cumulative "veces señalado" count increases by one and is reflected in the end-of-session summary if requested

### Requirement: 10/10 combined prompts
10/10 SHALL combine one item from an independent "cualidad" bank and one from an independent "pero" bank into each round's prompt, both drawn from the same selected intensity (`suave`|`picante`). The game SHALL have no win condition.

#### Scenario: Intensity applies to both banks
- **WHEN** a session selects `picante` intensity
- **THEN** both the drawn "cualidad" and the drawn "pero" come from their respective `picante`-tagged pools

### Requirement: Tabú team turns
Tabú SHALL run timed team turns (configurable duration, default 60s) where the active team's device shows one card (word + 4-5 forbidden words) at a time, hidden until revealed by the player holding the device. A correct guess SHALL advance to the next card and increment the team's turn score; any player SHALL be able to flag a forbidden word as said, which discards the current card without scoring. Turn scores SHALL accumulate to a team total; the game SHALL end after a configured number of rounds or when a target score is reached, whichever is configured.

#### Scenario: Forbidden word discards without scoring
- **WHEN** a forbidden word is flagged during an active card
- **THEN** the current card is discarded, no point is awarded, and the next card is shown

### Requirement: Mímica team turns
Mímica SHALL run timed team turns (configurable duration, default 60-90s) showing one word/phrase at a time from the active category selection. A correct guess SHALL advance to the next item and increment the team's turn score; "Pasar" SHALL discard the current item and advance, optionally costing a point (configurable). Turn scores accumulate to a team total across rounds; the game ends per a configured rounds/target-score rule, same as Tabú.

#### Scenario: Pass without penalty by default
- **WHEN** a team passes on an item and the pass-penalty config is off
- **THEN** the team's score is unchanged and the next item is shown

### Requirement: Respuestas falsas scoring
In a `respuestas-falsas-live` room, each round SHALL present a question whose real answer is withheld from all players until reveal; each connected player SHALL submit one fake answer; a player SHALL NOT be able to vote for their own submission. After voting closes, the room SHALL reveal the real answer and award one point to each player who voted correctly and one point to the author of each fake answer per player fooled by it.

#### Scenario: Self-vote blocked
- **WHEN** a player attempts to vote for the option containing their own submitted fake answer
- **THEN** the vote is rejected

#### Scenario: Scoring rewards both correct guesses and successful deception
- **WHEN** voting closes on a round
- **THEN** every player who voted for the real answer gains a point, and every player whose fake answer received votes gains one point per vote it received

### Requirement: Stop round resolution and scoring
In a `stop-live` room, a round SHALL start with a randomly chosen letter and a fixed category list; any connected player calling "¡Stop!" SHALL end the round for all players immediately, using each player's submissions at that moment (unsubmitted categories count as empty). The server SHALL score each category automatically: a unique non-empty answer scores 10, a non-empty answer duplicated by at least one other player scores 5 for each player who wrote it, and an empty answer scores 0. The server SHALL NOT validate whether an answer is a real word.

#### Scenario: Stop cuts off the round for everyone
- **WHEN** any player sends the "¡Stop!" signal
- **THEN** every other player's further submissions for that round are ignored and scoring proceeds on what had been submitted

#### Scenario: Duplicate answers score lower than unique ones
- **WHEN** two players submit the same non-empty answer (case/accent-insensitive) in the same category
- **THEN** each of them scores 5 for that category instead of 10

### Requirement: Coup action/challenge/block resolution
In a `coup-live` room, an action declared by the active player SHALL be resolvable by any other connected player either challenging it (disputing the claimed character) or, if applicable, blocking it (claiming a countering character); a challenge SHALL be resolved by revealing whether the challenged player actually holds the claimed character, with influence loss going to whichever side was proven wrong. A player reduced to zero influence SHALL be eliminated. The game SHALL end when exactly one player retains influence.

#### Scenario: False claim loses on challenge
- **WHEN** a player claims a character they do not hold and is challenged
- **THEN** that player loses one influence card immediately and the declared action/block has no effect

#### Scenario: True claim survives challenge
- **WHEN** a player claims a character they do hold and is challenged
- **THEN** the challenger loses one influence card, and the claimed card is reshuffled into the court deck and replaced with a newly drawn card for the challenged player

### Requirement: Hombre Lobo automated narration and win conditions
In a `hombre-lobo-live` room, the server SHALL act as narrator: advancing night/day phases, sending each role's action prompt privately only to the player(s) holding that role, resolving night outcomes, running day debate/voting, and applying the Cazador's revenge-kill interrupt when eliminated. The server SHALL check win conditions after every elimination: aldeanos win when no lobos remain alive; lobos win when the number of living lobos is greater than or equal to the number of living non-lobos.

#### Scenario: Private role prompts stay private
- **WHEN** the server sends a night-action prompt to a player holding a special role
- **THEN** no other connected player's socket receives that prompt or any data revealing which role is currently acting

#### Scenario: Cazador's revenge fires on elimination
- **WHEN** the player holding the Cazador role is eliminated, whether by night attack or day vote
- **THEN** before the game proceeds, that player is prompted to select another living player, who is also eliminated

#### Scenario: Win condition checked after every death
- **WHEN** an elimination (night or day) brings the number of living lobos to zero
- **THEN** the game ends immediately declaring the aldeanos as winners, without waiting for the current phase to finish
