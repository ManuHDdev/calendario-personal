## ADDED Requirements

### Requirement: External API usage dashboard
`GET /panel/api/usage` SHALL require the Keycloak realm role `admin` (same guard as every other
`/panel/api/*` route) and SHALL return the current-day usage of every externally rate-limited API
tracked in the monorepo (OpenRouteService via Paraísos, TMDB and Google Books via Watchlist),
aggregated from each subapp's own `/api/usage` endpoint.

#### Scenario: Admin views usage
- **WHEN** an admin calls `GET /panel/api/usage`
- **THEN** the response includes one entry per tracked API with `callsToday`, `dailyLimit`
  (`null` when the API has no published cap), `remaining`, and `resetsAt`

#### Scenario: Non-admin blocked
- **WHEN** a user without the `admin` role calls `GET /panel/api/usage`
- **THEN** the backend responds with HTTP 403

### Requirement: Degraded aggregation on subapp failure
If a call to a subapp's `/api/usage` endpoint fails, times out, or returns a malformed body, the
affected API's entries SHALL be marked `unavailable: true` with null counts; the request SHALL
still respond with HTTP 200 and every other API's data populated normally.

#### Scenario: One subapp down
- **WHEN** Watchlist's backend is unreachable and Paraísos' is healthy
- **THEN** `GET /panel/api/usage` responds with HTTP 200, the `tmdb` and `google_books` entries
  marked `unavailable: true`, and the `ors` entry populated normally
