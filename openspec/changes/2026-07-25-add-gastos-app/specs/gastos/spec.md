## ADDED Requirements

### Requirement: Role-based access
Only the `admin` role SHALL have access to the `gastos` API and its AppLauncher entry. `familia` and `invitado` SHALL have no access.

#### Scenario: Non-admin denied via API
- **WHEN** a user without the `admin` role calls any `/gastos/api/*` route (except `/health`)
- **THEN** the backend responds with HTTP 403

#### Scenario: Non-admin does not see the app
- **WHEN** a `familia` or `invitado` user opens the AppLauncher
- **THEN** the `gastos` entry is not listed

### Requirement: Manual expense creation
The owner SHALL be able to create an expense manually with amount, date, merchant, and optional concept/category. Manual expenses SHALL be created directly in `confirmado` state.

#### Scenario: Manual entry counts immediately
- **WHEN** the owner submits a manual expense via `POST /gastos/api/gastos`
- **THEN** the expense is stored with `origen='manual'`, `estado='confirmado'`, and is included in the current month's totals

### Requirement: OCR-derived expenses require review before counting
Any expense created from a Telegram photo (ticket or bank screenshot) SHALL be stored with `estado='pendiente_revision'` and SHALL NOT be included in totals until the owner confirms it.

#### Scenario: Draft excluded from totals
- **WHEN** an OCR draft is created with `estado='pendiente_revision'`
- **THEN** `GET /gastos/api/totales` does not include its amount

#### Scenario: Confirming includes it
- **WHEN** the owner calls `PATCH /gastos/api/gastos/:id` to set `estado='confirmado'`
- **THEN** the expense is included in subsequent totals

### Requirement: Receipt OCR extraction (ticket profile)
Given an image and `perfil='ticket'`, the backend SHALL run OCR and extract a best-effort amount (from a `TOTAL`/`IMPORTE TOTAL`/`A PAGAR` line), date (`dd/mm/yyyy` or `dd-mm-yyyy` pattern, defaulting to today if absent), and merchant (first non-empty, non-numeric line).

#### Scenario: Amount and date found
- **WHEN** OCR text contains a line `TOTAL 23,50€` and a date in `dd/mm/yyyy` format elsewhere in the text
- **THEN** the resulting draft has `importe=23.50` and `fecha` matching the found date

#### Scenario: No date found
- **WHEN** OCR text contains no recognizable date pattern
- **THEN** the resulting draft's `fecha` defaults to the current date

### Requirement: Bank screenshot OCR extraction (banco profile)
Given an image and `perfil='banco'`, the backend SHALL run OCR and extract the amount as the largest currency-formatted number in the text, with date and concept extracted the same way as the ticket profile.

#### Scenario: Amount extracted from screenshot
- **WHEN** OCR text contains `-45,00 €` as the most prominent currency-formatted value
- **THEN** the resulting draft has `importe=45.00`

### Requirement: Telegram bot restricted to the owner
The Telegram bot SHALL only process messages from the chat ID configured in `TELEGRAM_OWNER_CHAT_ID`. Messages from any other chat SHALL be ignored with no reply.

#### Scenario: Owner message processed
- **WHEN** a photo is received from `chat.id === TELEGRAM_OWNER_CHAT_ID`
- **THEN** the bot replies with a profile-selection keyboard

#### Scenario: Non-owner message ignored
- **WHEN** a message is received from any other `chat.id`
- **THEN** the bot sends no reply and creates no expense

### Requirement: Soft delete
Deleting an expense SHALL set `activo=false` and `deleted_at=now()`; it SHALL NOT remove the row. Listings and totals SHALL always filter by `activo=true`.

#### Scenario: Deleted expense excluded from listing
- **WHEN** an expense is deleted via `DELETE /gastos/api/gastos/:id`
- **THEN** it no longer appears in `GET /gastos/api/gastos` or in totals, but the row still exists in the database
