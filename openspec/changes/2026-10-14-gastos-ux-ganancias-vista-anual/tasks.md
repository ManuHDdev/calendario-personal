## 1. Backend — schema and migration

- [ ] 1.1 `gastos/infra/init.sql`: add `tipo VARCHAR(10) NOT NULL DEFAULT 'gasto'` with a named CHECK `gasto_tipo_check` (`'gasto'`, `'ganancia'`)
- [ ] 1.2 `gastos/backend/src/db/ensureSchema.ts`: idempotently add the same column and constraint (`ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`), keeping the existing `estado` statements; cross-reference comment with `init.sql`
- [ ] 1.3 Test for `ensureSchema` (mock `pool.query`, assert the statements are issued and are idempotent in shape), matching how `pool.test.ts` mocks `pg`

## 2. Backend — validation, routes, queries

- [ ] 2.1 `schemas/gasto.schema.ts`: `tipoEnum`; `tipo` optional on create (default `gasto`) and update; `listGastosQuerySchema` gains `anio` and `tipo` and rejects `anio` together with `mes`; `totalesQuerySchema` becomes "exactly one of `mes` / `anio`" plus optional `categoria`; schema for the suggestion query (`tipo` optional)
- [ ] 2.2 `db/queries.ts`: `buildListQuery` supports `anio` (half-open `fecha` range) and `tipo`, ordering rules unchanged; `buildTotalesQuery` rewritten to return per-`tipo` and per-category sums for a `mes` or `anio` (confirmed + active only, optional `categoria`) and a per-month aggregation for `anio`; new `buildSugerenciasQuery(campo: 'categoria' | 'comercio', tipo?)` ordering by usage count then name
- [ ] 2.3 `routes/gastos.ts`: `POST`/`PATCH` persist `tipo`; `GET /totales` assembles `{ periodo, mes?, anio?, gastos, ganancias, balance, total, porCategoria, porMes? }` (12 zero-filled months for `anio`); `GET /categorias` uses the usage-ranked query with optional `tipo`; new `GET /comercios`
- [ ] 2.4 Confirm the OCR pipeline (`ocr/pipeline.ts`) and bot persist through the column default and need no change; do not touch `telegram/` or `ocr/` otherwise
- [ ] 2.5 Tests (vitest, existing conventions): schema (tipo valid/invalid, anio vs mes, totales XOR), `buildListQuery` (anio range, tipo, ordering unchanged), `buildTotalesQuery`, `buildSugerenciasQuery`, and the totals/route assembly including zero-filled `porMes` and "drafts and forecasts never counted"

## 3. Frontend — foundations

- [ ] 3.1 Add vitest as a dev dependency of `gastos/frontend` with a `test` script, mirroring `finanzas/frontend` configuration
- [ ] 3.2 `types/index.ts`: `Tipo`, `tipo` on `Gasto`/`GastoFormData`/`GastoUpdateData`, `TotalesPeriodo` (new totals shape), filters with `anio`/`tipo`
- [ ] 3.3 `services/api.ts`: `getGastos` with `anio`/`tipo`, `getTotales` for `mes` or `anio`, `getCategorias(tipo?)`, new `getComercios(tipo?)`
- [ ] 3.4 Pure helpers in `src/lib/` with unit tests: `autocomplete.ts` (normalize, rank, cap), `agrupar.ts` (group by month, subtotals, month-strip model), `formato.ts` (money, signed money, day + weekday, month names in Spanish)

## 4. Frontend — UI

- [ ] 4.1 `components/AutocompleteInput.tsx`: custom combobox (ARIA roles, keyboard ↑ ↓ Enter Esc, click/tap select, closes on blur, free text allowed, at most 6 suggestions, 5 most used when empty and focused)
- [ ] 4.2 `components/MovementDialog.tsx`: add/edit dialog described in design.md (type toggle, amount, date default today, merchant/source and category with autocomplete fed by `getComercios`/`getCategorias` for the current type, concept, forecast switch), validation messages in Spanish, focus trap and Esc to close
- [ ] 4.3 `components/PeriodBar.tsx` (year stepper + month strip with data dots), `SummaryCards.tsx` (income, expenses, balance), `Filters.tsx` (type segmented control, category autocomplete, search), `YearOverview.tsx` (12 rows with income/expense bars, click selects a month), `MovementList.tsx` (month-grouped, sticky headers, subtotals, signed colored amounts, edit and delete with confirmation)
- [ ] 4.4 Restyle and simplify `PendingReview.tsx` (collapsible banner) and `PendingExpenses.tsx` (list only, "Por pagar" / "Por cobrar" totals, "Ya ha ocurrido" asks for the real date prefilled with today, edit, discard); remove `ExpenseForm.tsx`, `ExpenseList.tsx`, `TotalsView.tsx`
- [ ] 4.5 `pages/GastosPage.tsx` + `GastosPage.css`: compose the layout from design.md; default to the current year; keep header (title, `ThemeToggle`, `AppLauncher`, user, logout); mobile-first, light and dark themes via the existing CSS variables, ≥44px touch targets, plain Spanish copy and empty states
- [ ] 4.6 Visual check: run the page in a browser against a mocked API at ~375px and ~1200px widths in light and dark themes (screenshots), fix layout/contrast problems found

## 5. Docs and verification

- [ ] 5.1 Update the `## Gastos` section of the monorepo `CLAUDE.md` (routes: `anio`/`tipo` filters, `/totales` shape, `/categorias`, `/comercios`; `tipo` column and its `ensureSchema`; new UI summary)
- [ ] 5.2 `npm run build` and `npm test` pass in `gastos/backend` and `gastos/frontend`; existing OCR, bot and previsto tests untouched and green
- [ ] 5.3 No `DEPLOY_NOTES.md` step is needed (the schema change ships through `ensureSchema`); confirm and leave that file unchanged
