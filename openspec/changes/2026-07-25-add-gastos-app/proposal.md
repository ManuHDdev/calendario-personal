## Why

The owner wants to track personal expenses with minimal friction: photograph a paper receipt or a bank-app screenshot, send it to a Telegram bot, and have it show up as a draft expense ready to confirm — plus the ability to add expenses by hand. No existing subapp covers this, and it does not fit inside Calendario, Panel, Storage, MapaCYD, or Ytdl's current scope.

## What Changes

- Add a new subapp `gastos`: a personal expense tracker, visible only to the owner (`admin` role, same gating as Panel).
- New Telegram bot (long polling via Telegraf, not a public webhook) that accepts a photo from the owner's Telegram account only (hardcoded `TELEGRAM_OWNER_CHAT_ID`), forwards it to the `gastos` backend, and replies with the extracted draft (amount/date/merchant) or an error.
- Backend (Fastify + TypeScript, Postgres via `pg`, Zod validation) runs OCR (Tesseract, native binary — no Python/ML runtime) on the incoming image, then applies a Spanish-language regex/heuristic parser to extract amount, date, and merchant/concept. The result is stored as a `gasto` row in `pendiente_revision` state — never auto-confirmed — so OCR mistakes never silently corrupt the totals.
- Frontend (React + Vite + TypeScript): expense list with filters (month/category), a "pending review" section to confirm/edit/discard OCR drafts, a manual add form, and monthly/category totals.
- Auth: Keycloak JWT like the other subapps, role `admin` only (the owner is the sole `admin` user, so this satisfies "visible only to me" without a new realm role).
- Docker: new `gastos-backend`/`gastos-frontend` images (backend Dockerfile also installs `tesseract-ocr` + the Spanish traineddata), joins the existing external `calendario-net` network; nginx route added to `calendario.conf`.

## Capabilities

### New Capabilities
- `gastos`: track personal expenses — manual entry, Telegram-photo capture (paper receipt or bank-app screenshot) with OCR draft extraction pending owner confirmation, monthly/category totals.

### Modified Capabilities
(none — this is additive; no existing subapp's behavior changes)

## Impact

- New directory `gastos/` (backend + frontend) at the monorepo root, alongside `panel/`, `storage/`, `mapacyd/`, `ytdl/`.
- New Postgres database/schema `gastos` (own tables, soft delete, own migrations) — first subapp after Calendario/MapaCYD to need a database; reuses the same Postgres server pattern as `mapacyd` (separate DB, own env vars), not a shared schema.
- `infra/docker-compose.yml` (+ `.prod.yml`): two new services on `calendario-net`, plus a Postgres volume for the `gastos` DB.
- `nginx/calendario.conf`: new location block for `gastos`.
- `panel/frontend/src/components/AppLauncher.tsx`, `storage/frontend/src/components/AppLauncher.tsx`, `calendario-frontend/.../app-launcher.ts`: add `gastos` entry with `roles: ['admin']`.
- `infra/keycloak/realm-export.json` / `realm-export.prod.json`: no new roles needed (reuses `admin`), but a new client/audience for `gastos`'s JWT verification must be added the same way Storage/Panel/MapaCYD/Ytdl are.
- New external dependency: a Telegram bot token, created manually by the owner via `@BotFather` (Claude cannot create Telegram accounts/bots) and supplied as `TELEGRAM_BOT_TOKEN`; the owner's numeric Telegram chat ID is also supplied as `TELEGRAM_OWNER_CHAT_ID` so the bot ignores every other sender.
- Runtime dependency: `tesseract-ocr` binary + Spanish language data (`tesseract-ocr-data-spa`) installed in the `gastos-backend` Docker image.
- No changes to Calendario, Panel, Storage, MapaCYD, or Ytdl code beyond the AppLauncher entry above.
