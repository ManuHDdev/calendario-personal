## Why

Three subapps call external APIs with a hard usage quota: Paraísos calls OpenRouteService
(`ORS_API_KEY`, real plan limit 2500 requests/day) for `GET /route-distance`, and Watchlist calls
TMDB (`TMDB_API_KEY`) and Google Books (`GOOGLE_BOOKS_API_KEY`, default free quota 1,000
requests/day per project) for autocomplete search. Right now there is no way to see how close any
of them is to its limit. Paraísos does track a self-imposed daily cap (2000, below ORS's real
2500), but the counter is a plain in-memory variable — it resets on every redeploy, so a redeploy
right before a busy day silently gives the app a fresh 2000-request budget mid-window, and there's
no visibility into it beyond reading server logs. TMDB and Google Books have zero tracking at all.

The owner wants a single dashboard in Panel — the place that already centralizes cross-subapp
administration — showing, for every rate-limited external API in the monorepo: calls made, calls
remaining, and when the count resets.

## What Changes

- **Paraísos**: replace the in-memory daily ORS counter with a Postgres-backed one (new
  `api_usage_counter` table, one row per UTC day) so it survives redeploys. Add
  `GET /paraisos/api/usage`, bearer-token-gated with a new `PANEL_INTERNAL_TOKEN` shared secret
  (same "static token for a trusted internal consumer, no interactive login" pattern already used
  by Ofertas' `SCRAPER_API_KEY`), returning today's ORS call count, the 2000/day cap, and the next
  UTC-midnight reset time. No change to the existing rate-limit/cache behavior seen by callers of
  `/route-distance`, only where the counter lives.
- **Watchlist**: add the same `api_usage_counter` table (own Postgres DB) and increment it on every
  real TMDB/Google Books call (cache hits don't count, matching Paraísos' existing convention).
  Add `GET /watchlist/api/usage`, same `PANEL_INTERNAL_TOKEN` gate, returning both APIs' counts —
  Google Books with the documented 1,000/day cap, TMDB with no cap (none is published) so the
  dashboard shows "calls today" for it without a remaining/limit fraction. Purely additive: no
  new blocking or rate-limiting is introduced for either API, only counting.
- **Panel**: backend adds `GET /panel/api/usage`, admin-gated like every other Panel route, that
  calls both subapps' internal `/usage` endpoints in parallel and returns a combined list (falling
  back to a per-API "unavailable" entry, never a hard failure, if one subapp backend is down).
  Frontend adds a new "API usage" section to the admin dashboard (`PanelPage`) with one card per
  tracked API: calls today, remaining (when there's a cap), and reset time.
- Env var `PANEL_INTERNAL_TOKEN` (new, shared secret) added to Panel, Paraísos, and Watchlist
  backends.

## Capabilities

### New Capabilities
- None (no new subapp).

### Modified Capabilities
- `panel`: new admin-only API usage dashboard, aggregating data from Paraísos and Watchlist.
- `paraisos`: the existing ORS daily-cap counter becomes persistent (Postgres) instead of
  in-memory, and is now exposed to a trusted internal consumer.
- `watchlist`: TMDB and Google Books calls are now counted and exposed to a trusted internal
  consumer; no behavior change to search itself.

## Impact

- `paraisos/backend/src/routes/route.ts`: `dailyCount`/`dailyResetDate` module state replaced by
  reads/writes against `api_usage_counter`.
- `paraisos/backend/src/routes/usage.ts` (new), `paraisos/infra/init.sql` (new table).
- `watchlist/backend/src/services/tmdb.ts`, `googleBooks.ts`: increment the counter after a
  successful upstream call.
- `watchlist/backend/src/routes/usage.ts` (new), `watchlist/infra/init.sql` (new table).
- `panel/backend/src/routes/usage.ts` (new), `panel/backend/src/services/subappUsage.ts` (new —
  the two outbound HTTP calls + the "unavailable" fallback).
- `panel/frontend/src/pages/PanelPage.tsx` (new section) or a new `UsageDashboard.tsx` component
  rendered from it, `panel/frontend/src/services/api.ts` (new `getApiUsage()`).
- `infra/docker-compose.yml` / `.prod.yml` equivalents for paraisos, watchlist, panel: new
  `PANEL_INTERNAL_TOKEN` env var on all three; Panel needs the internal base URLs of the other two
  backends (`PARAISOS_BACKEND_URL`, `WATCHLIST_BACKEND_URL`, defaulting to the Docker service
  names on `calendario-net`).
- `CLAUDE.md`: update the Paraísos and Watchlist sections (new table + route), and the Panel
  section (new route + env var).
- No changes to any other subapp, and no changes to Keycloak roles.

## Non-goals

- No new hard rate-limiting for TMDB or Google Books — only observability. Enforcing a cap on
  either is a separate, explicit follow-up if it turns out to be needed.
- No historical/multi-day charting in v1 — the dashboard shows only the current day's counters and
  the two static caps. A time-series view is a possible follow-up.
- No alerting (email/Telegram) when an API approaches its limit in v1.
- No generalized "register any future rate-limited API here" plugin mechanism — three explicit,
  hardcoded entries (ORS, TMDB, Google Books), matching how every other cross-subapp concern in
  this monorepo is wired (explicit per-subapp code, no shared package).
