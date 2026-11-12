# vine-resenas

Replaces the Amazon Vine review flow: per product (key `asin`) photos/video, feedback, stars
and a state, plus an API so Claude can read and write everything.

- Backend: Fastify 4 + TypeScript + PostgreSQL (`backend/`, port 3018)
- Frontend: built separately (image `ghcr.io/manuhddev/vine-resenas-frontend`)
- Routes: `/vine-resenas/api/...`, health at `/vine-resenas/api/health`
- Local: Postgres on `localhost:5447` (`infra/docker-compose.local.yml`), `npm run dev` in `backend/` (API on 3018) and in `frontend/` (Vite dev server on 5193)

## State machine

`pendiente -> listo -> resena_generada -> publicado`, plus the stand-by state `en_espera` (see below)

| Transition | How |
| --- | --- |
| `listo` | UI button / `POST /ui/products/:asin/listo` / `PUT /v1/products/:asin {estado:"listo"}`. Requires non-empty feedback and stars. |
| `resena_generada` | Only via `PUT /v1/products/:asin/resena` (also allowed again from `resena_generada` to rewrite). `PUT /v1/products/:asin {estado:"resena_generada"}` is rejected with 409, except to reopen a `publicado` product. |
| `publicado` | `POST .../publicado` (UI or API), and only from `resena_generada` (409 otherwise). `PUT /v1/products/:asin {estado:"publicado"}` is rejected with 409. A published product can only be reopened to `resena_generada`. |
| `en_espera` | Stand-by for products that already have feedback/media/stars but are not ready: UI button "Poner en espera" / `POST /ui/products/:asin/espera` / `PUT /v1/products/:asin {estado:"en_espera"}`. Allowed only from `pendiente` and `listo`. Nothing is cleared. Leaving: UI "Sacar de espera" / `POST /ui/products/:asin/reanudar` goes to `listo` when feedback and stars are present, else `pendiente`; via `PUT` it may go to `pendiente` or `listo` (listo keeps the usual 409 `ProductIncomplete` rule). Excluded from every other list view; the Monday sync never touches it (sync only inserts unknown ASINs). |

`PUT /v1/products/:asin` can set `estado` only among `pendiente`, `listo` and `en_espera`.

The autosaving `PUT /ui/products/:asin` edits `titulo/descripcion/feedback/estrellas` only and never changes `estado`.

## Media

Files live in `<DATA_DIR>/media/<ASIN>/<generated-name>` (`DATA_DIR=/data`, named volume `vine_resenas_data`).
Names are generated server-side (`<timestamp>-<rand>.<ext>`); client names are never used.
Photos: jpeg/png/webp/heic/heif, max 25 MB. Video: mp4/mov/webm, max 1 GB, **one per product**
(uploading another replaces the previous one). MIME and extension must agree.
nginx must allow the body size (1 GB video plus multipart overhead, so `1100m`): in `nginx/calendario.conf` the limit is on
`location /vine-resenas/` (it also covers `/vine-resenas/api/`), and in the frontend image's `nginx.conf` it is set at server level.
Both nginx configs keep `access_log off` for the API because media URLs carry the JWT in `?token=`.

## Claude API (`/vine-resenas/api/v1`)

Static bearer token from `VINE_API_TOKEN` (compared in constant time; never logged).
Errors are always `{ "error": "...", "message": "..." }`.

```bash
export BASE=https://elbunkerdelingeniero.duckdns.org/vine-resenas/api/v1
export VINE_API_TOKEN="$(sudo cat /root/.vine-api-token)"   # example: read it from a root-only file

# List (optionally ?estado=pendiente|listo|en_espera|resena_generada|publicado). Includes media[].url (absolute paths).
curl -fsS -H "Authorization: Bearer $VINE_API_TOKEN" "$BASE/products?estado=listo"

# One product
curl -fsS -H "Authorization: Bearer $VINE_API_TOKEN" "$BASE/products/B0FQBYHJ17"

# Download a media file (supports Range)
curl -fsS -H "Authorization: Bearer $VINE_API_TOKEN" -o foto.jpg "$BASE/media/B0FQBYHJ17/1731300000000-a1b2c3d4.jpg"

# Update fields and/or state (estado here: only pendiente / listo / en_espera)
curl -fsS -X PUT -H "Authorization: Bearer $VINE_API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"feedback":"Funciona muy bien","estrellas":5,"estado":"listo"}' "$BASE/products/B0FQBYHJ17"

# Store the generated review (sets estado = resena_generada)
curl -fsS -X PUT -H "Authorization: Bearer $VINE_API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"resena_producto":"...","resena_resumida":"...","resena_extendida":"..."}' "$BASE/products/B0FQBYHJ17/resena"

# Mark as published (only from resena_generada, otherwise 409)
curl -fsS -X POST -H "Authorization: Bearer $VINE_API_TOKEN" "$BASE/products/B0FQBYHJ17/publicado"

# Sync new pending products from vine-bot -> { "created": ["B0..."], "skipped": 3 }
curl -fsS -X POST -H "Authorization: Bearer $VINE_API_TOKEN" "$BASE/products/sync"
```

