## 1. Database (`gastos` Postgres DB)

- [x] 1.1 Create database `gastos` on the existing shared Postgres 15 instance, own credentials (mirrors `mapacyd`'s setup)
- [x] 1.2 Migration: table `gasto` (`id`, `importe` numeric, `fecha` date, `comercio` text, `concepto` text nullable, `categoria` text nullable, `origen` enum `manual|ticket|banco`, `estado` enum `pendiente_revision|confirmado`, `imagen_path` text nullable, `activo` boolean default true, `deleted_at` timestamp nullable, `created_at`, `updated_at`)
- [x] 1.3 Index on `(fecha)` and `(estado)` for listing/filtering/totals queries

## 2. Backend scaffold (`gastos/backend/`)

- [x] 2.1 Scaffold `gastos/backend/` as Fastify + TypeScript, copying `mapacyd/backend`'s `package.json`/`tsconfig.json`/project layout as the starting point (closest precedent: real Postgres DB, `pg` direct, Zod)
- [x] 2.2 Copy `mapacyd/backend/src/middleware/auth.ts` verbatim into `gastos/backend/src/middleware/auth.ts` (same accepted duplication as panel/storage/ytdl)
- [x] 2.3 `authMiddleware` + `hasAnyRole(user, ['admin'])` guard applied to every route; any other role gets HTTP 403
- [x] 2.4 `GET /gastos/api/health` endpoint
- [x] 2.5 Env vars: `GASTOS_DB_HOST`, `GASTOS_DB_NAME`, `GASTOS_DB_USER`, `GASTOS_DB_PASSWORD`, `KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`, `PORT` (default 3005), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_CHAT_ID`, `GASTOS_IMAGES_PATH`

## 3. Expense CRUD API

- [x] 3.1 `POST /gastos/api/gastos` — manual creation, Zod-validated body (`importe`, `fecha`, `comercio`, `concepto?`, `categoria?`), created directly with `estado='confirmado'`, `origen='manual'`
- [x] 3.2 `GET /gastos/api/gastos` — list with query filters (`mes`, `categoria`, `estado`), filtered by `activo=true`
- [x] 3.3 `PATCH /gastos/api/gastos/:id` — edit fields and/or flip `estado` to `confirmado` (used by the review flow)
- [x] 3.4 `DELETE /gastos/api/gastos/:id` — soft delete (`activo=false`, `deleted_at=now()`)
- [x] 3.5 `GET /gastos/api/totales?mes=YYYY-MM` — sum of `confirmado` expenses for the month, grouped by `categoria`
- [x] 3.6 `GET /gastos/api/categorias` — distinct `categoria` values used so far (for frontend autocomplete)
- [x] 3.7 Unit tests: Zod validation rejects malformed bodies; role guard rejects non-admin; soft delete excludes rows from `GET /gastos`; totals only sum `confirmado` rows

## 4. OCR + parsing pipeline

- [x] 4.1 `gastos/backend/Dockerfile`: install `tesseract-ocr` + `tesseract-ocr-data-spa` (apt/apk package, native binary — no Python runtime)
- [x] 4.2 `runOcr(imageBuffer): Promise<string>` — pre-process with `sharp` (grayscale, contrast, threshold), write to a temp file, invoke `tesseract` via `execFile` (argv array, never a shell string), return raw text
- [x] 4.3 `parseTicket(text): DraftGasto` — regex/heuristics: `TOTAL`/`IMPORTE TOTAL`/`A PAGAR` line → nearest currency number; `dd/mm/yyyy`/`dd-mm-yyyy` date regex (fallback: today); merchant = first non-empty non-numeric line
- [x] 4.4 `parseBanco(text): DraftGasto` — regex/heuristics: largest currency-formatted number with `€`/`EUR`/sign → amount; same date regex; concept = nearest non-numeric, non-label line to the amount
- [x] 4.5 `POST /gastos/api/gastos/ocr` (internal, still behind `admin` auth) — accepts image bytes + `perfil: 'ticket'|'banco'`, runs `runOcr` + the matching parser, stores the source image on `GASTOS_IMAGES_PATH`, creates a `gasto` row with `estado='pendiente_revision'`, `origen` set from `perfil`, returns the draft
- [x] 4.6 Unit tests for `parseTicket`/`parseBanco` against recorded OCR-text fixtures (no real images needed) — correct amount/date/merchant extraction, and graceful fallback (today's date, empty merchant) when a field isn't found

## 5. Telegram bot

- [x] 5.1 `gastos/backend/src/telegram/bot.ts` using Telegraf, long polling, started alongside the Fastify server in the same process
- [x] 5.2 Ignore (no reply) any incoming message where `message.chat.id !== TELEGRAM_OWNER_CHAT_ID`
- [x] 5.3 On a photo message: reply with an inline keyboard ("🧾 Ticket" / "🏦 Banco")
- [x] 5.4 On button tap: download the photo via the Telegram Bot API, call the internal OCR pipeline (in-process call, not a second HTTP hop) with the chosen `perfil`
- [x] 5.5 Reply with the extracted amount/date/merchant and a note that it's pending review in the app; on OCR/parse failure, reply with a clear error instead of a silent draft
- [x] 5.6 Manual doc step (not code): README note for the owner on creating the bot via `@BotFather` and setting `TELEGRAM_BOT_TOKEN`/`TELEGRAM_OWNER_CHAT_ID`
- [x] 5.7 Unit tests: owner-chat-id gate rejects other senders; profile selection maps to the correct parser

## 6. Frontend (`gastos/frontend/`)

- [x] 6.1 Scaffold `gastos/frontend/` as React + Vite + TypeScript, mirroring `mapacyd/frontend`'s project setup (Keycloak login flow, API client pattern)
- [x] 6.2 Expense list view: table/cards, filters by month and category
- [x] 6.3 "Pendientes de revisar" section: `pendiente_revision` rows with editable amount/date/merchant/category fields, "Confirmar" (PATCH → `confirmado`) and "Descartar" (soft delete) actions
- [x] 6.4 Manual add form (amount, date, merchant, concept, category with autocomplete from `GET /gastos/api/categorias`)
- [x] 6.5 Monthly/category totals view (`GET /gastos/api/totales`)
- [x] 6.6 `gastos/frontend/Dockerfile` mirroring `mapacyd/frontend`'s

## 7. Infra wiring

- [x] 7.1 `gastos/infra/docker-compose.prod.yml`: `gastos-backend` + `gastos-frontend` services on the external `calendario-net` network, mirroring `mapacyd/infra/docker-compose.prod.yml` (image names `ghcr.io/manuhddev/gastos-backend:latest` / `gastos-frontend:latest`, healthcheck against `/gastos/api/health`), plus a volume for `GASTOS_IMAGES_PATH`
- [x] 7.2 `nginx/calendario.conf`: new location block for `gastos`
- [x] 7.3 `start-local.sh`/`start-local.ps1`: add `gastos-backend` (port 3005) and `gastos-frontend` (port 5177) to the local dev stack
- [x] 7.4 CI: GitHub Actions workflow for `gastos` mirroring the existing subapps' (build + push `ghcr.io` images)
- [x] 7.5 `panel/frontend/src/components/AppLauncher.tsx`, `storage/frontend/src/components/AppLauncher.tsx`, `calendario-frontend/.../app-launcher.ts`: add `gastos` entry (`roles: ['admin']`, color, icon, URL mapping for local + prod)
- [x] 7.6 Update `CLAUDE.md`'s subapp table (ports table, roles table) with the new `gastos` entry, and add a `## Gastos` section documenting stack/roles/routes/env vars following the existing per-subapp format

## 8. Verification

- [x] 8.1 `npm run build` (backend) and `npm run build` (frontend) both compile without errors
- [x] 8.2 Backend unit tests green (CRUD validation, role guard, soft delete, `parseTicket`/`parseBanco` fixtures, Telegram owner-id gate)
- [ ] 8.3 Manual end-to-end against the real local stack: log in as `admin`, add a manual expense, confirm it appears in totals; send a real ticket photo via Telegram, confirm a `pendiente_revision` draft appears and can be edited/confirmed; repeat with a bank-app screenshot; confirm a non-owner Telegram account gets no response from the bot
- [ ] 8.4 Confirm `familia`/`invitado` accounts cannot see `gastos` in the AppLauncher and get HTTP 403 if they hit the API directly
