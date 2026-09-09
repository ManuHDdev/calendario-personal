## ADDED Requirements

### Requirement: Persistent daily TMDB and Google Books usage counters
The count of TMDB calls made by `GET /search/movies` and `GET /search/tv`, and the count of Google
Books calls made by `GET /search/books`, SHALL each be stored in Postgres keyed by UTC calendar
day, incrementing once per real upstream call and never on a cache hit. Adding this counting SHALL
NOT introduce any new blocking, rate-limiting, or rejection of search requests.

#### Scenario: TMDB call counted
- **WHEN** `GET /search/movies` or `GET /search/tv` results in a real call to TMDB (not a cache
  hit)
- **THEN** today's `tmdb` usage counter increments by 1

#### Scenario: Google Books call counted
- **WHEN** `GET /search/books` results in a real call to Google Books (not a cache hit)
- **THEN** today's `google_books` usage counter increments by 1

#### Scenario: Search behavior unchanged
- **WHEN** any of the three search endpoints is called, regardless of today's usage counters
- **THEN** the response and status code are identical to before this change (no new limit is
  enforced)

### Requirement: Internal usage endpoint
`GET /watchlist/api/usage` SHALL require a valid `PANEL_INTERNAL_TOKEN` bearer token, compared in
constant time, and SHALL return two entries: TMDB (`dailyLimit: null`, `remaining: null`, since no
cap is published) and Google Books (`dailyLimit: 1000`, `remaining` computed from today's count).
A Keycloak JWT, valid or not, SHALL NOT grant access to this route.

#### Scenario: Valid internal token
- **WHEN** a request includes `Authorization: Bearer <valid PANEL_INTERNAL_TOKEN>`
- **THEN** `GET /watchlist/api/usage` returns both the `tmdb` and `google_books` usage entries

#### Scenario: Missing or wrong token rejected
- **WHEN** a request has no `Authorization` header, or a token that does not match
  `PANEL_INTERNAL_TOKEN`
- **THEN** the backend responds with HTTP 401
