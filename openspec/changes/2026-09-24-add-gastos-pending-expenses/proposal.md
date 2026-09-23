## Why

The owner wants to log an expense they already know is coming — a known amount, on a known future date, or with no date at all yet — and see it sitting in a dedicated place until that moment arrives, plus a running total of everything still pending. Today `gastos` only has two states: `pendiente_revision` (an OCR draft awaiting review) and `confirmado` (a real, already-happened expense counted in totals). Neither fits a forecasted expense: `pendiente_revision` is OCR-only and implies "review what the bot read," not "this hasn't happened yet."

## What Changes

- Add a third `estado` value, `previsto`, to the `gasto` table/enum: a manually-entered expense with a known amount that hasn't happened yet. `fecha` becomes optional for this state only — the owner may not know exactly when it'll land.
- `POST /gastos/api/gastos` gains an optional `estado` field (`confirmado` | `previsto`, defaults to `confirmado` — existing callers and behavior unchanged) and `fecha` becomes conditionally required: mandatory unless `estado='previsto'`.
- New frontend section "Gastos pendientes", separate from the existing "Pendientes de revisar" (OCR review) section, listing all `previsto` expenses sorted by soonest known date first (undated ones last), with a total sum of everything listed. Each row is editable inline and can be confirmed (moves to `confirmado`, requires a real date first) or discarded (soft delete), mirroring the existing "Pendientes de revisar" interaction pattern.
- No notification/reminder mechanism — this is a passive list the owner checks in the app, not a Telegram alert. No scheduler/planificador added to the backend.

## Capabilities

### New Capabilities
(none — this extends the existing `gastos` capability)

### Modified Capabilities
- `gastos`: adds a third expense state (`previsto`) for forecasted/known-future expenses with an optional date, a dedicated review/confirm UI section, and a running total — on top of the existing manual/OCR capture and `pendiente_revision`/`confirmado` states.

## Impact

- `gastos/infra/init.sql`: `estado` CHECK constraint gains `previsto`; `fecha` column drops `NOT NULL`. Existing rows unaffected (all currently have `estado` in the original two values and a non-null `fecha`).
- `gastos/backend/src/schemas/gasto.schema.ts`: `estadoEnum` extended; `createGastoSchema` gains optional `estado` and conditionally-required `fecha`.
- `gastos/backend/src/routes/gastos.ts`: `POST /gastos` no longer hardcodes `estado='confirmado'` in the INSERT.
- `gastos/backend/src/db/queries.ts`: `buildListQuery` orders `previsto` results soonest-first instead of the existing newest-first ordering used for confirmed history.
- `gastos/frontend/`: new `PendingExpenses.tsx` component + a small inline creation form, wired into `GastosPage.tsx`; `types/index.ts` gains `'previsto'` to the `Estado` union.
- `DEPLOY_NOTES.md`: manual `ALTER TABLE` step for the existing production `gastos` database (same pattern as the earlier `ofertas` migration note) — the production DB already exists, so `init.sql` changes alone don't reach it.
- No new subapp, no new role, no new port, no Telegram bot changes, no new backend process/scheduler.
