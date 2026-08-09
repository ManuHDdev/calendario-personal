## MODIFIED Requirements

### Requirement: Yo Nunca category selection
Yo Nunca SHALL let the player choose a boldness level (`suave`, `media`, `fuerte`, or `mezcla` for the combined pool) before starting, and SHALL draw prompts only from the selected level's shuffle-bag for that session. Yo Nunca SHALL also offer a "Modo SIN PAREJA" toggle: off (default) draws only `estandar`-level prompts; on additionally unlocks `sin_pareja`-level prompts on top of the base pool.

#### Scenario: Level-scoped draws
- **WHEN** a session selects the `fuerte` level
- **THEN** every prompt drawn in that session comes from the `fuerte` pool until it is exhausted and reshuffled

#### Scenario: Mezcla draws from all levels
- **WHEN** a session selects `mezcla`
- **THEN** prompts may be drawn from any of the three levels

#### Scenario: Modo SIN PAREJA is additive
- **WHEN** a session has "Modo SIN PAREJA" on
- **THEN** both `estandar` and `sin_pareja` prompts are eligible to be drawn, not `sin_pareja` alone

### Requirement: Verdad o Reto category selection and Modo SIN PAREJA
Verdad o Reto SHALL let the player choose a boldness level (`suave`, `media`, `fuerte`, or `mezcla`) and a "Modo SIN PAREJA" toggle before starting. With the toggle off, only `nivel='estandar'` prompts SHALL be drawable. With the toggle on, both `estandar` and `sin_pareja` prompts SHALL be drawable.

#### Scenario: Default mode excludes bolder content
- **WHEN** a session has "Modo SIN PAREJA" off and requests a `reto` prompt at the `fuerte` level
- **THEN** only `estandar`-level prompts from that level/tipo are eligible to be drawn

#### Scenario: Modo SIN PAREJA unlocks additional content without removing the base pool
- **WHEN** a session has "Modo SIN PAREJA" on and requests a `verdad` prompt at the `media` level
- **THEN** both `estandar` and `sin_pareja` prompts from that level/tipo are eligible to be drawn
