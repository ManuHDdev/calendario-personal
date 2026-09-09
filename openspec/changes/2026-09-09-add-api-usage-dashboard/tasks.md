## 1. Paraísos: persistent ORS counter

- [x] 1.1 `paraisos/infra/init.sql`: add `api_usage_counter` table (`api_name` text, `usage_date`
      date, `calls` integer default 0, primary key `(api_name, usage_date)`)
- [x] 1.2 `paraisos/backend/src/db/usageCounter.ts` (new): `incrementUsage(apiName)` (upsert +1),
      `getUsageToday(apiName)` (reads today's row, `calls: 0` if none)
- [x] 1.3 `paraisos/backend/src/routes/route.ts`: replace `dailyCount`/`dailyResetDate` module
      state and `underDailyCap()` with calls to `getUsageToday('ors')`/`incrementUsage('ors')`;
      keep the exact same 429/503 thresholds and response shapes
- [x] 1.4 Unit tests: cap behavior unchanged (request under cap succeeds and increments, request at
      cap gets 503, cache hits don't increment), counter persists across a simulated "restart"
      (fresh module import re-reads from DB, not from zero)

## 2. Paraísos: usage endpoint

- [x] 2.1 `paraisos/backend/src/middleware/internalAuth.ts` (new): `isValidInternalToken` +
      `internalAuthMiddleware()`, copying the `timingSafeEqual` pattern from
      `ofertas/backend/src/middleware/scraperAuth.ts` verbatim, checked against
      `PANEL_INTERNAL_TOKEN`
- [x] 2.2 `paraisos/backend/src/routes/usage.ts` (new): `GET /paraisos/api/usage`, gated by
      `internalAuthMiddleware()`, returns `[{ api: 'ors', label: 'OpenRouteService', callsToday,
      dailyLimit: 2000, remaining, resetsAt }]`
- [x] 2.3 Env var `PANEL_INTERNAL_TOKEN` added to `paraisos/backend`'s env var list
- [x] 2.4 Unit tests: valid token succeeds, missing/wrong token gets 401, response shape matches
      the contract in design.md

## 3. Watchlist: persistent counters + usage endpoint

- [x] 3.1 `watchlist/infra/init.sql`: same `api_usage_counter` table as Paraísos
- [x] 3.2 `watchlist/backend/src/db/usageCounter.ts` (new): same `incrementUsage`/`getUsageToday`
      as Paraísos (small enough that a shared package isn't justified — see design.md)
- [x] 3.3 `watchlist/backend/src/services/tmdb.ts`: call `incrementUsage('tmdb')` right after a
      successful upstream fetch, same place `dailyCount++` sits in Paraísos' `route.ts` (after the
      network call, before returning — never on a cache hit)
- [x] 3.4 `watchlist/backend/src/services/googleBooks.ts`: same, `incrementUsage('google_books')`
- [x] 3.5 `watchlist/backend/src/middleware/internalAuth.ts` (new, same as Paraísos' 2.1)
- [x] 3.6 `watchlist/backend/src/routes/usage.ts` (new): `GET /watchlist/api/usage`, returns both
      `tmdb` (`dailyLimit: null`, `remaining: null`) and `google_books` (`dailyLimit: 1000`)
      entries
- [x] 3.7 Env var `PANEL_INTERNAL_TOKEN` added to `watchlist/backend`'s env var list
- [x] 3.8 Unit tests: both services increment on a real call and not on a cache hit, usage endpoint
      auth + shape (mirrors 2.4)

## 4. Panel: aggregation endpoint

- [x] 4.1 `panel/backend/src/services/subappUsage.ts` (new): `getAllUsage()` — `Promise.allSettled`
      over both subapp calls, `AbortController` 3s timeout per call, maps any failure to
      `{ ..., unavailable: true, callsToday: null, remaining: null }` per design.md
- [x] 4.2 `panel/backend/src/routes/usage.ts` (new): `GET /panel/api/usage`, gated by the existing
      `authAdminMiddleware`, returns the flattened `[ors, tmdb, google_books]` array from 4.1
- [x] 4.3 Env vars `PANEL_INTERNAL_TOKEN`, `PARAISOS_BACKEND_URL`, `WATCHLIST_BACKEND_URL` added to
      `panel/backend`'s env var list (with the Compose-service-name defaults from design.md)
- [x] 4.4 Register the new route in `panel/backend/src/index.ts`
- [x] 4.5 Unit tests: both subapps healthy → 3 entries; one subapp down/timing out → that subapp's
      entry(ies) marked `unavailable`, the other's still populated, response is still 200 — plus
      bootstrapped vitest for panel/backend (it had zero test infra before this change)

## 5. Panel: dashboard UI

- [x] 5.1 `panel/frontend/src/services/api.ts`: `getApiUsage()` calling `GET /panel/api/usage`
- [x] 5.2 `panel/frontend/src/components/UsageDashboard.tsx` (new): card grid, one card per API —
      label, "N of M today" or "N today" when uncapped, thin progress bar when capped, reset time
      in local timezone, muted "Unavailable" state when `unavailable`
- [x] 5.3 `panel/frontend/src/pages/PanelPage.tsx`: render `<UsageDashboard />` as a new section
      below the user table, fetched once on mount alongside the existing `getUsers()` call
- [x] 5.4 `panel/frontend/src/pages/PanelPage.css` (or a new `UsageDashboard.css`): card grid
      styling consistent with the existing Panel design system (see `panel/frontend/src/pages/PanelPage.css`)

## 6. Infra wiring

- [ ] 6.1 Generate `PANEL_INTERNAL_TOKEN` once (`openssl rand -hex 32`), same recipe as
      `SCRAPER_API_KEY`
- [x] 6.2 `panel/infra/docker-compose.prod.yml`: add `PANEL_INTERNAL_TOKEN` env var to the
      `panel-backend` service (`PARAISOS_BACKEND_URL`/`WATCHLIST_BACKEND_URL` are NOT set here —
      their code defaults already match the real prod container names `paraisos-backend`/
      `watchlist-backend`, confirmed against both prod compose files)
- [x] 6.3 `paraisos/infra/docker-compose.prod.yml`: add `PANEL_INTERNAL_TOKEN` to `paraisos-backend`
      (`.local.yml` only defines the DB service — the local backend runs via `npm run dev`/
      start-local, not compose, so nothing to add there)
- [x] 6.4 `watchlist/infra/docker-compose.prod.yml`: add `PANEL_INTERNAL_TOKEN` to
      `watchlist-backend` (same `.local.yml` note as 6.3)
- [x] 6.5 `start-local.sh` / `start-local.ps1`: export `PANEL_INTERNAL_TOKEN` for local runs of all
      three backends, plus `PARAISOS_BACKEND_URL`/`WATCHLIST_BACKEND_URL` for panel-backend. Also
      fixed a pre-existing, unrelated syntax bug found while validating `start-local.ps1`
      (`$env:($key) = ...` is invalid PowerShell — dynamic env var names need `Set-Item -Path
      "env:$key"`) that silently broke env var passing for every backend the script starts, not
      just the ones touched by this change.
- [ ] 6.6 **Operational, post-merge** — `init.sql` only runs on Postgres's first boot on an empty
      volume (no migration framework in this monorepo, confirmed live in 8.3): the real
      `paraisos-db` and `watchlist-db` already have data, so redeploying will NOT create
      `api_usage_counter` there by itself. After merging, run this once against both prod DBs
      (idempotent, safe to re-run):
      `CREATE TABLE IF NOT EXISTS api_usage_counter (api_name TEXT NOT NULL, usage_date DATE NOT
      NULL, calls INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (api_name, usage_date));`
      e.g. `docker exec -i paraisos-db psql -U <user> -d paraisos` (and the equivalent for
      `watchlist-db`) — left unchecked intentionally, same as the analogous realm-update step in
      `add-reparto-app`'s tasks.md (9.5).

## 7. Documentation

- [x] 7.1 `CLAUDE.md`: Paraísos section — new `GET /usage` route, new env var, note the counter is
      now persistent
- [x] 7.2 `CLAUDE.md`: Watchlist section — new `GET /usage` route, new env var
- [x] 7.3 `CLAUDE.md`: Panel section — new `GET /usage` route, three new env vars — also updated the
      stale "Sin tests" debt note now that panel/backend has partial vitest coverage

## 8. Verification

- [x] 8.1 `npm run build` clean on all three touched backends and Panel's frontend. Found and fixed
      one real bug along the way: `panel/backend/tsconfig.json` had no `src/**/*.test.ts` exclude
      (every other backend's tsconfig already has it), so `tsc` compiled the new test files into
      `dist/`, which vitest's default include pattern then picked up alongside the real `src`
      tests, breaking the suite with CJS/ESM require errors. Fixed by adding the same exclude
      watchlist/paraisos already use.
- [x] 8.2 Unit test suites green on all three touched backends (existing + new tests from sections
      1-4): paraisos 20/20, watchlist 33/33, panel 9/9
- [x] 8.3 (partial, real Postgres + real HTTP, no live third-party keys) Started
      `paraisos-db-local`/`watchlist-db-local` for real, ran `paraisos-backend`/`watchlist-backend`
      against them, hit `GET /paraisos/api/usage` and `GET /watchlist/api/usage` over real HTTP
      with the internal token (401 without it, 200 with it, correct empty shape). Inserted rows
      directly (`INSERT INTO api_usage_counter ...`) to stand in for real ORS/TMDB/Google Books
      calls (no API keys available in this session) and confirmed both endpoints reflect them
      exactly. Ran `panel/backend`'s real `getAllUsage()` against both real running backends
      (not mocked) and got the correctly flattened `[ors, tmdb, google_books]` array. **Not
      exercised**: the actual `incrementUsage()` call inside `tmdb.ts`/`googleBooks.ts`/`route.ts`
      firing off a genuine upstream fetch — that exact code path is covered by the mocked unit
      tests in sections 1/3 instead. **Found and worked around a deploy-time gap this surfaced**:
      `paraisos-db-local`/`watchlist-db-local` already had data from earlier sessions, so
      `init.sql` did NOT re-run and `api_usage_counter` had to be created by hand
      (`CREATE TABLE IF NOT EXISTS ...`, same DDL as 1.1/3.1) — `init.sql` only runs Postgres's
      first boot on an empty volume, same limitation already true of every other schema change in
      this monorepo (no migration framework, see CLAUDE.md). **This means the real prod
      `paraisos-db`/`watchlist-db` need this table created by hand too** — see new task 6.6.
- [x] 8.3b Also confirmed via the same live run that this table's `CREATE TABLE IF NOT EXISTS`
      correctly no-ops when run twice (idempotent), so re-running it by mistake is harmless.
- [x] 8.4 Killed the real `paraisos-backend` process (verified unreachable), re-ran the real
      `getAllUsage()` against the two real backends: returned in 90ms (fails fast on connection
      refused, doesn't wait out the 3s timeout), `ors` entry `unavailable: true` with all null
      fields, `tmdb`/`google_books` entries populated normally. Exactly the designed behavior,
      verified live, not mocked.
