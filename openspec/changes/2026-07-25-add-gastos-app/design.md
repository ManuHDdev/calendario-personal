## Context

The monorepo has four sibling subapps on the same stack — `panel/`, `storage/`, `mapacyd/`, `ytdl/` — each a Fastify + TypeScript backend and a React + Vite + TypeScript frontend, joined to the external `calendario-net` Docker network, gated by Keycloak JWT (realm `calendario`, hand-rolled `middleware/auth.ts` verification copied per-app — known, accepted debt). `mapacyd` is the closest precedent for `gastos`: it owns a real Postgres database, uses `pg` directly (no ORM), Zod validation, and soft delete (`activo` + `deleted_at`) on every table.

`gastos` follows this exact pattern, with two new elements the other subapps don't have: a Telegram bot as a second ingress path (besides the HTTP API), and an OCR/image-parsing pipeline. The production VPS already runs Postgres, Keycloak, five subapps' worth of Node processes, and microk8s in parallel — the OCR engine has to be cheap in steady-state memory and must not require a GPU or a second language runtime if avoidable.

## Goals / Non-Goals

**Goals:**
- Capture an expense with the least possible friction: a photo sent to Telegram becomes a draft row with a best-effort amount/date/merchant.
- Never let a misread OCR value silently become a "real" number in the totals — every OCR-derived expense starts as `pendiente_revision` and only counts toward reports once the owner confirms it (edited or as-is).
- Manual entry as a fully first-class path, not an afterthought — it must work exactly as well when the owner just wants to type a number in.
- Keep the new component footprint small enough for the current VPS: no GPU, no second Python/ML runtime if a native alternative is good enough.
- Restrict all access — API and bot — to the owner alone.

**Non-Goals:**
- No attempt at perfect, fully-automatic OCR accuracy. The review step exists precisely so the parser doesn't need to be perfect.
- No multi-user support, no shared/family expenses (out of scope — this is explicitly single-owner, unlike Calendario/Storage/MapaCYD which are shared with `familia`).
- No bank API integration (open banking, PSD2, etc.) — screenshots only, exactly as the owner described.
- No automatic recurring-expense detection or budgeting/alerts in this change — just capture + totals. Can be a follow-up.
- No custom-trained OCR/ML model — only off-the-shelf, pre-trained, open-source tooling.

## Decisions

### OCR engine: Tesseract (native binary), not PaddleOCR or a cloud API

Three real options were weighed:

1. **Tesseract OCR** (Apache 2.0, C++ engine, `tesseract-ocr` + `tesseract-ocr-data-spa` packages). Runs as a native binary invoked as a child process (`execFile`, argv array — same pattern `ytdl` already uses for `yt-dlp`), no separate language runtime, no GPU, ~modest CPU burst per image and no persistent extra process. Accuracy on clean, high-contrast text (a bank app screenshot) is good out of the box; accuracy on crumpled thermal-paper receipts is mediocre without pre-processing.
2. **PaddleOCR** (state-of-the-art open-source OCR, notably better accuracy on messy receipts, incl. lightweight PP-OCRv4 mobile models). Only has a first-class Python API, so it would require a second microservice (Python + FastAPI, its own Docker image) that the Node backend calls over HTTP inside `calendario-net`. Meaningfully better accuracy, but a second language runtime and a second container is a real resource and maintenance cost on an already-loaded VPS, for a personal-scale tool where a review step already absorbs the accuracy gap.
3. **Cloud OCR API** (Google Vision / AWS Textract / Azure) — excluded outright: the owner requires no paid external dependency.

**Decision: Tesseract**, because the `pendiente_revision` review step (see below) already covers Tesseract's weaker accuracy on paper receipts — the owner corrects a wrong total in a few seconds instead of the system silently guessing right or wrong. If real-world accuracy turns out to be too poor to be useful even as a draft, swapping the OCR call for a PaddleOCR microservice later is a contained change (the OCR step is isolated behind one function, `runOcr(imageBuffer): Promise<string>`) — not a reason to pay that cost now.

Image pre-processing before OCR (via `sharp`, already used by `storage`): grayscale, contrast normalization, and a binarization threshold — cheap operations that measurably help Tesseract on low-contrast thermal-paper photos.

### One shared OCR step, two parser profiles — not two separate pipelines, and no auto-detection

Both source types (paper receipt photo, bank-app screenshot) go through the *same* `runOcr` step — the difference is only in how the resulting raw text is interpreted. Rather than trying to auto-detect which profile applies (fragile — bank UIs vary a lot, false detection would silently produce a wrong draft), the Telegram bot asks the owner once, via an inline keyboard on the photo message ("🧾 Ticket" / "🏦 Banco"), which profile to use. This is one tap, matches the "as little friction as possible" goal, and removes a whole class of misclassification bugs.

