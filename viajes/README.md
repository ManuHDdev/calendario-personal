# Viajes - trip planner

Plan a trip on a map with the group: lodging, points of interest, food and
anything else, spread over days, with distances, a day-by-day route and
GPX / calendar export.

- Frontend: `https://<domain>/viajes/` (React + Vite + Leaflet / OpenStreetMap, no API key)
- API: `/viajes/api/*` (Fastify + zod + PostgreSQL, Keycloak JWT)
- Local ports: frontend `:5192`, backend `:3030`, PostgreSQL `:5446`

## What it does

- **Trips** with optional start/end dates; every place belongs to one trip.
- **Places** of four types (`alojamiento`, `interes`, `comida`, `otro`), added by
  clicking the map or searching an address. Each has notes, optional URL, optional
  cost, a visited checkbox and a colour/icon per type.
- **Scheduling**: a place may have a visit date, start time and duration. Places
  without a date live in the "pending" list. Lodging has check-in / check-out dates
  instead (several lodgings per trip are fine).
- **Order within a day**: drag and drop (also between days and to/from pending) or
  the up/down buttons.
- **Itinerary tab**: one card per day with legs between stops, total km and time
  per day and for the whole trip, and the daily route drawn on the map. Each day
  starts (and optionally ends) at the lodging covering that night.
- **Measure tab**: pick two places for straight-line + road distance, or up to 10
  for a distance matrix.
- **Nearest lodging** for any place, ranked by straight-line distance, with road
  distance for the closest three on demand.
- **Summary tab**: counts by type, visited, scheduled/pending, total cost, km; export
  to **GPX** (waypoints + one route per day) and **.ics** (events; lodging as
  multi-day all-day events).

## Roles

| Role              | Access                                                       |
|-------------------|--------------------------------------------------------------|
| `admin`           | Everything                                                   |
| `viajes_admin`    | Everything in Viajes (create/edit/delete trips and places)   |
| `viajes_invitado` | Read-only                                                    |
| `familia`         | Read-only (same as for MapaCYD)                              |

Write routes: `authMiddleware(['admin', 'viajes_admin'])`.
Read routes: `['admin', 'familia', 'viajes_admin', 'viajes_invitado']`.
The frontend mirrors this in `src/services/keycloak.ts` (`canWrite` / `canRead`).
In the AppLauncher the app is visible to `admin` only by default (like the other new
subapps); delegated roles are assigned from Panel.

`viajes_admin` is assigned to `propietario` by `scripts/keycloak-update-realm.sh`;
`viajes_invitado` is created but left unassigned.

## API (`/viajes/api`)

| Method | Path | Notes |
|--------|------|-------|
| GET/POST | `/trips` | list / create |
| GET/PATCH/DELETE | `/trips/:id` | detail (with places) / update / soft delete |
| POST | `/trips/:id/places` | create place |
| PATCH/DELETE | `/trips/:id/places/:placeId` | update / soft delete. `visitDate: null` also clears the start time |
| POST | `/trips/:id/reorder` | `{ date \| null, placeIds[] }` moves places into a day (or pending) in that order |
| GET | `/trips/:id/itinerary?profile=driving\|foot\|bike&withLodging=true&roundTrip=true` | days, legs, polyline geometry, totals |
| GET | `/trips/:id/summary` | counts, cost, straight-line km |
| GET | `/trips/:id/distance?from&to&profile` | two places of the trip |
| GET | `/distance?fromLat&fromLng&toLat&toLng&profile` | two arbitrary points |
| GET | `/trips/:id/distance-matrix?ids=a,b,c&profile&road=true` | 2-10 places; straight-line always, road via OSRM `/table` |
| GET | `/trips/:id/places/:placeId/nearest-lodging?road=false&profile` | lodgings ranked by distance |
| GET | `/trips/:id/export.gpx`, `/trips/:id/export.ics` | file downloads |
| GET | `/geocode/search?q=`, `/geocode/reverse?lat&lng` | Nominatim proxy |
| GET | `/health` | open |

All delete operations are soft deletes (`activo=false`, `deleted_at`).

## Distances: how they are computed

- **Straight line (haversine)** is always available, instantly, on both client and
  server (`backend/src/lib/geo.ts`, `frontend/src/lib/geo.ts`).
- **Road distance + duration** come from OSRM, called by the backend and cached in
  Postgres (`route_cache`, key = profile + coordinates rounded to ~1 m, 30 days).
  A whole day is routed with a single request (all waypoints), so the cost is one
  call per day, not one per leg.
