# mapacyd Specification

## Purpose
TBD - created by archiving change document-current-system. Update Purpose after archive.
## Requirements
### Requirement: Soft delete for zones and schedules
Tables `zona_cyd` and `horario_zona` SHALL support soft delete via an `activo` boolean (default `true`) and a nullable `deleted_at` timestamp. DELETE requests SHALL never physically remove rows.

#### Scenario: Deleting a zone
- **WHEN** an admin sends a DELETE request for a zone
- **THEN** the row's `activo` becomes `false` and `deleted_at` is set, and the row is not removed from PostgreSQL

### Requirement: Role-based access to zones
The system SHALL enforce three access levels via Keycloak realm roles: `admin` (full CRUD), `familia` (read-only), `invitado` (no access).

#### Scenario: Invitado is denied access
- **WHEN** a user with only the `invitado` role calls `GET /api/zonas`
- **THEN** the backend responds with HTTP 403

#### Scenario: Familia can read but not write
- **WHEN** a user with only the `familia` role sends `POST /api/zonas`
- **THEN** the backend responds with HTTP 403

### Requirement: Manual request validation with Zod
Every endpoint that receives a request body SHALL validate the payload with a Zod schema before processing it.

#### Scenario: Invalid payload rejected
- **WHEN** a client sends a zone-creation request missing a required field
- **THEN** the backend responds with a 4xx validation error before touching the database

### Requirement: Direct SQL access, no ORM
The backend SHALL query PostgreSQL directly via the `pg` client, without an ORM layer.

#### Scenario: Query executed without ORM abstraction
- **WHEN** a route handler needs zone data
- **THEN** it issues a parameterized SQL query directly through the `pg` client

