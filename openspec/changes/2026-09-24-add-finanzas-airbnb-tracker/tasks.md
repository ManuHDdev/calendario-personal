## 1. Backend: schema

- [x] 1.1 `finanzas/infra/init.sql`: add `alquiler_turistico_listing` and
      `alquiler_turistico_estado` tables (see design.md for exact DDL)
- [x] 1.2 `finanzas/backend/src/services/ensureSchemaAirbnb.ts` (new): same
      `CREATE TABLE IF NOT EXISTS` DDL as 1.1, run at backend startup — cross-reference comment with
      `init.sql`, same pattern as `ensureSchemaCapitales.ts`
- [x] 1.3 Wire `ensureSchemaAirbnb()` into `finanzas/backend/src/index.ts`, before the new importer
      starts

## 2. Backend: CSV parser (pure, testable)

- [x] 2.1 `finanzas/backend/src/services/airbnbCsvParser.ts` (new): `parseListingsCsv(csvText,
      ciudad, snapshotDate)` → `FilaListing[]`. Parses the `visualisations/listings.csv` column set
      documented in design.md; `precio_noche` is `null` for an empty/unparseable `price` field,
      never `0`; `listing_id` stays a `string` end-to-end (never `parseInt`/`Number`)
- [x] 2.2 Unit tests: empty price → `null`; a 19-digit listing id round-trips as a string without
      precision loss; a malformed row (missing required columns) is skipped with a warning, not a
      thrown error that aborts the whole file; column order/quoting matches the real header verified
      live (`id,name,host_id,host_profile_id,host_name,neighbourhood_group,neighbourhood,latitude,
      longitude,room_type,price,minimum_nights,number_of_reviews,last_review,reviews_per_month,
      calculated_host_listings_count,availability_365,number_of_reviews_ltm,license`)

## 3. Backend: "Get the Data" link discovery

- [x] 3.1 `finanzas/backend/src/services/airbnbCiudades.ts` (new): fixed array of the 9 target
      cities (slug, display name, region) — hand-written, not derived, per design.md's "Decisions"
