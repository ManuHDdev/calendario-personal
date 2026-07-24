## Context

The monorepo already has three sibling subapps built on the same stack — `panel/`, `storage/`, `mapacyd/` — each with:
- A Fastify + TypeScript backend, its own `infra/docker-compose.prod.yml` joining the external `calendario-net` Docker network, its own port, and a hand-rolled JWT verification (`middleware/auth.ts`, RS256 via Keycloak JWKS, no `@fastify/jwt` plugin) copied near-identically across the three (documented technical debt — see `storage/backend/src/middleware/auth.ts`).
- A React + Vite + TypeScript frontend, served by its own Docker image.
- Roles `admin`, `familia`, `invitado` from the single Keycloak realm `calendario` — `storage` grants `admin`+`familia` full access, `invitado` none.
- Local dev ports allocated sequentially (Calendario 4200/8081, Panel 5174/3002, Storage 5173/3001, MapaCYD 5175/3003).

`ytdl` follows this exact pattern as a fourth subapp, with one structural difference: it has no filesystem or database at all. Every request is stateless — take a URL, produce a stream, respond.

## Goals / Non-Goals

**Goals:**
- Paste a YouTube URL, choose MP4 or MP3, get the file streamed straight into the browser's normal download flow.
- Reuse the existing auth pattern (copy `storage/backend/src/middleware/auth.ts` verbatim, same as `panel` and `mapacyd` already do) so a fourth copy is consistent with the known, accepted debt rather than inventing a fifth pattern.
- Gate access the same way Storage does: `admin` + `familia` yes, `invitado` no.

**Non-Goals:**
- No history of past downloads, no database, no persistence of any kind.
- No batch/playlist downloads — single video URL per request only.
- No progress bar driven by real transcoding percentage (yt-dlp progress parsing is fragile); a simple indeterminate spinner while the response streams is enough.
- Not a general-purpose media downloader (other sites) — YouTube URLs only, validated before shelling out.
- No resumable/paused downloads.

## Decisions

**Download engine: `yt-dlp` (CLI binary) + `ffmpeg`, invoked as a child process — not an npm library.**
`yt-dlp` is the actively maintained fork of youtube-dl, handles YouTube's frequently-changing extraction logic, and both MP4 remuxing and MP3 extraction (`-x --audio-format mp3`, which shells out to `ffmpeg` internally) are first-class flags. Both binaries are installed in the `ytdl-backend` Dockerfile (`apk add ffmpeg` + a pinned `yt-dlp` static binary download), not via npm — there is no maintained Node wrapper worth trusting over calling the real CLI directly.

**Streaming, not temp-file-then-send.**
`yt-dlp -o -` (output to stdout) is piped directly into the Fastify reply as the response body (`reply.send(childProcess.stdout)` — Fastify accepts a `Readable`, same idea `storage` already uses for its file streaming). This avoids writing anything to the container's ephemeral filesystem and avoids needing to know the final file size upfront (`Content-Length` is omitted; `Transfer-Encoding: chunked` is used instead, same as Storage does for on-the-fly thumbnail generation).

**Request shape: one endpoint, format as a query param.**
`GET /ytdl/api/download?url=<youtube-url>&format=mp4|mp3` — a GET (not POST) so the frontend can drive it from a plain link/anchor click if needed, matching how Storage's own file-download endpoint works. `url` is validated against a strict YouTube host allowlist (`youtube.com`, `youtu.be`, `www.youtube.com`, `m.youtube.com`) before being passed to `yt-dlp`, to close the obvious command-injection/SSRF-via-arbitrary-URL surface — `execFile`/`spawn` with an argument array (never a shell string) is used regardless, so no argument reaches a shell, but the host allowlist additionally stops the backend being used as an open downloader for arbitrary sites.

**Filename**: `Content-Disposition: attachment; filename="<sanitized-video-title>.<ext>"`, fetched via `yt-dlp --get-title` (or `--print`) before starting the actual stream, so the browser's save dialog shows a real name instead of a UUID. Title is sanitized (strip `/`, `\`, control chars) to keep the header valid.

**Timeout / abuse guard**: a hard wall-clock timeout (e.g. 10 minutes) on the child process, killed on client disconnect (`request.raw.on('close', ...)` aborts the child), so an aborted browser download does not leave an orphaned `yt-dlp`/`ffmpeg` process running.

## Risks / Trade-offs

[Risk: YouTube's ToS restricts downloading their content] → Mitigation/acceptance: this is a private, Keycloak-gated family tool for personal offline viewing, not a public redistribution service — same posture as any personal-use `yt-dlp` setup; out of scope for this design to adjudicate further.

[Risk: `yt-dlp` breaks when YouTube changes its site, requiring binary updates] → Mitigation: pin the Docker base to auto-fetch latest `yt-dlp` release at image build time (not vendored/frozen), and document the update path (`docker compose build --no-cache ytdl-backend`) in `DEPLOY_NOTES.md` if it ever breaks.

[Risk: long/large videos tie up a backend worker and container CPU/memory for the whole transcode] → Mitigation: the wall-clock timeout above bounds worst case; no request queue/concurrency limit is added in this change (single-family usage, low concurrency expected) — flagged as a follow-up if it becomes a real problem.

[Risk: passing user-supplied `url` to a child process is a command-injection surface] → Mitigation: `execFile`/`spawn` with an argv array (never string interpolation into a shell), plus the YouTube-host allowlist above.

[Risk: no Content-Length means some HTTP clients/proxies handle the download less gracefully] → Mitigation: accepted trade-off of streaming; nginx must not buffer this proxied response (`proxy_buffering off` on the `ytdl` location block), same concern as Storage's video streaming already had to solve.
