## Context

`gastos` stores one table, `gasto`, with `estado` (`pendiente_revision` | `confirmado` | `previsto`) and `origen` (`manual` | `ticket` | `banco`). The page (`GastosPage.tsx`) loads three lists in parallel: OCR drafts, forecasts, and confirmed rows filtered by a single month (`mes`, defaulting to the current month), with totals only for that month. There is no way to see a year, no income, no editing of confirmed rows, and the category field uses a native `<datalist>` that dumps every known category. The production database already exists, and the monorepo rule is that schema additions must ship with an idempotent `ensureSchema` at backend startup (`init.sql` only runs on fresh volumes).

## Goals / Non-Goals

**Goals:**
- Default to the whole current year, with months visibly separated and subtotalled, and an easy way to focus on one month.
- Record income with the same lifecycle as expenses (including forecasts) and filter by expenses / income / both.
- Suggest only a few relevant previously used categories and merchants while typing.
- Make the page understandable to someone who has never seen it: one obvious place to add, plain language, readable on a phone.
- Keep existing data and behavior intact: existing rows are expenses, totals never count drafts or forecasts, soft delete everywhere.

**Non-Goals:**
- No charts library; per-month bars are plain CSS.
- No Telegram support for income, no recurring entries, no budgets, no CSV export.
- No renaming of the `gasto` table or the `comercio` column (renaming a live table is risk without user value; the UI relabels `comercio` as "Origen" for income).
- No multi-user or per-family-member attribution.

## Decisions

### `tipo` column on the same table, not a second table or a signed amount

A separate `ganancia` table would duplicate the whole lifecycle (drafts, forecasts, soft delete, categories) and force every query to `UNION`. A signed `importe` (negative for expenses) would silently invert every existing row's meaning and every existing validation (`importe > 0`). A `tipo VARCHAR(10) NOT NULL DEFAULT 'gasto' CHECK (tipo IN ('gasto','ganancia'))` keeps `importe` always positive, makes every existing row a `gasto` with no backfill, and lets the Telegram/OCR path keep inserting without knowing about it. The sign is presentation only.

`ensureSchema` adds it with `ADD COLUMN IF NOT EXISTS`, then drops and re-adds the named CHECK constraint, mirroring the existing pattern in that file; `init.sql` gets the identical definition and both files carry a cross-reference comment.

### API shape (additive and backward compatible)

- `GET /gastos` gains `anio` (`YYYY`) and `tipo` (`gasto|ganancia`). `anio` and `mes` together are a 400 (ambiguous). `anio` filters with a half-open range on `fecha` (`>= YYYY-01-01 AND < (YYYY+1)-01-01`), which uses `idx_gasto_fecha` instead of `date_trunc` on every row. The ordering rule from the previous change is unchanged (forecasts soonest-first, everything else newest-first).
- `POST /gastos` and `PATCH /gastos/:id` accept `tipo`. The `fecha` requirement stays "required unless `estado='previsto'`".
- `GET /totales` accepts exactly one of `mes` or `anio`, plus optional `categoria`, and always counts only `estado='confirmado'` and `activo=true`. Response: `{ periodo, mes?, anio?, gastos, ganancias, balance, total, porCategoria, porMes? }` where `total` equals `gastos` (kept so an older cached frontend that only knows `mes` + `total` + `porCategoria` keeps working), `porCategoria` items are `{ categoria, tipo, total }`, and `porMes` is present only for `anio` and always has 12 zero-filled `{ mes: 'YYYY-MM', gastos, ganancias }` entries so the UI never has to fill gaps. `balance = ganancias - gastos`.
- `GET /categorias` and the new `GET /comercios` return distinct non-null values ordered by usage count descending, then alphabetically, optionally filtered by `tipo`. The response stays a plain `string[]`. Only `activo=true` rows count.

Summary cards always show gastos, ganancias and balance for the period (and the category filter, when set); the `tipo` filter only affects the movement list. Showing "Gastos 0 €" next to a filtered list would be more confusing than showing all three.

### Suggestions are filtered on the client, not queried per keystroke