- **Graceful fallback**: if OSRM fails, times out (6 s, `OSRM_TIMEOUT_MS`), answers
  an error (e.g. 429) or an unusable body, the result is computed from haversine
  with an estimated duration and flagged `approx: true`. The UI prefixes values
  with `~` and shows a note. Approximate results are never cached.

### OSRM servers and profiles (read this)

The public demo server `router.project-osrm.org` **ignores the profile in the URL
and always routes by car**: a "foot" request returns the same 7.1 km / 700 s as
"driving". So the defaults are:

| Profile   | Default base URL                                   | Env override       |
|-----------|----------------------------------------------------|--------------------|
| `driving` | `https://router.project-osrm.org`                  | `OSRM_URL_DRIVING` |
| `foot`    | `https://routing.openstreetmap.de/routed-foot`     | `OSRM_URL_FOOT`    |
| `bike`    | `https://routing.openstreetmap.de/routed-bike`     | `OSRM_URL_BIKE`    |

All three are free shared servers with no SLA or published quota: fine for a
family planning tool, not for heavy use. To avoid depending on them, point the
`OSRM_URL_*` variables at a self-hosted OSRM.

### Geocoding

Nominatim policy is honoured: max 1 request/s (calls are serialised), an
identifying `User-Agent`, and every distinct query is cached in `geocode_cache`.
Empty results are not cached.

## Database

Tables: `trip`, `place`, `route_cache`, `geocode_cache` (see `infra/init.sql`).
There is no migration system in the monorepo and `init.sql` only runs on a fresh
volume, so `backend/src/db/ensureSchema.ts` re-applies the same idempotent
statements on every startup. **Keep both files in sync** when changing the schema.
`pg` is configured to return `DATE` as `YYYY-MM-DD` strings and `NUMERIC` as numbers.

## Environment (backend)

`VIAJES_DB_HOST`, `VIAJES_DB_PORT`, `VIAJES_DB_NAME`, `VIAJES_DB_USER`,
`VIAJES_DB_PASSWORD`, `KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`, `PORT` (default 3030),
optional `OSRM_URL_DRIVING`, `OSRM_URL_FOOT`, `OSRM_URL_BIKE`, `OSRM_TIMEOUT_MS`.

## Local development

```bash
bash start-local.sh        # starts everything, including viajes (see the root script)
# or just this app:
cd viajes/infra && docker compose -f docker-compose.local.yml up -d
cd ../backend  && npm ci && VIAJES_DB_PASSWORD=viajes123 VIAJES_DB_PORT=5446 \
  KEYCLOAK_CERTS_URL=http://localhost:8080/realms/calendario/protocol/openid-connect/certs npm run dev
cd ../frontend && npm ci && npm run dev     # http://localhost:5192/viajes/
```

Run `bash scripts/keycloak-update-realm.sh` once so the new roles and the
`http://localhost:5192` redirect URI exist in your local Keycloak.

## Tests

```bash
cd viajes/backend  && npm ci && npm run build && npm test   # vitest
cd viajes/frontend && npm ci && npm run build && npm test   # vitest
```

Backend coverage: haversine, OSRM parsing / cache / fallback / timeout, itinerary
and day totals, nearest lodging, GPX and ICS generation, geocoder throttling and
cache, zod schemas, and role gating through the real JWT middleware (signed RS256
tokens, only JWKS and the DB mocked). Frontend: formatting and the drag/drop
reorder logic.

## First deploy (production)

1. Merge to `main`: `viajes-ci.yml` builds and pushes
   `ghcr.io/manuhddev/viajes-{backend,frontend}`, copies `viajes/infra/*` to
   `/home/manu/viajes` and runs `docker compose up`.
2. **Create `/home/manu/viajes/.env` by hand before the first run** (CI never writes
   it):
   ```
   VIAJES_DB_NAME=viajes
   VIAJES_DB_USER=viajes
   VIAJES_DB_PASSWORD=<generate one>
   KEYCLOAK_CERTS_URL=http://calendario-keycloak:8080/keycloak/realms/calendario/protocol/openid-connect/certs
   CORS_ORIGIN=https://elbunkerdelingeniero.duckdns.org
   # optional: OSRM_URL_DRIVING / OSRM_URL_FOOT / OSRM_URL_BIKE
   ```
3. Run `scripts/keycloak-update-realm.sh` against the live Keycloak to create
   `viajes_admin` / `viajes_invitado` (and add `viajes_admin` to `propietario`).
4. Make sure the live nginx has the `location /viajes/` block (it is in
   `nginx/calendario.conf`; the server copy may have diverged, so apply it in place
   and reload).
5. Containers must be on `calendario-net` (the compose file already is).
