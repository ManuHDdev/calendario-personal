## Why

The owner is not satisfied with how `gastos` shows and filters money. The current page is a stack of unrelated sections (add form, OCR review, forecasts, month picker, confirmed table) that is hard to scan, not friendly for other family members, and only ever shows one calendar month. They also want to record income (salary or any extra earnings), not just expenses, and to stop retyping categories and merchants that they have already used.

## What Changes

- **Year-first view.** The default view is the whole current year: every movement with its date, grouped under highlighted month headers with per-month subtotals, plus a year stepper and a month strip to narrow down to a single month when wanted.
- **Income ("ganancias").** A movement is now either a `gasto` or a `ganancia` (new `tipo` column, default `gasto`, so every existing row stays an expense). Summary cards show income, expenses and balance for the selected period, and a segmented filter shows expenses, income, or both.
- **Autocomplete for category and merchant/source.** A custom dropdown suggests only a few matching, previously used values as the owner types (most-used first), while still allowing a brand-new value. Applies to the category and merchant fields in the form and to the category filter.
- **One add/edit flow.** A single "Añadir" button opens a form (expense/income toggle, amount, date, merchant or source, category, concept, "hasn't happened yet" switch for forecasts). The same form edits existing movements, which was impossible before.
- **Friendlier, more intuitive UI.** Plain Spanish copy, color-coded amounts (+ green income, − red expense), large touch targets, mobile-first layout, light and dark themes, clear empty states, and a confirmation before deleting.
- Forecasted items ("Gastos pendientes") and OCR drafts ("Pendientes de revisar") are kept but restyled to fit the new layout; forecasts can now also be expected income.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `gastos`: adds income as a movement type, year-level listing and totals, usage-ranked suggestion endpoints for categories and merchants, and a redesigned frontend.

## Impact

- `gastos/infra/init.sql` + `gastos/backend/src/db/ensureSchema.ts`: new `tipo` column with CHECK; the startup `ensureSchema` adds it idempotently to existing databases (no manual SQL step in `DEPLOY_NOTES.md`).
- `gastos/backend/`: `gasto.schema.ts`, `routes/gastos.ts`, `db/queries.ts` (list filters `anio`/`tipo`, totals by period and type, suggestion queries), new `GET /comercios`; tests for each.
- `gastos/frontend/`: page and components rewritten (period bar, summary cards, grouped movement list, add/edit modal, autocomplete input, restyled pending sections), pure helpers in `src/lib/` with vitest unit tests (vitest added as a dev dependency, following `finanzas/frontend`).
- `CLAUDE.md`: Gastos section updated (routes, `tipo`).
- Telegram bot and OCR pipeline: unchanged. Everything they create is a `gasto` through the column default.
- No new role, port, subapp, or AppLauncher change.