The distinct categories/merchants of one person are a few hundred strings at most. Fetching once per form open and filtering locally is instant, needs no debouncing and no extra endpoint parameters. The ranking lives in a pure function (`src/lib/autocomplete.ts`): case- and accent-insensitive; prefix matches before substring matches; ties broken by the server's usage order; capped at 6; with an empty input only the top 5 most-used are offered on focus. Free text is always accepted (a new category is just typed). A native `<datalist>` cannot cap or rank its suggestions and renders inconsistently across browsers, hence a small custom combobox with `role="combobox"`/`listbox` semantics and keyboard support (↑ ↓ Enter Esc).

### Page layout (top to bottom, single column, mobile-first)

1. Header (existing: title, theme toggle, app launcher, user, logout).
2. OCR review banner: only when there are drafts, a card ("Tienes N tickets del bot por revisar") that expands to the existing review rows.
3. Period bar: year stepper (◀ 2026 ▶) and a month strip ("Todo el año", Ene…Dic). The selected option is filled with the accent color; months with movements show a small dot, empty months are dimmed but still selectable.
4. Summary cards: Ganancias (green), Gastos (red), Balance (green or red by sign).
5. Filters: segmented control Todo / Gastos / Ganancias, category autocomplete, free-text search over merchant, concept and category (client-side).
6. Year overview, only when "Todo el año" is selected: twelve compact rows (month, income bar, expense bar, balance) from `porMes`; clicking one selects that month.
7. Movement list grouped under sticky month headers (month name, number of movements, income and expense subtotal of what is shown). Row: day + short weekday, merchant/source, category chip, muted concept, amount colored with sign, edit and delete actions (≥44px touch targets on mobile).
8. "Previstos" section: forecast rows with "Por pagar" and "Por cobrar" totals; each row has "Ya ha ocurrido" (confirm, asks for the real date, prefilled with today), edit, and discard.
9. A prominent "Añadir" button (sticky on mobile) opens the add/edit dialog.

### One dialog for add and edit

Replaces `ExpenseForm.tsx` and the inline forecast creation form. Fields: big Gasto/Ganancia toggle (red/green), amount, date (defaults to today), merchant or source (label follows the toggle: "Comercio" / "¿De dónde viene?"), category, optional concept, and a switch "Todavía no ha pasado (previsión)" that makes the date optional and saves `estado='previsto'`. Editing reuses it pre-filled. Deleting asks for confirmation (soft delete underneath, as before). `ExpenseList.tsx`, `ExpenseForm.tsx` and `TotalsView.tsx` are removed; `PendingReview.tsx` and `PendingExpenses.tsx` are restyled and simplified (no creation form in the latter).

### Pure logic in `src/lib/`, with tests

Grouping by month, subtotals, money/date formatting, suggestion ranking and the month-strip model are plain functions with vitest unit tests (vitest as a dev dependency, same setup as `finanzas/frontend`). Components stay thin.

## Risks / Trade-offs

[Risk: `/totales` response gains fields and `porCategoria` items gain `tipo`] → Mitigation: only additive keys; `mes`, `total` and `porCategoria[].categoria/total` keep their meaning for expenses, so a frontend cached from before the deploy keeps rendering. Backend and frontend ship in the same deploy anyway.

[Risk: a full year of rows in one response] → Mitigation: single user, a few thousand rows at most, indexed by `fecha`; no pagination now, revisit if the list ever feels slow.

[Risk: the `ensureSchema` DDL runs on every start] → Mitigation: every statement is idempotent; `ADD COLUMN IF NOT EXISTS` with a constant default is a metadata-only change on Postgres 15, and the CHECK is re-added over a handful of rows.

[Risk: category/merchant suggestions mix expense and income vocabulary] → Mitigation: the form passes the current `tipo` to `/categorias` and `/comercios`, so "Nómina" is not suggested while adding a supermarket expense.

[Risk: a large visual rewrite is hard to verify without the full local stack] → Mitigation: pure helpers are unit-tested; the UI is checked in a browser against a mocked API at phone and desktop widths in both themes before the branch is reported done.
