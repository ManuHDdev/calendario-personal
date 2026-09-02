## ADDED Requirements

### Requirement: Admin-only access
Only `admin` SHALL have access to `/locales/api/*` and to the app in the AppLauncher. No new Keycloak realm role is introduced.

#### Scenario: Non-admin denied
- **WHEN** a user with `familia`, `invitado` or any delegated role calls any `/locales/api/*` route except `/health` with a valid Keycloak JWT
- **THEN** the backend responds with HTTP 403

#### Scenario: App hidden from unauthorized roles
- **WHEN** a non-`admin` user opens the AppLauncher in any subapp
- **THEN** the `locales` entry is not listed

### Requirement: Two kinds of saved search
A saved search SHALL declare `tipo` of either `local` (commercial premises for sale) or `farmacia` (pharmacy business for sale), and SHALL be crawled only against the portals that serve that type.

#### Scenario: Premises search crawls property portals
- **WHEN** a search of `tipo = 'local'` is crawled
- **THEN** only premises portals are queried, and each stored listing carries `tipo = 'local'`

#### Scenario: Pharmacy search does not require coordinates
- **WHEN** a listing of `tipo = 'farmacia'` is stored without latitude or longitude
- **THEN** it is persisted normally with `veredicto = 'sin_datos'` and a motive stating the source publishes no location, and this is not recorded as a crawl error

### Requirement: Pedestrian distance, never straight-line
Distance between a listing and a pharmacy or health centre SHALL be computed along the walking network, never as a straight line.

#### Scenario: Candidates pre-filtered by haversine
- **WHEN** viability is computed for a point with threshold `D`
- **THEN** only pharmacies within a haversine radius of `D * 3` are sent to the routing engine, and every pharmacy beyond that radius is treated as satisfying the threshold

#### Scenario: Engine is selectable
- **WHEN** `LOCALES_MOTOR_DISTANCIA` is set to `valhalla` and a viability calculation runs
- **THEN** the Valhalla `sources_to_targets` endpoint with `costing=pedestrian` is used, and the resulting row records `viabilidad_motor = 'valhalla'`

#### Scenario: Stale verdicts are identifiable after an engine change
- **WHEN** the configured engine differs from a listing's stored `viabilidad_motor`
- **THEN** that listing is eligible for recalculation and the UI marks its verdict as computed with a different engine

### Requirement: Verdict expresses positional uncertainty
The verdict SHALL account for the coordinate precision of both the listing and the nearest pharmacy, and SHALL NOT report compliance that the input data cannot support.

#### Scenario: Green only when compliant in the worst case
- **WHEN** measured walking distance `m`, legal threshold `D` and uncertainty margin `E` satisfy `m - E > D`
- **THEN** the verdict is `verde`

#### Scenario: Red only when non-compliant in the best case
- **WHEN** `m + E < D`
- **THEN** the verdict is `rojo`

#### Scenario: Ambiguous data yields amber
- **WHEN** neither `m - E > D` nor `m + E < D` holds
- **THEN** the verdict is `ambar` and the stored motive names the coordinate precision that produced the margin

#### Scenario: Amber listings are still notified
- **WHEN** a new listing receives verdict `ambar`
- **THEN** it is sent to Telegram like a `verde` listing, labelled as needing manual confirmation

### Requirement: Incomplete pharmacy register degrades verdicts
A green verdict SHALL NOT be issued in a municipality whose pharmacy register is below the configured coverage threshold.

#### Scenario: Thin coverage downgrades green to amber
- **WHEN** a listing would receive `verde` but its municipality's known pharmacy count is below the population-derived sanity bound
- **THEN** the verdict is stored as `ambar` with a motive naming the municipality, the known count and the expected count

#### Scenario: Empty register blocks viability entirely
- **WHEN** the crawler runs for a search whose comunidad has no pharmacies in the register
- **THEN** listings are stored with `veredicto = 'sin_datos'` and no viability calculation is attempted

### Requirement: Pharmacy and health-centre register
The register SHALL be populated from OpenStreetMap nationwide and, where available, from an official regional dataset, deduplicating records closer than 40 metres, and SHALL be refreshed on a schedule.

#### Scenario: Official source wins on conflict
- **WHEN** an OSM record and an official regional record describe pharmacies less than 40 metres apart
- **THEN** a single register entry is kept, using the official record's coordinates and attribution