## UI API (`/vine-resenas/api/ui`, Keycloak JWT)

Read: `admin`, `vine_admin`, `vine_invitado`. Write: `admin`, `vine_admin`.
(The roles `vine_admin` / `vine_invitado` must exist in the Keycloak realm; see `infra/keycloak`.)

```bash
export UI=https://elbunkerdelingeniero.duckdns.org/vine-resenas/api/ui
H="Authorization: Bearer $KEYCLOAK_ACCESS_TOKEN"

curl -fsS -H "$H" "$UI/products?filter=faltan_fotos&q=cable"   # filter: todos|faltan_fotos|falta_feedback|listos|resena_generada|en_espera; estado=publicado shows published
curl -fsS -H "$H" "$UI/counts"                                  # { pendiente, listo, en_espera, resena_generada, publicado, pendientes, total }
curl -fsS -H "$H" "$UI/products/B0FQBYHJ17"
curl -fsS -X PUT -H "$H" -H 'Content-Type: application/json' -d '{"feedback":"...","estrellas":4}' "$UI/products/B0FQBYHJ17"
curl -fsS -X POST -H "$H" -F files=@a.jpg -F files=@b.png -F files=@clip.mp4 "$UI/products/B0FQBYHJ17/media"
curl -fsS -X DELETE -H "$H" "$UI/products/B0FQBYHJ17/media/1731300000000-a1b2c3d4.jpg"
curl -fsS -H "$H" -o x.jpg "$UI/media/B0FQBYHJ17/1731300000000-a1b2c3d4.jpg"   # or ...?token=<jwt> for <img>/<video>
curl -fsS -X POST -H "$H" "$UI/products/B0FQBYHJ17/listo"
curl -fsS -X POST -H "$H" "$UI/products/B0FQBYHJ17/publicado"
curl -fsS -X POST -H "$H" "$UI/products/B0FQBYHJ17/espera"      # stand-by (from pendiente/listo)
curl -fsS -X POST -H "$H" "$UI/products/B0FQBYHJ17/reanudar"    # out of stand-by -> listo if ready, else pendiente
```

The upload response is `{ uploaded: [...], replaced: [filenames], rejected: [{filename,error,message,status}] }`
(201 if at least one file was stored, otherwise the status of the first rejection).

## Guest links (family feedback without an account)

The owner can hand a relative a link, one per product (ASIN). The relative opens a mobile page, writes an
opinion and uploads photos/video for that product only, with no Keycloak account.

Owner endpoints (`/vine-resenas/api/ui`, write roles `admin`/`vine_admin`; `vine_invitado` gets 403):

```bash
curl -fsS -X POST -H "$H" -H 'Content-Type: application/json' -d '{"expiresInDays":14}' "$UI/products/B0FQBYHJ17/guest-links"
#  -> 201 { id, url: "/vine-resenas/c/<token>", token, expiresAt }   (default 14 days, 1..60; token shown ONCE)
curl -fsS -H "$H" "$UI/products/B0FQBYHJ17/guest-links"      # [{ id, createdAt, expiresAt, revokedAt, lastUsedAt, status: active|expired|revoked }]
curl -fsS -X DELETE -H "$H" "$UI/guest-links/12"             # revoke (204, idempotent)
```

Public endpoints (no auth, `/vine-resenas/api/guest/:token`; the SPA page is `/vine-resenas/c/:token`):

| Method | Path | What |
|---|---|---|
| GET | `/:token` | `{ titulo, thumbnail_url, feedback, media[], limits, expiresAt }` |
| PUT | `/:token/feedback` | `{ feedback }` (max 5000 chars) -> stored in `guest_feedback` |
| POST | `/:token/media` | multipart `files`, same MIME/size/name validation and per-ASIN video lock as the owner upload |
| GET | `/:token/media/:filename` | only this link's uploads and the product's cover photo |
| DELETE | `/:token/media/:filename` | only files uploaded through this same link |

Security model:

- The token is 32 random bytes (base64url, 43 chars). Only its SHA-256 hex is stored (`vine_guest_links.token_hash`);
  the raw token is returned once at creation and never stored or logged. Request logs show `/guest/[redacted]`
  and no query string; nginx has `access_log off` for `/vine-resenas/` (and `/vine-resenas/c/` in the frontend image).
- Unknown, malformed, expired and revoked tokens all give the same `404 NotFound`. A valid link whose product is
  already `publicado` gives `410 LinkClosed`; creating a link for a published product is a 409.
- A guest never sees stars, state, reviews, the owner's feedback, other products, or any owner media except the
  cover photo (the first owner photo). Guest text goes to `vine_products.guest_feedback`, a separate column: it never
  overwrites `feedback`. The owner UI shows it read-only with an "Añadir a mi feedback" button; `GET /v1/products` includes
  `guest_feedback`. Media rows carry `uploaded_via_guest_link_id` (exposed as `uploaded_by_guest` to the owner).
