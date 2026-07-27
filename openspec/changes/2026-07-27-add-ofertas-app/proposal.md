## Why

The owner runs `marketplace-watcher`, a standalone Python scraper (outside this monorepo, `D:\Proyectos propios\FullStack\marketplace-watcher\`, deployed via a systemd timer on the VPS) that watches Wallapop/Milanuncios/Vinted for saved searches and notifies him of cheap matches. Today the only way to add, edit, or remove a saved search is hand-editing a `config.yaml` file on the server. He wants to manage those searches from a web UI, as another section inside the app-launcher parent app (`elbunkerdelingeniero`), alongside Panel/Storage/Gastos.

## What Changes

- Add a new subapp `ofertas`: a CRUD UI for `marketplace-watcher`'s saved searches (keyword, min/max price, location, which sites to search), visible only to the owner (`admin` role, same gating as Panel/Gastos).
- Backend (Fastify + TypeScript, Postgres via `pg`, Zod validation, soft delete) — mirrors `mapacyd`'s pattern (the closest precedent: a real owned database, no ORM).
- New endpoint type not present in any sibling subapp: `GET /ofertas/api/searches/active`, a **read-only, bearer-token-gated** endpoint (not Keycloak/JWT) meant to be called by the external `marketplace-watcher` scraper before each run, the same way `vine-bot` already exposes bearer-protected endpoints to an external automated caller on this same VPS. This is the human/machine split: the browser UI uses Keycloak like every other subapp; the headless scraper cannot do an interactive login, so it gets a single static token instead.
- Frontend (React + Vite + TypeScript): list of saved searches, create/edit form, delete (soft) — mirrors `mapacyd/frontend`'s structure.
- Docker: new `ofertas-backend`/`ofertas-frontend` images, own Postgres database `ofertas`, joins the existing external `calendario-net` network; nginx route added to `calendario.conf`.
- **Explicitly out of scope for this change**: modifying `marketplace-watcher`'s own Python code to actually call the new endpoint instead of reading `searches:` from its local `config.yaml`. That scraper lives in a separate repo/deployment (same situation as Rummikub Assistant, per this monorepo's own `CLAUDE.md` precedent) with its own release process. This change only builds and exposes the contract; wiring the scraper to consume it is a small, separate follow-up once the contract is stable and deployed.

## Capabilities

### New Capabilities
- `ofertas`: manage `marketplace-watcher`'s saved searches from a web UI — create/list/edit/soft-delete, plus a bearer-token-protected read endpoint for the external scraper to fetch the currently active list before each run.

### Modified Capabilities
(none — this is additive; no existing subapp's behavior changes)

## Impact

- New directory `ofertas/` (backend + frontend) at the monorepo root, alongside `panel/`, `storage/`, `mapacyd/`, `ytdl/`, `gastos/`.
- New Postgres database `ofertas` on the existing shared Postgres 15 instance (own credentials), mirroring how `mapacyd`/`gastos` each own their database on the same server — no new Postgres container.
- `infra/docker-compose.yml` (+ `.prod.yml`): two new services on `calendario-net`.
- `nginx/calendario.conf`: new location block for `ofertas`.
- `panel/frontend/src/components/AppLauncher.tsx`, `storage/frontend/src/components/AppLauncher.tsx`, `calendario-frontend/.../app-launcher.ts`: add `ofertas` entry with `roles: ['admin']`.
- `infra/keycloak/realm-export.json` / `realm-export.prod.json`: no new realm role needed (reuses `admin`), but a new client/audience for `ofertas`'s JWT verification must be added the same way Storage/Panel/MapaCYD/Ytdl/Gastos already are.
- New secret: a static bearer token (e.g. `SCRAPER_API_KEY`) generated for the `ofertas` backend and, in a later follow-up change, copied into `marketplace-watcher`'s own local config on the VPS — not a Keycloak client, not stored in this repo.
- Next free port pair per `CLAUDE.md`'s port table: frontend `:5178`, backend `:3006`. (Note: an unmerged branch `feature/add-rummikub-subapp` also happens to use `:5178`/`:8000` off-convention for an unrelated, not-yet-integrated subapp — resolve the collision if/when that branch is ever merged; it does not affect this change today since it isn't on `main`.)
- No changes to Calendario, Panel, Storage, MapaCYD, Ytdl, or Gastos code beyond the AppLauncher entry above.
- No changes to `marketplace-watcher`'s deployed code/config on the VPS (see "explicitly out of scope" above) — it keeps working exactly as it does today (reading `config.yaml`) until the separate follow-up change wires it to this new endpoint.
