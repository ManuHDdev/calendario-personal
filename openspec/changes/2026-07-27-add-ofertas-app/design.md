## Context

The monorepo has five sibling subapps on the same stack — `panel/`, `storage/`, `mapacyd/`, `ytdl/`, `gastos/` — each a Fastify + TypeScript backend and a React + Vite + TypeScript frontend, joined to the external `calendario-net` Docker network, gated by Keycloak JWT (realm `calendario`, hand-rolled `middleware/auth.ts` verification copied per-app — known, accepted debt). `mapacyd` and `gastos` are the closest precedents for `ofertas`: both own a real Postgres database, use `pg` directly (no ORM), Zod validation, and soft delete (`activo` + `deleted_at`) on every table.

`ofertas` follows that exact pattern for its human-facing half, with one new element none of the existing subapps have: a **second, non-Keycloak consumer** — the external `marketplace-watcher` Python scraper (systemd timer on the VPS, outside this monorepo) needs to read the active search list before each run, headlessly, with no browser and no interactive login. The closest existing precedent for that shape of problem is `vine-bot` (also outside this monorepo, also on this VPS), which already exposes bearer-token-protected endpoints to an external automated caller — this design reuses that proven pattern rather than inventing service-account/OAuth machinery for one read-only endpoint.

## Goals / Non-Goals

**Goals:**
- Let the owner create/view/edit/soft-delete saved searches (keyword, min/max price, location, which sites to search) from a web UI, replacing manual `config.yaml` edits.
- Expose a stable, versioned read contract that `marketplace-watcher` can eventually consume instead of its local `config.yaml`'s `searches:` section.
- Keep the human API (Keycloak-gated) and the machine API (bearer-token-gated) cleanly separated — different auth, different audience, no overlap.
- Match `marketplace-watcher`'s existing `SearchQuery` shape closely enough that wiring the scraper to this endpoint later is a small mechanical adapter, not a redesign.

**Non-Goals:**
- Not modifying `marketplace-watcher`'s own Python code in this change (see proposal.md) — only building and exposing the contract it will eventually consume.
- No ML/recommendation/"only show me stuff I'd actually like" feature here — that was floated separately by the owner as a future idea once a like/dislike feedback signal exists; this change doesn't touch it.
- No multi-user support — `admin`-only, single owner, same posture as `panel`/`gastos`.
- No realtime push/webhook from this backend to the scraper — the scraper already polls every 10 minutes via its own systemd timer; a `GET` before each run is sufficient, no need for anything more real-time.
- No attempt to unify or replace `marketplace-watcher`'s local SQLite (used only for de-duplicating already-notified listings, an unrelated concern) with this Postgres database.

## Decisions

### Two separate auth mechanisms for two audiences

The browser-facing CRUD API (`/ofertas/api/searches`, full read/write) is Keycloak-JWT-gated exactly like every sibling subapp — `admin` role only, verified both client-side (UX) and server-side (the actual boundary), via a copy of the existing `middleware/auth.ts` pattern.

The scraper-facing endpoint (`GET /ofertas/api/searches/active`) is gated by a single static bearer token instead (env var `SCRAPER_API_KEY`, checked via a separate, much simpler middleware — no JWT parsing, no JWKS fetch, just a constant-time string comparison against the `Authorization: Bearer <token>` header). Reusing Keycloak here would mean giving a headless cron job a service-account client, token refresh logic, and a dependency on Keycloak being reachable from a plain Python `requests` call — real complexity for one read-only endpoint, when this exact problem (external automated caller, same VPS) already has a working, accepted solution in `vine-bot`.

### Data model: table `busqueda`, one row per saved search

Columns: `id`, `nombre` (text — display name, e.g. "Juegos DS baratos"), `keyword` (text), `precio_min` (numeric, nullable), `precio_max` (numeric, nullable), `latitude` (numeric), `longitude` (numeric), `distance_km` (numeric), `milanuncios_province_slug` (text, nullable), `sitios` (jsonb — `{"wallapop": {"enabled": true}, "milanuncios": {"enabled": false}, "vinted": {"enabled": true}}`, matching the shape already used in `marketplace-watcher`'s own `config.yaml`), `activo` (boolean default true), `deleted_at` (timestamp nullable), `created_at`, `updated_at`. Same soft-delete convention as every other subapp with a database.

### `GET /ofertas/api/searches/active` is a stable, explicit response DTO — not a raw row dump

The response maps `busqueda` rows to a shape chosen to match `marketplace-watcher`'s existing `SearchQuery`/`config.yaml` field names as closely as possible (`name`, `keyword`, `max_price`, `min_price`, `latitude`, `longitude`, `distance_km`, `milanuncios_province_slug`, `sites: {wallapop: {enabled}, milanuncios: {enabled}, vinted: {enabled}}`), only including `activo=true` rows. This is a deliberate, separate mapping function (not `SELECT *`), so the `busqueda` table's internal columns (Spanish names, DB-specific fields like `id`/timestamps) can change without silently breaking the scraper's parser — the contract is the DTO, not the schema.

### Seeding the two searches the owner already validated

The owner already dry-ran two real searches locally (`Juegos DS baratos`, `Philips Hue baratos`, currently living in `marketplace-watcher/config.yaml` on his machine). A one-time seed (either a documented manual step or a small seed script run once against the new `ofertas` database) recreates them as `busqueda` rows, so nothing is lost when — in the separate follow-up change — the scraper switches from file-based to API-based search config.

### Bearer token lifecycle

Generated once (e.g. a random 32-byte token), stored as `SCRAPER_API_KEY` in the `ofertas-backend` container's env on the VPS. Rotation is manual: regenerate, update the backend's env, update the scraper's local config in the same follow-up step — same operational posture already accepted for `vine-bot`'s tokens. The endpoint is `GET`-only; the scraper never writes back, so there's no concurrent-writer story to design for.

## Risks / Trade-offs

[Risk: this change ships but the separate follow-up to wire `marketplace-watcher` to it never happens, leaving the new UI disconnected from the actual running scraper] → Mitigation: `marketplace-watcher` keeps reading `config.yaml` exactly as it does today regardless of whether this subapp exists — nothing here is a hard dependency for the scraper to keep working, so there's no urgency-driven pressure to rush the follow-up, and no risk of an outage if it's delayed.

[Risk: static bearer token leaked] → Mitigation: same accepted posture as `vine-bot` on this exact VPS; never logged, never echoed back by any endpoint, stored only in the backend's env and the scraper's local config file.

[Risk: the DTO field-name mapping to `marketplace-watcher`'s config shape drifts if that project's own schema changes independently] → Mitigation: the mapping lives in one function on the `ofertas` backend side; since the scraper's own repo isn't touched by this change, any drift will surface as an explicit, visible adapter mismatch in the follow-up change rather than a silent runtime failure today.

[Risk: a third Postgres database (`ofertas`, after `mapacyd`/`gastos`) adds a bit more backup/operational surface] → Mitigation: reuses the exact same shared Postgres 15 instance and backup story as `mapacyd`/`gastos` — no new infrastructure component, only a new database + one migration file.
