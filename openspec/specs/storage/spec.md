# storage Specification

## Purpose
TBD - created by archiving change document-current-system. Update Purpose after archive.
## Requirements
### Requirement: Role-based file access
The `admin` and `familia` roles SHALL have full access to upload, move, rename, and delete files/folders. The `invitado` role SHALL have no access to any storage endpoint.

#### Scenario: Invitado denied
- **WHEN** a user with only the `invitado` role calls `GET /storage/api/files`
- **THEN** the backend responds with HTTP 403

### Requirement: Query-param token fallback for embedded media
Endpoints serving previews, thumbnails, or downloads SHALL accept the JWT either as a standard `Authorization: Bearer` header or as a `?token=` query parameter, to support `<img>`, `<video>`, and `<iframe>` elements that cannot set custom headers.

#### Scenario: Thumbnail request via query token
- **WHEN** a browser requests `/storage/api/files/{path}/thumbnail?token=<jwt>` from an `<img src>` attribute
- **THEN** the backend accepts the token from the query string and returns the thumbnail if it is valid

### Requirement: Video range streaming
Video previews SHALL support HTTP Range requests, returning 206 Partial Content with the appropriate Content-Range header.

#### Scenario: Seeking within a video
- **WHEN** a client requests a video preview with a `Range: bytes=1000-2000` header
- **THEN** the backend responds with HTTP 206 and only the requested byte range

### Requirement: Filesystem-backed storage, no database
All file and folder metadata SHALL be derived directly from the filesystem at `STORAGE_PATH`. The system SHALL NOT maintain a separate database of file records.

#### Scenario: Listing reflects filesystem state directly
- **WHEN** a file is added directly to the storage directory outside the app
- **THEN** the next `GET /storage/api/files` call includes that file

