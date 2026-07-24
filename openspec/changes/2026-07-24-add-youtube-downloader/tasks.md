## 1. Backend scaffold (`ytdl/backend/`)

- [x] 1.1 Scaffold `ytdl/backend/` as Fastify + TypeScript, copying `storage/backend`'s `package.json`/`tsconfig.json`/project layout as the starting point (drop `sharp`, `better-sqlite3`, `@fastify/multipart`, `@fastify/static` — not needed here)
- [x] 1.2 Copy `storage/backend/src/middleware/auth.ts` verbatim into `ytdl/backend/src/middleware/auth.ts` (same accepted duplication as panel/mapacyd already have)
- [x] 1.3 `authMiddleware` + `hasAnyRole(user, ['admin', 'familia'])` guard applied to the download route; `invitado` gets HTTP 403
- [x] 1.4 `GET /ytdl/api/health` endpoint (matches Panel/Storage/MapaCYD's health route)
- [x] 1.5 Env vars: `KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`, `PORT` (default 3004)

## 2. Download endpoint

- [x] 2.1 `GET /ytdl/api/download?url=<youtube-url>&format=mp4|mp3` route
- [x] 2.2 Validate `url` against a YouTube-host allowlist (`youtube.com`, `www.youtube.com`, `m.youtube.com`, `youtu.be`); reject with 400 otherwise
- [x] 2.3 Validate `format` is exactly `mp4` or `mp3`; reject with 400 otherwise
- [x] 2.4 Fetch the video title via `yt-dlp --print %(title)s` (argv array via `execFile`, never shell string) to build a sanitized `Content-Disposition` filename
- [x] 2.5 Spawn `yt-dlp` (mp4: default remux; mp3: `-x --audio-format mp3`) with `-o -` and pipe its stdout into the Fastify reply as a `Readable`, `Transfer-Encoding: chunked`, correct `Content-Type` (`video/mp4` / `audio/mpeg`)
- [x] 2.6 Kill the child process on `request.raw.on('close', ...)` (client disconnect) and on a hard wall-clock timeout (e.g. 10 min)
- [x] 2.7 On `yt-dlp` non-zero exit before any bytes are sent, respond with a clear error (e.g. 502) instead of a hung/empty download
- [x] 2.8 Unit tests: URL allowlist rejects non-YouTube hosts; format param rejects invalid values; role guard rejects `invitado`

## 3. Docker image (`ytdl-backend`)

- [x] 3.1 `ytdl/backend/Dockerfile`: `node:20-alpine` base, `apk add ffmpeg`, install a pinned `yt-dlp` static binary (fetched at build time), `npm ci && npm run build`
- [x] 3.2 `EXPOSE 3004`, `CMD ["node", "dist/index.js"]`

## 4. Frontend (`ytdl/frontend/`)

- [x] 4.1 Scaffold `ytdl/frontend/` as React + Vite + TypeScript, mirroring `storage/frontend`'s project setup (Keycloak login flow, API client pattern)
- [x] 4.2 Single page: URL input, MP4/MP3 toggle, download button
- [x] 4.3 Client-side validation mirroring the backend's YouTube-host allowlist, with an inline error message for invalid links
- [x] 4.4 Trigger download by navigating to `/ytdl/api/download?...` (with JWT as `?token=` query param, same fallback Storage uses for non-fetch requests) so the browser's native save dialog handles the incoming stream
- [x] 4.5 Loading state (indeterminate spinner) while the request is in flight; error state if the backend responds with 4xx/502
- [x] 4.6 `ytdl/frontend/Dockerfile` mirroring `storage/frontend`'s (static build served via nginx/Vite preview, whichever Storage uses)

## 5. Infra wiring

- [x] 5.1 `ytdl/infra/docker-compose.prod.yml`: `ytdl-backend` + `ytdl-frontend` services on the external `calendario-net` network, mirroring `storage/infra/docker-compose.prod.yml` (image names `ghcr.io/manuhddev/ytdl-backend:latest` / `ytdl-frontend:latest`, healthcheck against `/ytdl/api/health`)
- [x] 5.2 `nginx/calendario.conf`: new location block for `ytdl`, with `proxy_buffering off` on the download route so the streamed response isn't buffered
- [x] 5.3 `infra/docker-compose.override.yml` (or equivalent local-dev wiring) + `start-local.sh`/`start-local.ps1`: add `ytdl-backend` (port 3004) and `ytdl-frontend` (port 5176) to the local dev stack — NOTE: `infra/docker-compose.override.yml` only wires Calendario's own Spring/Angular hot-reload and never wired panel/storage/mapacyd either, so the actual "equivalent local-dev wiring" is `start-local.sh`/`start-local.ps1` (both updated); `docker-compose.override.yml` intentionally left untouched to match the established pattern
- [x] 5.4 CI: add a GitHub Actions workflow for `ytdl` mirroring the existing Panel/Storage/MapaCYD ones (build + push `ghcr.io` images)
- [x] 5.5 Update `CLAUDE.md`'s subapp table (ports table, roles table) with the new `ytdl` entry

## 6. Verification

- [x] 6.1 `npm run build` (backend) and `npm run build` (frontend) both compile without errors
- [x] 6.2 Backend unit tests green (URL allowlist, format validation, role guard)
- [ ] 6.3 Manual end-to-end against the real local stack (Keycloak + backend + frontend): log in as `familia`, paste a real YouTube URL, download as MP4, confirm a playable file lands on disk; repeat for MP3; confirm `invitado` gets a 403 from the UI
- [ ] 6.4 Confirm an aborted browser download (closing the tab mid-stream) does not leave an orphaned `yt-dlp`/`ffmpeg` process running in the container
