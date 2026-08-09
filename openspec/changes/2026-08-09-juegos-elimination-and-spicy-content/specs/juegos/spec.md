## MODIFIED Requirements

### Requirement: Impostor en vivo role assignment
When a live Impostor room's host starts a round, the server SHALL select a word via the shuffle-bag, assign a host-chosen number of impostors (1 to `floor((playerCount − 1) / 2)`) among the connected players, and deliver each player's role privately (impostors do not receive the word; all other players do). Impostors SHALL NOT be told the identity of any other impostor.

#### Scenario: Multiple impostors assigned privately
- **WHEN** the host starts an Impostor en vivo round with 8 connected players and requests 2 impostors
- **THEN** exactly 2 players receive an "impostor" role without the word, the other 6 each receive the word with a non-impostor role, and no impostor's payload reveals who the other impostor is

#### Scenario: Impostor count rejected above the limit
- **WHEN** the host requests an impostor count greater than `floor((playerCount − 1) / 2)`
- **THEN** the server rejects the request and no round starts

## ADDED Requirements

### Requirement: El Impostor elimination loop (pass-and-play and live)
El Impostor SHALL run as a multi-round elimination game: after each round's vote, the most-voted player SHALL be eliminated (on a tie, no one is eliminated and the game continues). The game SHALL end with a full reveal (word, all impostors' identities, and outcome) only when either all impostors have been eliminated (crew wins) or exactly 3 players remain (impostors win if at least one is still among them). No individual elimination SHALL reveal whether the eliminated player was an impostor.

#### Scenario: Game continues after a non-decisive elimination
- **WHEN** a round's vote eliminates a crew player and at least one impostor remains among more than 3 players
- **THEN** the game returns to a new discussion round instead of ending, and the eliminated player's role is not disclosed

#### Scenario: Crew wins immediately when the last impostor is eliminated
- **WHEN** a round's vote eliminates the last remaining impostor
- **THEN** the game ends immediately with a full reveal declaring the crew as winners, regardless of how many players remain

#### Scenario: Impostors win at the 3-player threshold
- **WHEN** eliminations bring the game down to exactly 3 remaining players and at least one impostor is among them
- **THEN** the game ends with a full reveal declaring the impostors as winners

#### Scenario: Tied vote eliminates no one
- **WHEN** a round's vote results in a tie for most-voted player
- **THEN** no player is eliminated and the game proceeds to another discussion round

### Requirement: El Impostor player setup (pass-and-play)
Pass-and-play El Impostor SHALL require a minimum of 4 players, SHALL let the group enter a display name for each player before roles are assigned, and SHALL let the group choose how many impostors play (1 to `floor((playerCount − 1) / 2)`).

#### Scenario: Names used throughout the game
- **WHEN** the group enters player names during setup
- **THEN** every subsequent screen (role reveal, voting, elimination announcement, final reveal) refers to players by their entered names, not generic slot numbers

#### Scenario: Player count below minimum rejected
- **WHEN** the group attempts to start a pass-and-play game with fewer than 4 players
- **THEN** the setup screen does not allow starting the game

### Requirement: Yo Nunca category selection
Yo Nunca SHALL let the player choose a content category (`clasico`, `picante`, `fiesta`, or "todas" for the combined pool) before starting, and SHALL draw prompts only from the selected category's shuffle-bag for that session.

#### Scenario: Category-scoped draws
- **WHEN** a session selects the `picante` category
- **THEN** every prompt drawn in that session comes from the `picante` pool until the pool is exhausted and reshuffled

### Requirement: Verdad o Reto category selection and Modo SIN PAREJA
Verdad o Reto SHALL let the player choose a content category (same taxonomy as Yo Nunca) and a "Modo SIN PAREJA" toggle before starting. With the toggle off, only `nivel='estandar'` prompts SHALL be drawable. With the toggle on, both `estandar` and `sin_pareja` prompts SHALL be drawable.

#### Scenario: Default mode excludes bolder content
- **WHEN** a session has "Modo SIN PAREJA" off and requests a `reto` prompt in the `picante` category
- **THEN** only `estandar`-level prompts from that category/tipo are eligible to be drawn

#### Scenario: Modo SIN PAREJA unlocks additional content without removing the base pool
- **WHEN** a session has "Modo SIN PAREJA" on and requests a `verdad` prompt in the `fiesta` category
- **THEN** both `estandar` and `sin_pareja` prompts from that category/tipo are eligible to be drawn
