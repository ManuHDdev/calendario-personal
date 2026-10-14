## ADDED Requirements

### Requirement: Income as a movement type

A movement SHALL have a `tipo` of `gasto` or `ganancia`. `tipo` SHALL default to `gasto`, and `importe` SHALL always be a positive number regardless of `tipo`. The OCR pipeline and the Telegram bot SHALL only create `gasto` movements.

#### Scenario: Existing rows are expenses

- **WHEN** the schema is migrated on a database that already has movements
- **THEN** every existing row has `tipo='gasto'`

#### Scenario: Creating an income

- **WHEN** the owner submits `POST /gastos/api/gastos` with `tipo='ganancia'`, a positive `importe`, a `fecha` and a `comercio`
- **THEN** the movement is stored with `tipo='ganancia'` and `estado='confirmado'`

#### Scenario: Invalid type rejected

- **WHEN** a create or update request carries a `tipo` other than `gasto` or `ganancia`
- **THEN** the backend responds with HTTP 400

### Requirement: Year and type filters on the listing

`GET /gastos/api/gastos` SHALL accept `anio` (`YYYY`) and `tipo`. `anio` SHALL match every movement whose `fecha` falls in that calendar year. Sending both `anio` and `mes` SHALL be rejected.

#### Scenario: Whole year

- **WHEN** the owner requests `?anio=2026&estado=confirmado`
- **THEN** the response contains confirmed movements dated from 2026-01-01 to 2026-12-31, newest first

#### Scenario: Only income

- **WHEN** the owner requests `?anio=2026&tipo=ganancia`
- **THEN** only movements with `tipo='ganancia'` are returned

#### Scenario: Ambiguous period

- **WHEN** the request carries both `anio` and `mes`
- **THEN** the backend responds with HTTP 400

### Requirement: Totals by period with income, expenses and balance

`GET /gastos/api/totales` SHALL accept exactly one of `mes` (`YYYY-MM`) or `anio` (`YYYY`), and an optional `categoria`. It SHALL count only `estado='confirmado'` and `activo=true` rows, and return `gastos`, `ganancias`, `balance` (`ganancias - gastos`), `total` (equal to `gastos`), `porCategoria` (`{categoria, tipo, total}`), and, for `anio`, `porMes` with exactly 12 zero-filled entries.

#### Scenario: Balance

- **WHEN** a year has confirmed income of 3000 and confirmed expenses of 1200
- **THEN** `GET /totales?anio=<year>` returns `ganancias=3000`, `gastos=1200`, `balance=1800`

#### Scenario: Drafts and forecasts excluded

- **WHEN** `pendiente_revision` or `previsto` movements exist in the period
- **THEN** none of them is included in any total

#### Scenario: Zero-filled months

- **WHEN** a year has movements only in March
- **THEN** `porMes` still has 12 entries and the other eleven have `gastos=0` and `ganancias=0`

#### Scenario: Missing or ambiguous period

- **WHEN** neither or both of `mes` and `anio` are sent
- **THEN** the backend responds with HTTP 400

### Requirement: Usage-ranked suggestions for categories and merchants

`GET /gastos/api/categorias` and `GET /gastos/api/comercios` SHALL return the distinct non-null values used by active movements, ordered by number of uses descending and then alphabetically, optionally restricted by `tipo`.

#### Scenario: Most used first

- **WHEN** the category "Comida" is used 5 times and "Ocio" twice
- **THEN** "Comida" appears before "Ocio"

#### Scenario: Type-scoped suggestions

- **WHEN** the request carries `tipo=ganancia`
- **THEN** only values used by income movements are returned

### Requirement: Year-first page

The frontend SHALL open on the current year with every month shown, grouped under month headers with the month's income and expense subtotals, and SHALL offer a year stepper, a month selector, a segmented type filter (all, expenses, income) and a category filter. Selecting a month SHALL narrow the list and the summary to that month; selecting the whole year SHALL restore them.

#### Scenario: Default view

- **WHEN** the owner opens the app
- **THEN** the selected period is the current year, the type filter is "all", and the list shows all confirmed movements of that year grouped by month

#### Scenario: Income only

- **WHEN** the owner selects the "Ganancias" filter
- **THEN** the list shows only income, and the summary cards still show income, expenses and balance of the period

### Requirement: Autocomplete for category and merchant

The category and merchant/source fields SHALL suggest at most six previously used values that match what has been typed (case- and accent-insensitive, prefix matches first), SHALL offer the five most used values when focused with an empty field, and SHALL accept a value that is not in the list.

#### Scenario: Matching while typing

- **WHEN** the owner types "su" and "Supermercado" and "Suministros" exist
- **THEN** both are suggested and selecting one fills the field

#### Scenario: New value allowed

- **WHEN** the owner types a category that has never been used
- **THEN** the field keeps the typed value and the movement can be saved with it

### Requirement: Single add and edit dialog

The frontend SHALL provide one dialog to add and to edit a movement, with an expense/income toggle, amount, date, merchant or source, category, optional concept, and a switch that marks the movement as a forecast (`estado='previsto'`, date optional). Deleting a movement SHALL require confirmation.

#### Scenario: Editing a confirmed movement

- **WHEN** the owner edits a confirmed movement and saves
- **THEN** the movement is updated through `PATCH /gastos/api/gastos/:id` and the list reflects the change

#### Scenario: Forecast income

- **WHEN** the owner adds an income with the forecast switch on and no date
- **THEN** it is stored with `tipo='ganancia'`, `estado='previsto'`, `fecha=null`, and appears in the forecasts section, not in the totals

## MODIFIED Requirements

### Requirement: Forecasted expenses with an optional date

The owner SHALL be able to create a movement of either type (`gasto` or `ganancia`) with a known amount that hasn't happened yet (`estado='previsto'`), with `fecha` optional. A forecasted movement SHALL NOT be included in totals until confirmed.

#### Scenario: Forecast excluded from totals

- **WHEN** a `previsto` movement exists, dated or not, of either type
- **THEN** `GET /gastos/api/totales` does not include its amount for any period
