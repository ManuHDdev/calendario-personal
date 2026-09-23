## ADDED Requirements

### Requirement: Forecasted expenses with an optional date

The owner SHALL be able to create an expense with a known amount that hasn't happened yet (`estado='previsto'`), with `fecha` optional. A forecasted expense SHALL NOT be included in monthly totals until confirmed.

#### Scenario: Forecast without a known date

- **WHEN** the owner submits `POST /gastos/api/gastos` with `estado='previsto'` and no `fecha`
- **THEN** the expense is stored with `estado='previsto'` and `fecha=null`

#### Scenario: Forecast with a known future date

- **WHEN** the owner submits `POST /gastos/api/gastos` with `estado='previsto'` and a future `fecha`
- **THEN** the expense is stored with `estado='previsto'` and that `fecha`

#### Scenario: Forecast excluded from totals

- **WHEN** a `previsto` expense exists, dated or not
- **THEN** `GET /gastos/api/totales` does not include its amount, regardless of the requested month

#### Scenario: Manual confirmed expense still requires a date

- **WHEN** the owner submits `POST /gastos/api/gastos` with no `estado` (or `estado='confirmado'`) and no `fecha`
- **THEN** the request is rejected with HTTP 400 — the existing requirement that a real expense has a date is unchanged

### Requirement: Confirming a forecasted expense

The owner SHALL be able to move a `previsto` expense to `confirmado` via `PATCH /gastos/api/gastos/:id`, the same mechanism used to confirm an OCR draft. Once confirmed, it SHALL be included in totals for its (now-required) `fecha`'s month.

#### Scenario: Confirming includes it in totals

- **WHEN** the owner calls `PATCH /gastos/api/gastos/:id` on a `previsto` expense with `{ estado: 'confirmado', fecha: <a real date>, ... }`
- **THEN** the expense's `estado` becomes `confirmado` and it is included in that month's totals from then on

### Requirement: Forecasted expenses list, soonest-first

`GET /gastos/api/gastos?estado=previsto` SHALL return forecasted expenses ordered by `fecha` ascending, with undated expenses ordered last.

#### Scenario: Dated forecasts before undated ones

- **WHEN** two `previsto` expenses exist, one with `fecha='2026-11-01'` and one with `fecha=null`
- **THEN** the dated one appears before the undated one in `GET /gastos/api/gastos?estado=previsto`

### Requirement: Discarding a forecasted expense

The owner SHALL be able to soft-delete a `previsto` expense via `DELETE /gastos/api/gastos/:id`, same as any other expense.

#### Scenario: Discarded forecast excluded from listing

- **WHEN** a `previsto` expense is deleted via `DELETE /gastos/api/gastos/:id`
- **THEN** it no longer appears in `GET /gastos/api/gastos?estado=previsto`, but the row still exists in the database
