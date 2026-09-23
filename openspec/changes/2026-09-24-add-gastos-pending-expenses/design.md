## Context

`gastos` currently models an expense's lifecycle with a two-value `estado`: `pendiente_revision` (OCR draft, excluded from totals, reviewed/edited/confirmed or discarded) and `confirmado` (real, counted). `fecha` is `NOT NULL` throughout — every code path (list ordering, month filtering, totals) assumes a real date. The owner asked for a third case: an expense that hasn't happened yet, with a known amount, and a date that may or may not be known — tracked separately with its own running total, purely as an in-app list (confirmed with the owner: no Telegram reminder, no backend scheduler).

## Goals / Non-Goals

**Goals:**
- Let the owner log a forecasted expense (amount always required, date optional) that sits in its own section until confirmed or discarded.
- Never let a forecasted expense count toward monthly totals — same hard rule that already protects `pendiente_revision`, extended to `previsto`.
- Reuse the existing review/confirm/discard interaction pattern (`PendingReview.tsx`, `PATCH .../:id` to flip `estado`, soft delete to discard) instead of inventing a parallel mechanism.
- Show a single running total of everything currently `previsto`, computed client-side from the already-fetched list (no new aggregate endpoint).

**Non-Goals:**
- No Telegram notification when a forecasted expense's date arrives (explicit owner decision for this change).
- No recurring/repeating forecasted expenses (e.g. "every month on the 5th") — a follow-up if it comes up.
- No OCR path for `previsto` — it's manual-entry only, same as any expense the owner types in directly.

## Decisions

### Third `estado` value (`previsto`), not a separate table or a boolean flag

A new table (e.g. `gasto_previsto`) would duplicate `importe`/`comercio`/`concepto`/`categoria` and force a copy step when a forecast becomes real, plus a second soft-delete/audit trail to maintain. A boolean flag (e.g. `es_previsto`) alongside the existing `estado` would let a row be simultaneously `confirmado` and "previsto," a combination that means nothing. A third `estado` value keeps the existing single-table, single-lifecycle model: `pendiente_revision` → `confirmado` (OCR path) and `previsto` → `confirmado` (forecast path) are the same shape of transition, reusing the exact same `PATCH /gastos/:id { ...edits, estado: 'confirmado' }` call the frontend already makes from `PendingReview.tsx`.

### `fecha` becomes nullable at the column level, required unless `estado='previsto'` at the validation level

The owner was explicit: "en una fecha determinada (o no)" — an unknown date must be representable, not faked with a placeholder (no "1970-01-01" or "today" default, which would silently corrupt month-based views if the row were ever miscategorized). Making the column nullable is the only honest representation of "I don't know yet."

This only weakens the guarantee for `previsto` rows: `createGastoSchema` uses `.superRefine` to require `fecha` for every other `estado` (including the default, `confirmado`) — a manually-logged real expense still can't be saved without a date, unchanged from today. `updateGastoSchema` doesn't need the same guard: confirming a `previsto` row (`PATCH { estado: 'confirmado' }`) is only reachable from the frontend's inline edit form, which requires a filled-in date before enabling "Confirmar" — same client-side gate `PendingReview.tsx` already applies to `importe > 0`.

Queries that assume a non-null `fecha` were audited:
- `buildListQuery`'s `date_trunc('month', fecha) = date_trunc('month', $n::date)` (the `mes` filter): only reachable when the frontend passes `mes`, which the new "Gastos pendientes" section never does (it always queries `estado=previsto` alone, deliberately not scoped to a month) — a `NULL fecha` row is simply never evaluated against this filter.
- `/totales`: always filters `estado='confirmado'`, so `previsto` rows (null-dated or not) never reach it — no change needed.
- `ORDER BY fecha DESC, created_at DESC`: see below.

### List ordering: soonest-first for `previsto`, unchanged newest-first otherwise

The existing default (`fecha DESC, created_at DESC`) reads as "most recent history first" — correct for confirmed expenses and OCR drafts awaiting review. A forecasted-expense list reads the opposite way: the owner wants to see what's coming up soonest. `buildListQuery` branches on `filters.estado === 'previsto'` and orders `fecha ASC NULLS LAST, created_at DESC` in that one case — undated forecasts (no known date at all) sort after everything with a known date, rather than winning ties at either extreme by accident. This is a narrow, named special case, not a general "sort direction" parameter — no other caller needs one today.

### `POST /gastos` gains an optional `estado`, not a second endpoint

`POST /gastos/api/gastos/previstos` would duplicate the entire handler (Zod validation, INSERT, response shape) for a one-column difference. Instead `createGastoSchema` gains `estado: z.enum(['confirmado', 'previsto']).optional()` (deliberately excluding `pendiente_revision` — that value only ever comes from the OCR pipeline, never from a manual POST) and the route's INSERT uses `parsed.data.estado ?? 'confirmado'` instead of the hardcoded string it has today. Every existing caller that omits `estado` keeps today's exact behavior.

### Total sum: computed client-side, no new backend route

`GET /gastos/api/totales?mes=` is month-scoped and `confirmado`-only by design — semantically a different question ("what did I spend this month") from "what's the sum of everything I'm still expecting" (no month scope, `previsto`-only). Rather than bolt a third meaning onto `/totales` or add a new endpoint for a single `reduce((sum, g) => sum + g.importe, 0)`, the frontend computes it from the list it already fetches for the new section — the same amount of data, one HTTP call either way.

## Risks / Trade-offs

[Risk: dropping `NOT NULL` on `fecha` widens what every future query must handle] → Mitigation: audited the three places that read `fecha` today (above); the two that assume non-null are structurally unreachable by a null-dated row (month filter never applied to `previsto` queries, `/totales` never includes non-`confirmado` rows). Any new query added later that groups/filters by `fecha` needs the same check — noted here for the next person touching this file.

[Risk: production `gastos` database already exists — `init.sql` changes don't reach it] → Mitigation: same situation as the earlier `ofertas` `habilitada` column; `DEPLOY_NOTES.md` gets an explicit `ALTER TABLE` step to run once against the live DB before/with this deploy, same as that precedent.

[Risk: "Gastos pendientes" (new) and "Pendientes de revisar" (existing, OCR review) are one word apart and could be confused in the UI] → Mitigation: kept the owner's own wording for the section title since that's the mental model they described, but used a distinct internal name (`previsto`, `PendingExpenses.tsx`) so the code itself never conflates the two; the two sections stay visually and physically separate in `GastosPage.tsx` (not merged or tabbed together).
