## ADDED Requirements

### Requirement: Role-based access
The `admin` and `familia` roles SHALL have access to the download endpoint. The `invitado` role SHALL have no access.

#### Scenario: Invitado denied
- **WHEN** a user with only the `invitado` role calls `GET /ytdl/api/download`
- **THEN** the backend responds with HTTP 403

### Requirement: YouTube URL validation
The download endpoint SHALL reject any `url` whose host is not `youtube.com`, `www.youtube.com`, `m.youtube.com`, or `youtu.be`.

#### Scenario: Non-YouTube URL rejected
- **WHEN** a request provides `url=https://example.com/video`
- **THEN** the backend responds with HTTP 400 and does not invoke `yt-dlp`

### Requirement: Streamed response, no server-side persistence
The backend SHALL stream the downloaded/transcoded media directly as the HTTP response body. It SHALL NOT write the file to persistent disk or a database at any point.

#### Scenario: MP4 download
- **WHEN** a request provides a valid YouTube `url` and `format=mp4`
- **THEN** the backend responds with `Content-Type: video/mp4`, a `Content-Disposition: attachment` header with a sanitized filename, and streams the video bytes as they become available

#### Scenario: MP3 download
- **WHEN** a request provides a valid YouTube `url` and `format=mp3`
- **THEN** the backend responds with `Content-Type: audio/mpeg`, a `Content-Disposition: attachment` header with a sanitized filename, and streams the extracted audio bytes as they become available

### Requirement: Format validation
The download endpoint SHALL only accept `format=mp4` or `format=mp3`.

#### Scenario: Invalid format rejected
- **WHEN** a request provides `format=avi`
- **THEN** the backend responds with HTTP 400

### Requirement: Child process cleanup on disconnect
If the client disconnects before the stream completes, the backend SHALL terminate the underlying `yt-dlp`/`ffmpeg` child process rather than letting it run to completion.

#### Scenario: Client aborts mid-download
- **WHEN** the client closes the connection while bytes are still streaming
- **THEN** the backend kills the associated child process