- A guest cannot replace or delete the owner's video or photos: an upload of a video while one exists that this link did not
  upload is a 409 `VideoExists`.
- Limits: 30 files per link in total (409 `UploadLimitReached`); 120 requests/min per IP on `/guest/*` and 20 invalid-token
  lookups per 10 min per IP (then 429). In-memory limiter, single instance. The IP is `request.ip` (`trustProxy: true`), so it is best-effort
  behind two nginx hops; the token entropy is what protects the links.
- Revoking a link cuts access immediately; its uploaded files stay on the product and remain visible to the owner.

## Sync with vine-bot

`POST /v1/products/sync` calls `${VINE_BOT_URL}/productos-pendientes` (default `http://vine-bot:8092`) with
`Authorization: Bearer ${VINE_BOT_TOKEN}` (required: without it the endpoint answers `503 {"error":"ServiceUnavailable","message":"VINE_BOT_TOKEN not configured"}`; there is no fallback to `VINE_API_TOKEN`), expects a bare JSON array of
`{asin,titulo,descripcion}` and inserts **only** ASINs that are not present (existing products are never touched).

Weekly cron on the host (token read from a root-only file, never inline):

```cron
0 9 * * 1 curl -fsS -X POST -H "Authorization: Bearer $(cat /root/.vine-api-token)" https://elbunkerdelingeniero.duckdns.org/vine-resenas/api/v1/products/sync >> /var/log/vine-sync.log 2>&1
```

```bash
install -m 600 /dev/null /root/.vine-api-token && echo -n "<token>" > /root/.vine-api-token
```

## Legacy import

Idempotent (re-runs never duplicate media, never overwrite non-empty feedback/stars). Run inside the backend
container (or locally after `npm run build`) with the files reachable from there:

```bash
npm run build
npm run import:legacy -- --txt productos_vine_pendientes.txt \
  --reviews resenas_listas_para_publicar.txt \
  --images imagenes_resenas \
  --bot-uploads /path/to/vine-bot/uploads \
  --dry-run          # drop it to apply
```

- `--txt`: blocks starting with `Título:`; `ASIN:`, `Descripción:`, `Feedback:` (multi-line until the next key), `Estrellas:`.
  Blocks without ASIN are skipped with a warning. A `[RESEÑA GENERADA]` marker sets `resena_generada`.
- `--reviews`: blocks separated by `---` with `Producto:`, `ASIN:`, `Reseña resumida:`, `Reseña extendida:`
  (optional `Reseña del producto:`). Applied only to known, non-published products with no review yet.
  TODO: the legacy files have no `resena_producto` text, so that field stays empty after importing.
- `--images`: folders `<ASIN> - <name>`; media is stored as `imp-<sha256-prefix>.<ext>` (that is what makes reruns idempotent).
  Folders ending in `- PUBLICADO` create/mark the product as `publicado` and their photos are skipped. A second video for a product is skipped.
- `--bot-uploads`: layout `<dir>/<ASIN>/<files>`, only for products that already exist.

## Backups

State is in two places: the Postgres volume `vine_resenas_pgdata` and the media volume `vine_resenas_data`. Back up both:

```bash
docker exec vine-resenas-db pg_dump -U "$VINE_RESENAS_DB_USER" "$VINE_RESENAS_DB_NAME" | gzip > vine-resenas-db-$(date +%F).sql.gz
docker run --rm -v vine_resenas_data:/data:ro -v "$PWD":/backup alpine tar czf /backup/vine-resenas-media-$(date +%F).tgz -C /data .
```

## Environment

`PORT` (3018), `VINE_RESENAS_DB_HOST|PORT|NAME|USER|PASSWORD` (`VINE_RESENAS_DB_PORT` is used for local dev, 5447), `KEYCLOAK_CERTS_URL`, `CORS_ORIGIN` (default `https://elbunkerdelingeniero.duckdns.org` and `http://localhost:5193`), `DATA_DIR` (`/data`),
`VINE_API_TOKEN` (required for the API), `VINE_BOT_URL`, `VINE_BOT_TOKEN` (required for sync). See `backend/.env.example`.
The schema is created by `backend/src/db/ensureSchema.ts` on every start and by `infra/init.sql` on a fresh volume (keep them identical; a test checks it).
Databases created before `en_espera` still carry the old `CHECK (estado IN (...))`; since `CREATE TABLE IF NOT EXISTS` never alters an existing table, `ensureSchema` also runs `ESTADO_CONSTRAINT_SQL` on every start: one atomic `DO` block that does nothing when the `estado` CHECK already lists `en_espera`, and otherwise drops the old `estado` CHECK and recreates `vine_products_estado_check` with the superset of values (existing rows stay valid, no data moves). Not needed in `init.sql` (a fresh table already has the new CHECK).
