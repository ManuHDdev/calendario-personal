## 1. Paraísos: persistent ORS counter

- [ ] 1.1 `paraisos/infra/init.sql`: add `api_usage_counter` table (`api_name` text, `usage_date`
      date, `calls` integer default 0, primary key `(api_name, usage_date)`)
- [ ] 1.2 `paraisos/backend/src/db/usageCounter.ts` (new): `incrementUsage(apiName)` (upsert +1),
      `getUsageToday(apiName)` (reads today's row, `calls: 0` if none)
- [ ] 1.3 `paraisos/backend/src/routes/route.ts`: replace `dailyCount`/`dailyResetDate` module
      state and `underDailyCap()` with calls to `getUsageToday('ors')`/`incrementUsage('ors')`;
      keep the exact same 429/503 thresholds and response shapes
- [ ] 1.4 Unit tests: cap behavior unchanged (request under cap succeeds and increments, request at
      cap gets 503, cache hits don't increment), counter persists across a simulated "restart"
      (fresh module import re-reads from DB, not from zero)

## 2. Paraísos: usage endpoint

- [ ] 2.1 `paraisos/backend/src/middleware/internalAuth.ts` (new): `isValidInternalToken` +
      `internalAuthMiddleware()`, copying the `timingSafeEqual` pattern from
      `ofertas/backend/src/middleware/scraperAuth.ts` verbatim, checked against
      `PANEL_INTERNAL_TOKEN`
- [ ] 2.2 `paraisos/backend/src/routes/usage.ts` (new): `GET /paraisos/api/usage`, gated by
      `internalAuthMiddleware()`, returns `[{ api: 'ors', label: 'OpenRouteService', callsToday,
      dailyLimit: 2000, remaining, resetsAt }]`
- [ ] 2.3 Env var `PANEL_INTERNAL_TOKEN` added to `paraisos/backend`'s env var list
- [ ] 2.4 Unit tests: valid token succeeds, missing/wrong token gets 401, response shape matches
      the contract in design.md

## 3. Watchlist: persistent counters + usage endpoint

- [ ] 3.1 `watchlist/infra/init.sql`: same `api_usage_counter` table as Paraísos
- [ ] 3.2 `watchlist/backend/src/db/usageCounter.ts` (new): same `incrementUsage`/`getUsageToday`
      as Paraísos (small enough that a shared package isn't justified — see design.md)
- [ ] 3.3 `watchlist/backend/src/services/tmdb.ts`: call `incrementUsage('tmdb')` right after a
      successful upstream fetch, same place `dailyCount++` sits in Paraísos' `route.ts` (after the
      network call, before returning — never on a cache hit)
- [ ] 3.4 `watchlist/backend/src/services/googleBooks.ts`: same, `incrementUsage('google_books')`
- [ ] 3.5 `watchlist/backend/src/middleware/internalAuth.ts` (new, same as Paraísos' 2.1)
- [ ] 3.6 `watchlist/backend/src/routes/usage.ts` (new): `GET /watchlist/api/usage`, returns both
      `tmdb` (`dailyLimit: null`, `remaining: null`) and `google_books` (`dailyLimit: 1000`)
      entries
- [ ] 3.7 Env var `PANEL_INTERNAL_TOKEN` added to `watchlist/backend`'s env var list
- [ ] 3.8 Unit tests: both services increment on a real call and not on a cache hit, usage endpoint
      auth + shape (mirrors 2.4)

## 4. Panel: aggregation endpoint

- [ ] 4.1 `panel/backend/src/services/subappUsage.ts` (new): `getAllUsage()` — `Promise.allSettled`
      over both subapp calls, `AbortController` 3s timeout per call, maps any failure to
      `{ ..., unavailable: true, callsToday: null, remaining: null }` per design.md
- [ ] 4.2 `panel/backend/src/routes/usage.ts` (new): `GET /panel/api/usage`, gated by the existing
      `authAdminMiddleware`, returns the flattened `[ors, tmdb, google_books]` array from 4.1
- [ ] 4.3 Env vars `PANEL_INTERNAL_TOKEN`, `PARAISOS_BACKEND_URL`, `WATCHLIST_BACKEND_URL` added to
      `panel/backend`'s env var list (with the Compose-service-name defaults from design.md)
- [ ] 4.4 Register the new route in `panel/backend/src/index.ts`
- [ ] 4.5 Unit tests: both subapps healthy → 3 entries; one subapp down/timing out → that subapp's
      entry(ies) marked `unavailable`, the other's still populated, response is still 200

## 5. Panel: dashboard UI

- [ ] 5.1 `panel/frontend/src/services/api.ts`: `getApiUsage()` calling `GET /panel/api/usage`
- [ ] 5.2 `panel/frontend/src/components/UsageDashboard.tsx` (new): card grid, one card per API —
      label, "N of M today" or "N today" when uncapped, thin progress bar when capped, reset time
      in local timezone, muted "Unavailable" state when `unavailable`
- [ ] 5.3 `panel/frontend/src/pages/PanelPage.tsx`: render `<UsageDashboard />` as a new section
      below the user table, fetched once on mount alongside the existing `getUsers()` call
- [ ] 5.4 `panel/frontend/src/pages/PanelPage.css` (or a new `UsageDashboard.css`): card grid
      styling consistent with the existing Panel design system (see `panel/frontend/src/pages/PanelPage.css`)

## 6. Infra wiring

- [ ] 6.1 Generate `PANEL_INTERNAL_TOKEN` once (`openssl rand -hex 32`), same recipe as
      `SCRAPER_API_KEY`
- [ ] 6.2 `panel/infra/docker-compose.prod.yml`: add `PANEL_INTERNAL_TOKEN`,
      `PARAISOS_BACKEND_URL`, `WATCHLIST_BACKEND_URL` env vars to the `panel-backend` service
- [ ] 6.3 `paraisos/infra/docker-compose.prod.yml` and `.local.yml`: add `PANEL_INTERNAL_TOKEN` to
      `paraisos-backend`
- [ ] 6.4 `watchlist/infra/docker-compose.prod.yml` and `.local.yml`: add `PANEL_INTERNAL_TOKEN` to
      `watchlist-backend`
- [ ] 6.5 `start-local.sh` / `start-local.ps1`: export `PANEL_INTERNAL_TOKEN` for local runs of all
      three backends

## 7. Documentation

- [ ] 7.1 `CLAUDE.md`: Paraísos section — new `GET /usage` route, new env var, note the counter is
      now persistent
- [ ] 7.2 `CLAUDE.md`: Watchlist section — new `GET /usage` route, new env var
- [ ] 7.3 `CLAUDE.md`: Panel section — new `GET /usage` route, three new env vars

## 8. Verification

- [ ] 8.1 `npm run build` clean on all three touched backends and Panel's frontend
- [ ] 8.2 Unit test suites green on all three touched backends (existing + new tests from sections
      1-4)
- [ ] 8.3 Manual end-to-end against the local stack: trigger a real ORS call and a real TMDB/Google
      Books search, confirm `GET /panel/api/usage` reflects the increments and the dashboard cards
      update on reload
- [ ] 8.4 Manual: stop one of the two subapp backends, confirm the dashboard still loads with that
      API's card(s) showing "Unavailable" and the other card(s) populated
