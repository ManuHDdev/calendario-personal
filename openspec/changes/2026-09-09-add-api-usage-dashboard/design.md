## Context

Nine subapps share the same shape (Fastify+TS backend, own Postgres DB, JWT verified by hand,
soft-delete `activo`+`deleted_at`), but none of them talks to another subapp's backend today —
every cross-subapp concern so far (AppLauncher entries, Keycloak roles) is wired through static
config duplicated per subapp, not a runtime call. Panel is the one exception in spirit: it already
calls out to an external system (Keycloak Admin API) on behalf of the admin user, so adding "call
another subapp's backend on behalf of the admin user" is a natural, small extension of what Panel
already is — an aggregation point — rather than a new kind of thing in the monorepo.

Two of the three tracked APIs (ORS in Paraísos, and both of Watchlist's) sit behind endpoints that
are also called directly by end users (`/route-distance` is public with no auth, `/search/*` is
Keycloak-gated but end-user-facing). The usage dashboard is a *different* consumer — Panel, on
behalf of an admin, not an end user — so it needs its own endpoint and its own auth, not something
bolted onto the existing user-facing routes.

## Goals / Non-Goals

**Goals:**
- An admin opens Panel and sees, for ORS, TMDB, and Google Books: calls made today, calls
  remaining (when the API has a published cap), and when the count resets.
- The Paraísos ORS counter survives a redeploy — no more accidentally resetting the self-imposed
  guard mid-day.
- Adding the tracking/exposure code to Paraísos and Watchlist must not change what
  `/route-distance` or `/search/*` return or how they behave for their existing callers.
- If Paraísos or Watchlist's backend is unreachable, the dashboard still renders — that one card
  shows "unavailable", the rest of the page works.

**Non-Goals:**
- No new blocking/rate-limiting behavior for TMDB or Google Books (see proposal.md Non-goals).
- No historical data, no alerting — see proposal.md Non-goals.
- No generic "usage-tracked API" abstraction shared across subapps as a package — three explicit
  implementations, consistent with how this monorepo already avoids shared packages between
  independently-deployed Docker images (documented in CLAUDE.md's "Deuda técnica conocida" for
  exactly this reason: the JWT middleware and AppLauncher are already duplicated per subapp rather
  than extracted).

## Decisions

### Persistence: one `api_usage_counter` row per API per UTC day, in each subapp's own DB

```sql
CREATE TABLE api_usage_counter (
  api_name   TEXT NOT NULL,       -- 'ors' | 'tmdb' | 'google_books'
  usage_date DATE NOT NULL,       -- UTC calendar day
  calls      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (api_name, usage_date)
);
```

Incrementing is a single upsert: `INSERT ... ON CONFLICT (api_name, usage_date) DO UPDATE SET
calls = api_usage_counter.calls + 1`, called once per real upstream call (never on a cache hit —
same rule Paraísos' `route.ts` already follows: `dailyCount++` sits right after the `fetch`, not
before the cache-hit early return). "Today" is read the same way `dailyResetDate` already computes
it in `route.ts` (`new Date().toISOString().slice(0, 10)`, UTC), so the reset boundary doesn't
change from what's already documented and relied on.

Rejected alternative: keep the counter in memory but persist it to disk periodically (e.g. a JSON
file on the existing `PARAISOS_IMAGES_PATH` volume). Rejected because both subapps already have a
Postgres DB doing exactly this kind of small-table bookkeeping (`spot`, `item`), and a
date-keyed table needs no explicit "reset" logic — a new day is simply a new row, with no cron job
or startup check required. A file would need the same upsert-by-date logic plus manual
read/write/lock handling for no benefit.

No new table is added to Panel — Panel has no DB of its own (state lives in Keycloak) and doesn't
need one here either, since it never counts anything itself, only relays.

### Exposure: a bearer-token-gated `GET .../api/usage` per subapp, not folded into an existing route

Both new endpoints (`GET /paraisos/api/usage`, `GET /watchlist/api/usage`) require
`Authorization: Bearer <PANEL_INTERNAL_TOKEN>`, checked with `crypto.timingSafeEqual` — the exact
pattern `ofertas/backend/src/middleware/scraperAuth.ts` already implements for `SCRAPER_API_KEY`.
`PANEL_INTERNAL_TOKEN` is a single secret shared by all three services (Panel as the caller,
Paraísos and Watchlist as callees), generated once (`openssl rand -hex 32`, same recipe as
`SCRAPER_API_KEY`) and never logged or returned in any response body.

Rejected alternative: reuse each subapp's existing Keycloak `authMiddleware(['admin'])` for the
usage endpoint, having Panel's backend forward the calling admin's own JWT. Rejected because that
JWT's audience is the Keycloak client used by end-user frontends, and forwarding it between
backends is a pattern that doesn't exist anywhere in this monorepo — the Ofertas precedent (a
backend-to-backend call authenticated by a static shared secret, decoupled from any human's
session) is the closer, already-proven fit, and it keeps the usage endpoint reachable for
diagnostics independent of whether a given admin's browser session is alive.

