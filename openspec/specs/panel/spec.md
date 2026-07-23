# panel Specification

## Purpose
TBD - created by archiving change document-current-system. Update Purpose after archive.
## Requirements
### Requirement: Admin-only access
Every `/panel/api/*` endpoint SHALL require the Keycloak realm role `admin`. Users without that role SHALL be rejected.

#### Scenario: Non-admin blocked
- **WHEN** a user with only the `familia` role calls `GET /panel/api/users`
- **THEN** the backend responds with HTTP 403

### Requirement: User management via Keycloak Admin API
The system SHALL manage application users (create, update, delete, list, assign roles) exclusively through the Keycloak Admin REST API. Panel SHALL NOT maintain its own user database.

#### Scenario: Creating a user
- **WHEN** an admin submits a new user with username and password
- **THEN** the backend creates the user in Keycloak and assigns the requested realm roles

#### Scenario: Duplicate username rejected
- **WHEN** an admin tries to create a user with a username that already exists in Keycloak
- **THEN** the backend responds with HTTP 409

### Requirement: Fixed role catalog
The system SHALL expose exactly three assignable realm roles: `admin`, `familia`, `invitado`.

#### Scenario: Listing available roles
- **WHEN** an admin calls `GET /panel/api/roles`
- **THEN** the response is exactly `['admin', 'familia', 'invitado']`