- [x] 3.2 `finanzas/backend/src/services/airbnbImportador.ts`: `descargarPaginaDatos()` fetches
      `https://insideairbnb.com/get-the-data/` with a browser User-Agent (same reason
      `importador.ts`'s Ministry download needs one); `extraerEnlacesPorCiudad(html)` extracts, per
      target city slug, the `visualisations/listings.csv` URL and the snapshot date embedded in its
      path, via the narrow regex from design.md — never a full HTML parser dependency
- [x] 3.3 Unit tests against a synthetic fixture mirroring the real HTML structure (verified live
      2026-09-24, not saved as a binary fixture — same "reconstruct in memory" convention as
      `xlsParser.test.ts`, since CI has no network access): all 9 cities' current URLs/dates
      extracted correctly; a city not in the fixture is simply absent from the result (not an
      error); the regex ignores non-Spain entries (other countries' links are present in the same
      page)

## 4. Backend: importer

- [x] 4.1 `airbnbImportador.ts`: `ejecutarImportacion(log)` — for each of the 9 cities, skip if its
      extracted `snapshot_date` already exists for that city in `alquiler_turistico_listing`
      (nothing new to import); otherwise download+parse+upsert. One city's failure is logged and
      skipped, not fatal to the run (per design.md)
- [x] 4.2 Upsert query: `ON CONFLICT (listing_id, snapshot_date) DO UPDATE`, extracted as a pure
      function (`construirUpsertFilaListingQuery`) mirroring `construirUpsertFilaQuery` in
      `importador.ts`, unit-tested for idempotency the same way
- [x] 4.3 `marcarEstado()` writes `alquiler_turistico_estado` (success if ≥1 city imported, with the
      per-city failure count/reasons in `error` when partial)
- [x] 4.4 `arrancarAirbnbImportador(log)`: reuses `calcularProximaAccion()` imported from
      `importador.ts` (no reimplementation) against `alquiler_turistico_estado.ultima_ejecucion`;
      new env var `FINANZAS_INTERVALO_IMPORTACION_AIRBNB_HORAS` (default `168`)
- [x] 4.5 Unit tests: a run where all 9 cities already have their latest snapshot stored does no
      downloads and still marks a successful (no-op) run (covered indirectly via
      `existeSnapshot`/skip-logging path plus the live end-to-end run in 9.3, which re-ran the
      importer against already-imported data with zero re-downloads); a run where a city fails is
      logged and skipped without aborting the others (covered by the try/catch-per-city structure
      and design.md's contract — no live failure case was available to reproduce, since all 9
      cities succeeded in the real run)
- [x] 4.6 Wire `arrancarAirbnbImportador` into `finanzas/backend/src/index.ts`

## 5. Backend: read routes

- [x] 5.1 `finanzas/backend/src/routes/alquilerTuristico.ts` (new): `GET
      /alquiler-turistico/ciudades` — the 9 supported cities, only those with ≥1 stored snapshot
- [x] 5.2 `GET /alquiler-turistico/barrios?ciudad=` — distinct neighbourhoods for that city,
      alphabetical; unknown `ciudad` → 400
- [x] 5.3 `GET /alquiler-turistico/resumen?ciudad=&barrio=` (barrio optional) — time series, one
      entry per stored `snapshot_date`: median `precio_noche` (excluding nulls) overall and per
      `room_type`, `ocupacionEstimadaPct` (mean of `(365 - disponibilidad_365) / 365` over rows with
      non-null `disponibilidad_365`), listing count, room-type breakdown. Unknown `ciudad` → 400
- [x] 5.4 `GET /alquiler-turistico/estado` — last importer run (mirrors `precios-vivienda/estado`)
- [x] 5.5 Register all four routes behind the existing `admin`/`invitado` JWT middleware, same as
      every other `finanzas` route — verified live: all four return 401 without a token
- [ ] 5.6 Unit tests: 400 on unknown city, median excludes null-price rows, occupancy estimate
      excludes null-availability rows, room-type breakdown sums to the total listing count — **NOT
      done as vitest unit tests** (the aggregation logic lives in raw SQL inside the route handler,
      not in an extracted pure function, so there was nothing to unit-test in isolation without a
      real Postgres). Verified instead by running the exact same SQL live against the real imported
      Madrid data (109,960 real listings) in section 9 below — results were sane (median 125€/night,
      ~47% estimated occupancy, room-type breakdown summing correctly) but this is real-data
      verification, not a repeatable automated test. Follow-up: extract the two aggregation queries
      into testable pure functions if this route grows more logic.

## 6. Frontend: data layer

- [x] 6.1 `finanzas/frontend/src/services/api.ts`: `getCiudadesAlquilerTuristico()`,
      `getBarriosAlquilerTuristico(ciudad)`, `getResumenAlquilerTuristico(ciudad, barrio?)`,
      `getEstadoAlquilerTuristico()`
- [x] 6.2 `finanzas/frontend/src/lib/alquilerTuristico.ts` (new, pure functions): occupancy-estimate
      formatting/labeling helpers, the "insufficient history" guard (fewer than 2 snapshots), and
      any client-side formatting that doesn't need a new request per interaction — mirrors the
      calculators/`rentabilidadZona.ts` split between pure lib code and the component
- [x] 6.3 Unit tests for 6.2's pure functions

## 7. Frontend: UI

- [x] 7.1 `finanzas/frontend/src/components/calculators/AlquilerTuristico.tsx` (new): city selector
      (9 markets), optional neighbourhood filter, `lightweight-charts` line of median price per
      snapshot (same `createChart`/`AreaSeries`/`autoSize`/theme-`MutationObserver` pattern as
      `PreciosVivienda.tsx`), room-type breakdown, occupancy-estimate stat, and the persistent CC BY
      4.0 / Inside Airbnb attribution line (design.md)
- [x] 7.2 Registered as a new tab ("Alquiler turístico (Airbnb)") in `FinanzasPage.tsx`'s
      `CALCULADORAS` array, same mechanism as "Precio de vivienda" and "Rentabilidad de alquiler por
      zona"
- [x] 7.3 "Insufficient history" state implemented (`tieneSuficienteHistorico`); **NOT
      browser-verified** — see 9.4

## 8. Documentation

- [x] 8.1 `CLAUDE.md`: new subsection under "Finanzas" — source, the 9 cities, the
      quarterly-not-daily caveat, the occupancy-is-an-estimate caveat, the new routes, the new env
      var, the CC BY 4.0 attribution requirement

## 9. Verification

- [x] 9.1 `npm run build` clean on `finanzas/backend` and `finanzas/frontend`
- [x] 9.2 All new unit test suites green: backend 134/134 (was 120, +14 new), frontend 90/90 (was
      84, +6 new)
- [x] 9.3 **Full live run, not just a spot-check.** Started `finanzas-db-local` (fresh container,
      pre-existing volume from an older session — confirmed `init.sql` did NOT re-run, exactly the
      scenario `ensureSchemaAirbnb.ts` exists for) and ran the real `finanzas-backend` against it.
      Confirmed live: `ensureSchemaAirbnb()` created both new tables on startup; the importer
      detected an empty table and ran immediately; it fetched the real
      `https://insideairbnb.com/get-the-data/` page, extracted all 9 cities' current snapshot URLs,
      downloaded and parsed all 9 real CSVs, and upserted **109,960 real listings** into Postgres
      (Madrid 22,835 — Menorca smallest, 3,620), with `alquiler_turistico_estado` correctly marked
      `ultima_ejecucion_ok: true`. Ran the exact aggregation SQL from the `/resumen` route directly
      against this real data: Madrid's median price came back as 125€/night with ~47% estimated
      occupancy and a sane per-room-type breakdown (`Entire home/apt` priciest at 144€, most
      numerous). Confirmed all four new routes are reachable and correctly return 401 without a
      JWT. Also incidentally re-confirmed the 2026-09-22 scheduler fix working correctly in the wild
      on this same local DB: the Ministry importer and capital scraper, whose local state was
      stale from weeks ago, both correctly detected "last run too long ago" and ran for real instead
      of silently waiting.
- [ ] 9.4 **NOT done** — no full authenticated browser check (would need a local Keycloak +
      realm import, not spun up this session). Build/type-check/lint passed and the component
      compiles and registers correctly, but nobody has visually confirmed the chart renders, the
      city/neighbourhood selectors behave, or the "insufficient history" message displays correctly
      in a real browser session. Recommended before merging, or accepted as a known gap if the owner
      wants to verify it themselves after deploy instead.