Response shape (both endpoints), one entry per API the subapp tracks:

```ts
interface ApiUsageEntry {
  api: 'ors' | 'tmdb' | 'google_books';
  label: string;          // "OpenRouteService", "TMDB", "Google Books"
  callsToday: number;
  dailyLimit: number | null;   // null = no published cap (TMDB)
  remaining: number | null;    // null when dailyLimit is null
  resetsAt: string;            // ISO-8601, next UTC midnight
}
```

Paraísos returns a one-element array (`ors`); Watchlist returns a two-element array (`tmdb`,
`google_books`). Panel's `GET /panel/api/usage` flattens both into one array, in that fixed order
(ors, tmdb, google_books), plus an `unavailable: boolean` flag alongside any entry it couldn't
fetch — never a 5xx for the whole request just because one upstream is down.

### Panel → subapp calls: plain `fetch`, no retry, 3s timeout, one fallback shape

`panel/backend/src/services/subappUsage.ts` calls both endpoints with `Promise.allSettled` (not
`Promise.all` — one failing must not fail the other) and a `3000ms` `AbortController` timeout per
call, matching the "degrade a single card, not the whole page" goal. On any failure (network
error, non-2xx, timeout, malformed body) the entry for that subapp's API/APIs is replaced with
`{ ...knownShape, unavailable: true, callsToday: null, remaining: null }` rather than being
dropped, so the frontend always has a card to render per known API.

Internal base URLs come from new env vars `PARAISOS_BACKEND_URL` /
`WATCHLIST_BACKEND_URL` (default to the Docker Compose service DNS names already used inside
`calendario-net`, e.g. `http://paraisos-backend:3007`, `http://watchlist-backend:3009` — matching
how `paraisos/backend`'s own `KEYCLOAK_CERTS_URL` default already points at another service by its
Compose name), overridable for local dev where each backend runs on `localhost` with a distinct
port.

### Frontend: a card grid inside PanelPage, not a separate route

The dashboard is a new section on the existing `PanelPage` (below the user table), not a new
top-level page or `App.tsx` route — it's a single `GET` on mount, no sub-navigation needed for
three cards. `getApiUsage()` is added to `panel/frontend/src/services/api.ts` next to the existing
`getUsers()`/`getRoles()`. Each card shows the API label, "N of M today" (or just "N today" when
`dailyLimit` is `null`), a thin progress bar when there's a cap, and the reset time formatted in
the browser's local timezone. An `unavailable` card shows a muted "Unavailable" state instead of
numbers, with no error banner blocking the rest of the page — consistent with how `PanelPage`
already isolates its `error` state to the user-table section only.

## Risks / Trade-offs

[Risk: `PANEL_INTERNAL_TOKEN` leaking would let a holder read usage counts — low-sensitivity data,
but still a new secret to manage across three services] → Mitigation: same generation/rotation
story already documented for `SCRAPER_API_KEY` (`openssl rand -hex 32`, never logged, never
returned in a response body); the blast radius of a leak is read-only visibility into call counts,
not write access to anything.

[Risk: migrating Paraísos' counter from in-memory to Postgres could regress the existing
`/route-distance` cap behavior if the upsert has a bug] → Mitigation: task list requires unit
tests asserting the exact same cap behavior as today (429/503 thresholds unchanged) before and
after the migration, run against the existing `route.test.ts`-style suite pattern used elsewhere
in this monorepo.

[Risk: Panel now has a runtime dependency on two other backends being reachable, a new kind of
coupling in this monorepo] → Mitigation: explicitly scoped to one read-only, non-blocking
dashboard section — no other Panel functionality (user management) depends on Paraísos or
Watchlist being up, and a failure there degrades to per-card "unavailable", never a page-level
error.

[Risk: Google Books' real free-tier default (1,000/day) is a platform default, not a value this
codebase controls — Google could change it] → Mitigation: same posture as ORS's already-documented
"self-imposed cap below the real one" — the `dailyLimit` shown is informational, sourced from a
constant in code (easy to update if Google's documented default changes), not fetched live from
Google's API (which does not expose remaining quota programmatically for either provider).
