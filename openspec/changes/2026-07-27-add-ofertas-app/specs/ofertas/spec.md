## ADDED Requirements

### Requirement: Role-based access to the human CRUD API
Only the `admin` role SHALL have access to the `ofertas` search-management API and its AppLauncher entry. `familia` and `invitado` SHALL have no access.

#### Scenario: Non-admin denied via API
- **WHEN** a user without the `admin` role calls any `/ofertas/api/searches*` route (except `/health`)
- **THEN** the backend responds with HTTP 403

#### Scenario: Non-admin does not see the app
- **WHEN** a `familia` or `invitado` user opens the AppLauncher
- **THEN** the `ofertas` entry is not listed

### Requirement: Saved-search CRUD
The owner SHALL be able to create, list, edit, and soft-delete saved searches, each with a name, keyword, optional min/max price, location (latitude/longitude/distance), an optional Milanuncios province slug, and per-site enablement (Wallapop/Milanuncios/Vinted).

#### Scenario: Create a search
- **WHEN** the owner submits a new search via `POST /ofertas/api/searches`
- **THEN** it is stored with `activo=true` and appears in `GET /ofertas/api/searches`

#### Scenario: Edit a search
- **WHEN** the owner calls `PATCH /ofertas/api/searches/:id` with updated fields
- **THEN** the stored row reflects the update and `updated_at` changes

### Requirement: Soft delete
Deleting a search SHALL set `activo=false` and `deleted_at=now()`; it SHALL NOT remove the row. Listings SHALL always filter by `activo=true`.

#### Scenario: Deleted search excluded from listing
- **WHEN** a search is deleted via `DELETE /ofertas/api/searches/:id`
- **THEN** it no longer appears in `GET /ofertas/api/searches`, but the row still exists in the database

### Requirement: External scraper contract, separately authenticated
`GET /ofertas/api/searches/active` SHALL be authenticated by a static bearer token (`SCRAPER_API_KEY`), independent of Keycloak, SHALL return only `activo=true` searches, and SHALL respond in a stable DTO shape decoupled from the database's internal column names.

#### Scenario: Correct token returns active searches
- **WHEN** a request includes `Authorization: Bearer <SCRAPER_API_KEY>`
- **THEN** the backend responds HTTP 200 with only `activo=true` searches, mapped to the documented DTO shape (`name`, `keyword`, `max_price`, `min_price`, `latitude`, `longitude`, `distance_km`, `milanuncios_province_slug`, `sites`)

#### Scenario: Missing or wrong token rejected
- **WHEN** a request to `GET /ofertas/api/searches/active` has no `Authorization` header or an incorrect token
- **THEN** the backend responds with HTTP 401 and no search data

#### Scenario: Keycloak JWT alone does not grant access to the scraper endpoint
- **WHEN** a request to `GET /ofertas/api/searches/active` includes a valid admin Keycloak JWT but no bearer token
- **THEN** the backend responds with HTTP 401 — the two auth mechanisms are independent, a valid JWT does not substitute for the bearer token on this route
