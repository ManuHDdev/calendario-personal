## Why

The user wants to paste a YouTube link and get an MP3 or MP4 file on their device (phone or computer), without leaving the family's own apps. There is no existing subapp for this, and it does not fit inside Calendario, Panel, Storage, or MapaCYD's current scope.

## What Changes

- Add a new subapp `ytdl`: paste a YouTube URL, pick MP4 (video) or MP3 (audio), click download.
- Backend (Fastify + TypeScript) resolves the URL with `yt-dlp`, transcodes/extracts via `ffmpeg` when needed, and streams the resulting file directly as the HTTP response — nothing is written to persistent disk, no database, no dependency on Storage's `STORAGE_PATH`.
- Frontend (React + Vite + TypeScript): a single page with a URL input, a format toggle (MP4/MP3), and a download button with progress/error feedback.
- Auth: Keycloak JWT like the other subapps, roles `admin` and `familia` (same access level as Storage); `invitado` has no access.
- Docker: new `ytdl-backend`/`ytdl-frontend` images, joins the existing external `calendario-net` network; nginx route added to `calendario.conf`.

## Capabilities

### New Capabilities
- `ytdl`: download a YouTube video as MP3 or MP4, streamed directly to the browser, gated by Keycloak role.

### Modified Capabilities
(none — this is additive; no existing subapp's behavior changes)

## Impact

- New directory `ytdl/` (backend + frontend) at the monorepo root, alongside `panel/`, `storage/`, `mapacyd/`.
- `infra/docker-compose.yml` (+ `.prod.yml`): two new services on `calendario-net`.
- `nginx/calendario.conf`: new location block/subdomain-path for `ytdl`.
- `infra/keycloak/realm-export.json` and `realm-export.prod.json`: no new roles needed (reuses `admin`/`familia`), but the new client/audience for `ytdl`'s JWT verification must be added the same way Storage/Panel/MapaCYD are.
- Runtime dependency: `yt-dlp` and `ffmpeg` binaries must be present in the `ytdl-backend` Docker image (installed in its Dockerfile, not via npm).
- No changes to Calendario, Panel, Storage, or MapaCYD code.
