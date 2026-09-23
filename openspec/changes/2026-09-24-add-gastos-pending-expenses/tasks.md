## 1. Database

- [ ] 1.1 `gastos/infra/init.sql`: add `previsto` to the `estado` CHECK constraint; drop `NOT NULL` on `fecha` (fresh-volume schema, for new local/CI setups)
- [ ] 1.2 `DEPLOY_NOTES.md`: manual migration step for the existing production `gastos` database (drop + recreate the `estado` CHECK constraint to include `previsto`, `ALTER TABLE gasto ALTER COLUMN fecha DROP NOT NULL`) — same pattern as the earlier `ofertas` `habilitada` migration note

## 2. Backend — schema & validation

- [ ] 2.1 `gastos/backend/src/schemas/gasto.schema.ts`: extend `estadoEnum` with `'previsto'`
- [ ] 2.2 `createGastoSchema`: add optional `estado: z.enum(['confirmado', 'previsto']).optional()`; make `fecha` optional at the field level and use `.superRefine` to require it unless `estado === 'previsto'`
- [ ] 2.3 Unit tests: `createGastoSchema` accepts `previsto` with no `fecha`; rejects `confirmado`/omitted-`estado` with no `fecha`; rejects `estado: 'pendiente_revision'` on manual create (unchanged — OCR-only)

## 3. Backend — route & query changes

- [ ] 3.1 `gastos/backend/src/routes/gastos.ts`: `POST /gastos` — use `parsed.data.estado ?? 'confirmado'` in the INSERT instead of the hardcoded `'confirmado'` string; pass `parsed.data.fecha ?? null`
- [ ] 3.2 `gastos/backend/src/db/queries.ts`: `buildListQuery` — when `filters.estado === 'previsto'`, order by `fecha ASC NULLS LAST, created_at DESC` instead of the default `fecha DESC, created_at DESC`
- [ ] 3.3 Unit tests: `POST /gastos` with `estado: 'previsto'` and no `fecha` persists a null-dated row; `buildListQuery({ estado: 'previsto' })` produces the ascending/NULLS LAST ordering; `buildListQuery` with any other/no `estado` filter keeps the existing descending order; `GET /totales` still excludes `previsto` rows

## 4. Frontend — types & API client

- [ ] 4.1 `gastos/frontend/src/types/index.ts`: add `'previsto'` to the `Estado` union; make `Gasto.fecha` and `GastoFormData.fecha`/`GastoUpdateData.fecha` accept `null`/optional consistently with the new nullable case; add `estado?: 'confirmado' | 'previsto'` to `GastoFormData`
- [ ] 4.2 `gastos/frontend/src/services/api.ts`: `createGasto` passes through the new optional `estado` field (no signature change beyond the type)

## 5. Frontend — UI

- [ ] 5.1 New `gastos/frontend/src/components/PendingExpenses.tsx`: lists `estado=previsto` expenses (fetched via `getGastos({ estado: 'previsto' })`), a small inline creation form (importe required, comercio required, concepto/categoria optional with the existing categoria autocomplete, fecha optional date input), a running total (client-side sum of `importe` over the fetched list) displayed prominently, and per-row "Confirmar" (disabled until the row has a valid date filled in, then `PATCH` `estado: 'confirmado'`) / "Descartar" (soft delete) actions — mirror `PendingReview.tsx`'s inline-edit-via-refs pattern rather than inventing a new one
- [ ] 5.2 `gastos/frontend/src/pages/GastosPage.tsx`: add a `previstos` state + fetch alongside the existing `pendientes`/`confirmados` loads in `load()`; render a new "Gastos pendientes" section (visually distinct from "Pendientes de revisar") using `PendingExpenses`
- [ ] 5.3 Manual verification in the local dev stack: create a forecast with no date, confirm it appears in "Gastos pendientes" and not in the confirmed list/totals; create one with a future date and confirm the ordering (soonest first, undated last) against a second forecast; confirm one (fill in a date, hit "Confirmar") and verify it now appears in the confirmed list and that month's totals; discard one and verify it disappears

## 6. Verification

- [ ] 6.1 `npm run build` (backend) and `npm run build` (frontend) both compile without errors
- [ ] 6.2 Backend unit tests green (schema validation, route/query changes from sections 2–3)
- [ ] 6.3 Existing test suites (OCR pipeline, bot `/editar`/`/enviar`/`/descartar`, existing CRUD) still pass unchanged — this change adds a state, it doesn't touch OCR or the Telegram bot