#### Scenario: Disappearance is a soft delete
- **WHEN** a previously imported pharmacy is absent from its source on a later refresh
- **THEN** the row is soft-deleted (`activo = false`, `deleted_at = now()`) rather than removed, and remains auditable

### Requirement: Legal thresholds are data, not code
Minimum distances SHALL be stored per comunidad autónoma and SHALL be overridable per saved search.

#### Scenario: Search inherits its comunidad's thresholds
- **WHEN** a search is created without explicit distances
- **THEN** viability uses the `normativa` row of the search's comunidad

#### Scenario: Search overrides a threshold
- **WHEN** a search sets `distancia_farmacias_m` explicitly
- **THEN** that value is used for that search regardless of its comunidad's row

#### Scenario: Unregulated health-centre distance is not zero
- **WHEN** a comunidad's `distancia_centros_sanitarios_m` is `NULL`
- **THEN** no health-centre check is performed for searches in that comunidad, and no listing is downgraded for that reason

#### Scenario: Either check can be switched off
- **WHEN** a search sets `comprobar_centros_sanitarios = false`
- **THEN** the verdict is computed from the pharmacy distance alone

### Requirement: Routing budget never silently discards listings
Exhausting the routing engine's request budget SHALL degrade the result, not the listing set.

#### Scenario: Budget exhausted mid-crawl
- **WHEN** the daily routing budget is exhausted while new listings remain
- **THEN** those listings are still stored, with `veredicto = 'sin_datos'` and a motive naming the exhausted budget, and are recalculated on a later run

### Requirement: Partial crawls are visibly partial
A portal failure SHALL degrade a crawl, not abort it, and SHALL be visible in the UI.

#### Scenario: One portal fails
- **WHEN** one portal errors and another responds during the same crawl
- **THEN** the responding portal's listings are stored and the failure reason is written to `busqueda.ultimo_rastreo_error` and shown in the UI

### Requirement: Manual crawl does not notify
The manual "crawl now" action SHALL persist listings without sending Telegram messages.

#### Scenario: First crawl of a new search
- **WHEN** `POST /locales/api/searches/:id/rastrear` is called
- **THEN** listings are stored and marked unseen, and no Telegram message is sent

### Requirement: Two-way Telegram bot
The bot SHALL emit alerts and SHALL answer ad-hoc viability queries, accepting only messages from `TELEGRAM_OWNER_CHAT_ID`.

#### Scenario: Shared location is checked
- **WHEN** the owner sends a Telegram location to the bot
- **THEN** the bot replies with the nearest pharmacies and health centres, their walking distances, the applied thresholds and the resulting verdict

#### Scenario: Address query uses exact precision
- **WHEN** the owner sends `/comprobar` with an address containing a street number that geocodes successfully
- **THEN** the calculation uses `precision_coordenadas = 'exacta'` and the uncertainty margin contributed by the query point is zero

#### Scenario: Listing URL is analysed
- **WHEN** the owner forwards a supported portal listing URL
- **THEN** the bot parses it, computes viability for its coordinates and replies with the verdict

#### Scenario: Messages from other chats ignored
- **WHEN** a message arrives from a chat id other than `TELEGRAM_OWNER_CHAT_ID`
- **THEN** the bot does not reply and does not act on it

#### Scenario: Bot absent does not stop crawling
- **WHEN** `TELEGRAM_BOT_TOKEN` or `TELEGRAM_OWNER_CHAT_ID` is unset
- **THEN** the crawler runs and stores listings normally, logging once at startup that alerts are disabled

#### Scenario: Failed send is retried
- **WHEN** sending a Telegram alert for a listing fails
- **THEN** the listing is not marked as notified and is retried on the next run

### Requirement: Verdicts carry a non-certification notice
Every surface that shows a verdict SHALL state that it is an aid, not the official measurement.

#### Scenario: UI and bot both disclaim
- **WHEN** a verdict is rendered in the frontend or sent by the bot
- **THEN** the accompanying text states that the official measuring method is set by the comunidad's regulation and that this result does not certify compliance

### Requirement: Soft delete and active-only listings
All tables SHALL carry `activo` and `deleted_at`; every listing query SHALL filter `activo = true`; HTTP DELETE SHALL never delete physically.

#### Scenario: Delete is logical
- **WHEN** `DELETE /locales/api/searches/:id` or `/listings/:id` is called
- **THEN** the row is updated to `activo = false, deleted_at = now()` and disappears from listings
