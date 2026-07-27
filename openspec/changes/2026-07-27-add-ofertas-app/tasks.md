## 1. Database (`ofertas` Postgres DB)

- [x] 1.1 Create database `ofertas` on the existing shared Postgres 15 instance, own credentials (mirrors `mapacyd`/`gastos`'s setup)
- [x] 1.2 Migration: table `busqueda` (`id`, `nombre` text, `keyword` text, `precio_min` numeric nullable, `precio_max` numeric nullable, `latitude` numeric, `longitude` numeric, `distance_km` numeric, `milanuncios_province_slug` text nullable, `sitios` jsonb, `activo` boolean default true, `deleted_at` timestamp nullable, `created_at`, `updated_at`)
- [x] 1.3 Index on `(activo)` for the active-searches lookup

## 2. Backend scaffold (`ofertas/backend/`)

- [x] 2.1 Scaffold `ofertas/backend/` as Fastify + TypeScript, copying `mapacyd/backend`'s `package.json`/`tsconfig.json`/project layout as the starting point
- [x] 2.2 Copy `mapacyd/backend/src/middleware/auth.ts` verbatim into `ofertas/backend/src/middleware/auth.ts` (Keycloak JWT, same accepted duplication as the other subapps)
- [x] 2.3 New `ofertas/backend/src/middleware/scraperAuth.ts` — separate, simple bearer-token check against `SCRAPER_API_KEY`, used only on the active-searches route
- [x] 2.4 `authMiddleware` + `hasAnyRole(user, ['admin'])` guard applied to every `/ofertas/api/searches*` human route; any other role gets HTTP 403
- [x] 2.5 `GET /ofertas/api/health` endpoint
- [x] 2.6 Env vars: `OFERTAS_DB_HOST`, `OFERTAS_DB_NAME`, `OFERTAS_DB_USER`, `OFERTAS_DB_PASSWORD`, `KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`, `PORT` (default 3006), `SCRAPER_API_KEY`

## 3. Saved-search CRUD API (Keycloak-gated, admin only)

- [x] 3.1 `POST /ofertas/api/searches` — Zod-validated body (`nombre`, `keyword`, `precio_min?`, `precio_max?`, `latitude`, `longitude`, `distance_km`, `milanuncios_province_slug?`, `sitios`)
- [x] 3.2 `GET /ofertas/api/searches` — list, filtered by `activo=true`
- [x] 3.3 `PATCH /ofertas/api/searches/:id` — edit fields
- [x] 3.4 `DELETE /ofertas/api/searches/:id` — soft delete (`activo=false`, `deleted_at=now()`)
- [x] 3.5 Unit tests: Zod validation rejects malformed bodies; role guard rejects non-admin; soft delete excludes rows from `GET /searches`

## 4. External scraper contract (bearer-token-gated, read-only)

- [x] 4.1 `GET /ofertas/api/searches/active` — bearer-token-gated via `scraperAuth.ts`, returns only `activo=true` rows
- [x] 4.2 Explicit response-DTO mapping function (not `SELECT *`): `busqueda` row → `{ name, keyword, max_price, min_price, latitude, longitude, distance_km, milanuncios_province_slug, sites: { wallapop: { enabled }, milanuncios: { enabled }, vinted: { enabled } } }`, matching `marketplace-watcher`'s existing `SearchQuery`/`config.yaml` field names
- [x] 4.3 Unit tests: missing/wrong bearer token → 401; correct token → 200 with only active rows, in the mapped DTO shape (not raw DB columns)
- [x] 4.4 One-time seed (script or documented manual step) recreating the owner's two already-validated searches ("Juegos DS baratos", "Philips Hue baratos") as `busqueda` rows in the new database

## 5. Frontend (`ofertas/frontend/`)

- [x] 5.1 Scaffold `ofertas/frontend/` as React + Vite + TypeScript, mirroring `mapacyd/frontend`'s project setup (Keycloak login flow, API client pattern)
- [x] 5.2 Saved-search list view (table/cards)
- [x] 5.3 Create/edit form: nombre, keyword, precio_min/max, latitude/longitude, distance_km, milanuncios_province_slug, per-site enable toggles (wallapop/milanuncios/vinted)
- [x] 5.4 Delete (soft) action with confirmation
- [x] 5.5 `ofertas/frontend/Dockerfile` mirroring `mapacyd/frontend`'s

## 6. Infra wiring

- [x] 6.1 `ofertas/infra/docker-compose.prod.yml`: `ofertas-backend` + `ofertas-frontend` services on the external `calendario-net` network, mirroring `mapacyd/infra/docker-compose.prod.yml` (image names `ghcr.io/manuhddev/ofertas-backend:latest` / `ofertas-frontend:latest`, healthcheck against `/ofertas/api/health`)
- [x] 6.2 `nginx/calendario.conf`: new location block for `ofertas`
- [x] 6.3 `start-local.sh`/`start-local.ps1`: add `ofertas-backend` (port 3006) and `ofertas-frontend` (port 5178) to the local dev stack
- [x] 6.4 CI: GitHub Actions workflow for `ofertas` mirroring the existing subapps' (build + push `ghcr.io` images)
- [x] 6.5 `panel/frontend/src/components/AppLauncher.tsx`, `storage/frontend/src/components/AppLauncher.tsx`, `calendario-frontend/.../app-launcher.ts`: add `ofertas` entry (`roles: ['admin']`, color, icon, URL mapping for local + prod)
- [x] 6.6 Update `CLAUDE.md`'s subapp table (ports table) with the new `ofertas` entry, and add an `## Ofertas` section documenting stack/roles/routes/env vars following the existing per-subapp format — explicitly note the external `marketplace-watcher` relationship and that wiring the scraper itself is a separate follow-up change

## 7. Verification

- [x] 7.1 `npm run build` (backend) and `npm run build` (frontend) both compile without errors
- [x] 7.2 Backend unit tests green (CRUD validation, Keycloak role guard, bearer-token guard, soft delete, DTO mapping)
- [ ] 7.3 Manual end-to-end against the real local stack: log in as `admin`, create/edit/delete a search via the UI; call `GET /ofertas/api/searches/active` with the bearer token and confirm the response shape matches what `marketplace-watcher` expects — **NOT DONE**: explicitly out of scope for this apply run per the orchestrator's boundaries ("do not run `docker compose up`... this is local monorepo file creation only"). Requires the user/orchestrator to start the real stack (`start-local.ps1`/`start-local.sh`) and log in through Keycloak.
- [ ] 7.4 Confirm `familia`/`invitado` accounts cannot see `ofertas` in the AppLauncher and get HTTP 403 if they hit `/ofertas/api/searches` directly; confirm the active-searches endpoint rejects requests without the correct bearer token — **NOT DONE**: same reason as 7.3, requires a live stack and real Keycloak accounts. The role-guard and bearer-token-guard *logic* is covered by automated unit tests (`hasAnyRole`, `isValidScraperToken`), but the live end-to-end HTTP behavior against a running server was not exercised.
