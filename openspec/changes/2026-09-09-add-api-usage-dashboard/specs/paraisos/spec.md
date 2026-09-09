## ADDED Requirements

### Requirement: Persistent daily OpenRouteService usage counter
The count of OpenRouteService calls made today by `GET /route-distance` SHALL be stored in
Postgres, keyed by UTC calendar day, and SHALL survive a backend restart or redeploy. The count
SHALL increment once per real upstream call, and SHALL NOT increment on a cache hit.

#### Scenario: Counter survives a restart
- **WHEN** the Paraísos backend process restarts mid-day after N successful ORS calls
- **THEN** the next call to `GET /route-distance` sees a starting count of N, not 0

#### Scenario: Cache hit does not increment
- **WHEN** `GET /route-distance` is served from the in-memory result cache
- **THEN** the day's usage counter is unchanged

#### Scenario: Existing daily cap behavior unchanged
- **WHEN** the daily counter reaches 2000 for the current UTC day
- **THEN** `GET /route-distance` responds with HTTP 503, exactly as it did with the previous
  in-memory counter

### Requirement: Internal usage endpoint
`GET /paraisos/api/usage` SHALL require a valid `PANEL_INTERNAL_TOKEN` bearer token, compared in
constant time, and SHALL return today's OpenRouteService call count, the 2000/day cap, remaining
calls, and the next UTC-midnight reset time. A Keycloak JWT, valid or not, SHALL NOT grant access
to this route.

#### Scenario: Valid internal token
- **WHEN** a request includes `Authorization: Bearer <valid PANEL_INTERNAL_TOKEN>`
- **THEN** `GET /paraisos/api/usage` returns the current ORS usage entry

#### Scenario: Missing or wrong token rejected
- **WHEN** a request has no `Authorization` header, or a token that does not match
  `PANEL_INTERNAL_TOKEN`
- **THEN** the backend responds with HTTP 401