- **Ticket profile**: look for a line containing `TOTAL`/`IMPORTE TOTAL`/`A PAGAR` (case-insensitive) followed by the nearest currency-formatted number on that line or the next one; date via a `dd/mm/yyyy` or `dd-mm-yyyy` regex, falling back to "today" if none found; merchant = first non-empty, non-numeric line of the receipt (typically the shop name/header).
- **Bank profile**: look for the largest currency-formatted number with a sign or a `€`/`EUR` suffix (bank apps show the amount prominently, usually as the single largest number on screen); date via the same regex, falling back to "today"; merchant/concept = the line immediately below or above the amount that isn't itself a number or a label like "Saldo"/"Disponible".

Both profiles are pure functions over the OCR'd text (`parseTicket(text): DraftGasto`, `parseBanco(text): DraftGasto`) — easy to unit test with recorded OCR output as fixtures, no need for real images in tests.

### Draft/review state, not silent auto-confirm

Every `gasto` has an `estado`: `pendiente_revision` (created by OCR, not yet in totals) or `confirmado` (counts toward monthly/category totals). Manual entries are created directly as `confirmado` — there's nothing to review when the owner typed the numbers themselves. The frontend has a "Pendientes" section listing `pendiente_revision` rows with the extracted values pre-filled and editable; confirming just flips `estado` (optionally after edits), discarding soft-deletes it like anything else.

### Telegram bot: long polling (Telegraf), not a webhook

For a single-user, low-volume bot, long polling is simpler and avoids adding a new public nginx route/webhook secret: the bot runs inside the `gastos-backend` process (or a lightweight sibling process in the same container) and calls Telegram's `getUpdates` API outward — no inbound exposure at all. `TELEGRAM_OWNER_CHAT_ID` is checked on every incoming message; anything from another `chat.id` is ignored (no reply, so the bot doesn't even confirm to a stranger that it's alive).

Bot flow:
1. Owner sends a photo (receipt or bank screenshot) to the bot.
2. Bot replies with an inline keyboard: "🧾 Ticket" / "🏦 Banco".
3. Owner taps one; the bot downloads the photo from Telegram, calls the `gastos` backend's internal OCR endpoint with the image bytes + chosen profile.
4. Backend runs OCR + the matching parser, stores a `pendiente_revision` row, returns the draft.
5. Bot replies with the extracted amount/date/merchant and a note that it's pending review in the app.

The bot-to-backend call is in-process or over `localhost`/the internal Docker network — not a second public API surface.

### Database: dedicated `gastos` Postgres database, same server as `mapacyd`

New database `gastos` on the existing shared Postgres 15 instance (own credentials, own connection), not a new Postgres container — mirrors how `mapacyd` already coexists with Calendario's database on infra, keeping the VPS's Postgres footprint to one running instance. Table `gasto`: `id`, `importe` (numeric), `fecha` (date), `comercio` (text), `concepto` (text, nullable), `categoria` (text, nullable), `origen` (`manual` | `ticket` | `banco`), `estado` (`pendiente_revision` | `confirmado`), `imagen_path` (text, nullable — path to the stored source photo), `activo` (boolean default true), `deleted_at` (timestamp, nullable), `created_at`, `updated_at`.

Source images are stored on a `gastos`-owned volume (not routed through `storage`'s API) to keep subapps independent, matching the existing pattern where no subapp calls another subapp's API.

### Categories: manual free-text field, no auto-classification

The owner asked for categories only as a "if possible" — a fixed enum would be premature (categories are personal and will drift), and a keyword-based auto-classifier is more complexity than a personal tool needs right now. `categoria` is a plain text field the owner fills in (manually, or when reviewing a draft), with the frontend suggesting the last N distinct values used as autocomplete. Can be hardened into a real taxonomy later if it becomes annoying.

## Risks / Trade-offs

[Risk: Tesseract misreads amounts on low-quality thermal-paper photos] → Mitigation: this is exactly what the `pendiente_revision` review step exists for; if it proves too unreliable in practice, swap `runOcr` for a PaddleOCR microservice later without touching the parsers or the rest of the app.

[Risk: the ticket/banco profile choice depends on the owner tapping the right button] → Mitigation: low cost if wrong — worst case is a garbled draft that gets corrected or discarded in review, same safety net as OCR mistakes in general.

[Risk: a second Postgres database adds operational surface (backups, migrations) beyond what any subapp except MapaCYD/Calendario has] → Mitigation: reuses the exact same Postgres instance and backup story as `mapacyd` — no new infrastructure component, only a new database + migration set.

[Risk: Telegram long polling means the bot process must stay alive inside `gastos-backend`] → Mitigation: same lifecycle as the Fastify server itself (started together, restarted together by Docker); if it ever needs independent scaling/restarts, splitting it into its own container is a small follow-up change.

[Risk: storing photographed receipts/screenshots may contain sensitive financial data] → Mitigation: `gastos` is Keycloak-gated to `admin` only (the owner), images live on a volume not exposed by any other subapp, and the Telegram bot only accepts input from the owner's hardcoded chat ID.
