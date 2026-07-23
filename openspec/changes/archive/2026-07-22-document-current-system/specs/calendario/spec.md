## ADDED Requirements

### Requirement: Soft delete for calendar entities
All calendar entities (Evento, ImagenEvento) SHALL be soft-deleted. A DELETE request SHALL never physically remove a row; it SHALL set `activo=false` and `deletedAt=now()` instead.

#### Scenario: Deleting an event
- **WHEN** a client sends `DELETE /api/eventos/{id}`
- **THEN** the event's `activo` field is set to `false` and `deletedAt` is set to the current timestamp, and the row remains in the database

### Requirement: Active-only listings
All listing endpoints SHALL filter results to entities where `activo = true`.

#### Scenario: Listing events excludes soft-deleted ones
- **WHEN** a client requests the yearly calendar view
- **THEN** only events with `activo = true` are returned

### Requirement: JWT-protected access via Keycloak
Every REST endpoint SHALL require a valid Keycloak-issued JWT. Requests without a valid token SHALL be rejected.

#### Scenario: Unauthenticated request rejected
- **WHEN** a client calls any `/api/**` endpoint without a valid Authorization header
- **THEN** the backend responds with HTTP 401

### Requirement: Single-owner data model
The system SHALL treat the `propietario` user as the sole data owner. There is no multi-tenant separation of calendar data itself — only realm-level access roles (`admin`, `familia`, `invitado`) gate who can reach the app at all.

#### Scenario: Owner has full access
- **WHEN** the user `propietario` authenticates with the `admin` realm role
- **THEN** they have full read/write access to all calendar data

### Requirement: Separate request/response DTOs
Every entity SHALL expose a distinct `RequestDTO` for input and `ResponseDTO` for output, mapped with MapStruct. The `ResponseDTO` SHALL never include `deletedAt`.

#### Scenario: Response omits internal soft-delete field
- **WHEN** a client fetches an event via the API
- **THEN** the returned JSON does not contain a `deletedAt` field
