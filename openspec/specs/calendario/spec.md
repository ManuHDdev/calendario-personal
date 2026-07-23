# calendario Specification

## Purpose
TBD - created by archiving change document-current-system. Update Purpose after archive.
## Requirements
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

### Requirement: Custom event color selection
Beyond the existing 12 preset swatches, the event form SHALL offer a custom color option that opens a draggable color picker and accepts a hex code typed directly (e.g. `#123abc`). Selecting either a preset or a custom color SHALL set the same underlying `color` form field.

#### Scenario: Picking a custom color via the picker
- **WHEN** the user opens the custom color picker and drags to select a color
- **THEN** the event's color field updates to the selected color's hex value

#### Scenario: Typing a hex code directly
- **WHEN** the user types a valid hex code (e.g. `#123abc`) into the custom color input
- **THEN** the event's color field is set to that exact hex value

### Requirement: Clickable links in event description
In the read-only event detail view, any `http://`, `https://`, or `www.`-prefixed URL found within the event's `descripcion` SHALL render as a clickable link that opens in a new tab. The edit form's description textarea SHALL remain plain text — linkification applies only to the detail view's rendering.

#### Scenario: Viewing an event with a URL in its description
- **WHEN** a user opens the detail view of an event whose description contains `https://example.com`
- **THEN** that URL is rendered as a clickable link opening `https://example.com` in a new tab

#### Scenario: Editing an event does not linkify the textarea
- **WHEN** a user opens the edit form for an event whose description contains a URL
- **THEN** the description textarea shows the URL as plain editable text, not as a rendered link

