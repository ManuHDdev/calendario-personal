# vine-resenas

Replaces the Amazon Vine review flow: per product (key `asin`) photos/video, feedback, stars
and a state, plus an API so Claude can read and write everything.

- Backend: Fastify 4 + TypeScript + PostgreSQL (`backend/`, port 3018)
- Frontend: built separately (image `ghcr.io/manuhddev/vine-resenas-frontend`)
- Routes: `/vine-resenas/api/...`, health at `/vine-resenas/api/health`
- Local: Postgres on `localhost:5447` (`infra/docker-compose.local.yml`), `npm run dev` in `backend/`

## State machine

`pendiente -> listo -> resena_generada -> publicado`

| Transition | How |
| --- | --- |
| `listo` | UI button / `POST /ui/products/:asin/listo` / `PUT /v1/products/:asin {estado:"listo"}`. Requires non-empty feedback and stars. |
| `resena_generada` | Only via `PUT /v1/products/:asin/resena` (also allowed again from `resena_generada` to rewrite). |
| `publicado` | `POST .../publicado` (UI or API). A published product can only be reopened to `resena_generada`. |

The autosaving `PUT /ui/products/:asin` edits `titulo/descripcion/feedback/estrellas` only and never changes `estado`.

## Media

Files live in `<DATA_DIR>/media/<ASIN>/<generated-name>` (`DATA_DIR=/data`, named volume `vine_resenas_data`).
Names are generated server-side (`<timestamp>-<rand>.<ext>`); client names are never used.
Photos: jpeg/png/webp/heic/heif, max 25 MB. Video: mp4/mov/webm, max 200 MB, **one per product**
(uploading another replaces the previous one). MIME and extension must agree.
nginx must allow the body size: `client_max_body_size 200M;` (plus overhead, use `250M`) on the `/vine-resenas/api/` location
and in the frontend image's nginx.

## Claude API (`/vine-resenas/api/v1`)

Static bearer token from `VINE_API_TOKEN` (compared in constant time; never logged).
Errors are always `{ "error": "...", "message": "..." }`.

```bash
export BASE=https://elbunkerdelingeniero.duckdns.org/vine-resenas/api/v1
export VINE_API_TOKEN="$(sudo cat /root/.vine-api-token)"   # example: read it from a root-only file

# List (optionally ?estado=pendiente|listo|resena_generada|publicado). Includes media[].url (absolute paths).
curl -fsS -H "Authorization: Bearer $VINE_API_TOKEN" "$BASE/products?estado=listo"

# One product
curl -fsS -H "Authorization: Bearer $VINE_API_TOKEN" "$BASE/products/B0FQBYHJ17"

# Download a media file (supports Range)
curl -fsS -H "Authorization: Bearer $VINE_API_TOKEN" -o foto.jpg "$BASE/media/B0FQBYHJ17/1731300000000-a1b2c3d4.jpg"

# Update fields and/or state
curl -fsS -X PUT -H "Authorization: Bearer $VINE_API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"feedback":"Funciona muy bien","estrellas":5,"estado":"listo"}' "$BASE/products/B0FQBYHJ17"

# Store the generated review (sets estado = resena_generada)
curl -fsS -X PUT -H "Authorization: Bearer $VINE_API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"resena_producto":"...","resena_resumida":"...","resena_extendida":"..."}' "$BASE/products/B0FQBYHJ17/resena"

# Mark as published
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

curl -fsS -H "$H" "$UI/products?filter=faltan_fotos&q=cable"   # filter: todos|faltan_fotos|falta_feedback|listos|resena_generada; estado=publicado shows published
curl -fsS -H "$H" "$UI/counts"                                  # { pendiente, listo, resena_generada, publicado, pendientes, total }
curl -fsS -H "$H" "$UI/products/B0FQBYHJ17"
curl -fsS -X PUT -H "$H" -H 'Content-Type: application/json' -d '{"feedback":"...","estrellas":4}' "$UI/products/B0FQBYHJ17"
curl -fsS -X POST -H "$H" -F files=@a.jpg -F files=@b.png -F files=@clip.mp4 "$UI/products/B0FQBYHJ17/media"
curl -fsS -X DELETE -H "$H" "$UI/products/B0FQBYHJ17/media/1731300000000-a1b2c3d4.jpg"
curl -fsS -H "$H" -o x.jpg "$UI/media/B0FQBYHJ17/1731300000000-a1b2c3d4.jpg"   # or ...?token=<jwt> for <img>/<video>
curl -fsS -X POST -H "$H" "$UI/products/B0FQBYHJ17/listo"
curl -fsS -X POST -H "$H" "$UI/products/B0FQBYHJ17/publicado"
```

The upload response is `{ uploaded: [...], replaced: [filenames], rejected: [{filename,error,message,status}] }`
(201 if at least one file was stored, otherwise the status of the first rejection).

## Sync with vine-bot

`POST /v1/products/sync` calls `${VINE_BOT_URL}/productos-pendientes` (default `http://vine-bot:8092`) with
`Authorization: Bearer ${VINE_BOT_TOKEN}` (falls back to `VINE_API_TOKEN`), expects a bare JSON array of
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

`PORT` (3018), `VINE_RESENAS_DB_HOST|PORT|NAME|USER|PASSWORD`, `KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`, `DATA_DIR` (`/data`),
`VINE_API_TOKEN` (required for the API), `VINE_BOT_URL`, `VINE_BOT_TOKEN`. See `backend/.env.example`.
The schema is created by `backend/src/db/ensureSchema.ts` on every start and by `infra/init.sql` on a fresh volume (keep them identical; a test checks it).
