## Why

The owner is evaluating whether a specific property is worth more as a short-term (Airbnb-style)
rental than as a standard fixed-term lease, and wants a price/occupancy tracker in `finanzas` to
support that decision — similar in spirit to the existing "Precio de vivienda" and "Rentabilidad de
alquiler por zona" sections, but for the short-term-rental market instead of the sale/long-term-rental
market those already cover.

Research done before this proposal (see design.md for full detail) ruled out the two approaches that
would have been the obvious fit for this monorepo's existing pattern:

- **Airbnb itself has no public API** for listings/pricing/occupancy, and its Terms of Service
  explicitly prohibit bots/scrapers. Its anti-bot posture (fingerprinting, behavioral analysis,
  hashed CSS classes that change per deploy) is harder than Idealista's, which this monorepo already
  excludes for the same category of reason (see `pisos`/`locales` sections of CLAUDE.md). Building a
  scraper against airbnb.com directly would be inconsistent with that existing, deliberate policy.
- **Paid market-data APIs** (AirDNA, Mashvisor, Rabbu) do give real per-market occupancy/ADR, but
  require a paid subscription the owner would have to hold personally, and their terms restrict
  redistributing the data — incompatible with the "backend scrapes a source and serves it to anyone
  with the `invitado` role" pattern every other `finanzas` data source follows.

The chosen source is **Inside Airbnb** (insideairbnb.com), an independent non-commercial project that
publishes Creative Commons–licensed (CC BY 4.0) per-city snapshots of Airbnb listing data, explicitly
intended for reuse. Its Spain coverage is 9 markets: Madrid, Barcelona, Girona, Málaga, Mallorca,
Menorca, Euskadi, Sevilla and Valencia (verified live against the site's own "Get the Data" page,
which is more current than the page's own cached city list — see design.md). The owner confirmed
interest in all of them ("Todas me interesan"), not a single specific zone.

## What Changes

- **New backend importer** (`finanzas/backend/src/services/airbnbImportador.ts`), same scheduled
  pattern as `importador.ts`/`capitalScraper.ts` (`setTimeout` chained, reuses the just-fixed
  `calcularProximaAccion()` scheduler so a redeploy resumes the wait instead of resetting it).
  Fetches Inside Airbnb's public "Get the Data" HTML page (a static, non-JS-rendered page — see
  design.md), extracts the current snapshot's `visualisations/listings.csv` URL for each of the 9
  target cities, downloads and parses each one, and upserts one row per `(listing_id, snapshot_date)`
  into a new `alquiler_turistico_listing` table.
- **New routes** (`/finanzas/api/alquiler-turistico/*`) serving aggregated, chartable data: a
  time series of median nightly price and an occupancy *estimate* per city/room-type/snapshot, a
  neighbourhood list for filtering, and importer status — same `admin`/`invitado` gate as the rest of
  `finanzas`.
- **New frontend section** in `finanzas`, alongside "Precio de vivienda" and "Rentabilidad de
  alquiler por zona": a city selector (the 9 covered markets), an optional neighbourhood filter, a
  `lightweight-charts` line of median price over time (one point per quarterly snapshot — see
  Non-goals), a room-type breakdown, and an occupancy estimate — all clearly labeled as coming from
  Inside Airbnb, updated quarterly, with the CC BY 4.0 attribution the license requires.

## Capabilities

### New Capabilities
- None (no new subapp; this extends `finanzas`).

### Modified Capabilities
- `finanzas`: adds a fourth complementary data source (short-term-rental market data from Inside
  Airbnb) alongside the existing three (official price-by-province XLS, per-capital listing scrape,
  and the on-demand rental-yield zone finder).

## Impact

- `finanzas/backend/src/services/airbnbImportador.ts` (new), `airbnbCsvParser.ts` (new — parsing the
  summary CSV, isolated and unit-testable the way `xlsParser.ts` already is)
- `finanzas/backend/src/routes/alquilerTuristico.ts` (new)
- `finanzas/infra/init.sql`: new tables `alquiler_turistico_listing` and
  `alquiler_turistico_estado` (singleton, same shape as `importacion_estado`)
- `finanzas/backend/src/services/ensureSchemaAirbnb.ts` (new, same reason
  `ensureSchemaCapitales.ts` exists: the production DB volume already has data, so `init.sql` alone
  won't create the new tables there — see that file's cross-comment convention)
- `finanzas/backend/src/index.ts`: wire up `arrancarAirbnbImportador` next to the two existing
  importers
- `finanzas/frontend/src/lib/alquilerTuristico.ts` (new — pure aggregation/formatting helpers,
  tested, same split as `rentabilidadZona.ts`)
- `finanzas/frontend/src/components/calculators/AlquilerTuristico.tsx` (new component) +
  registration in whatever top-level nav/tab list already switches between "Precio de vivienda" and
  "Rentabilidad de alquiler por zona"
- `finanzas/frontend/src/services/api.ts`: new fetch functions for the three new routes
- `CLAUDE.md`: new subsection under "Finanzas" documenting the source, its limitations, the new
  routes, and the new env var(s)
- No new Keycloak role, no new port, no new Docker image (same `finanzas-backend`/`finanzas-frontend`
  images) — this is additive within the existing subapp.

## Non-goals

- **No daily or monthly granularity.** Inside Airbnb refreshes each city roughly once per quarter;
  the time series this feature produces has one point per quarter, at whatever date each city
  happens to be scraped (dates differ slightly across the 9 cities). The original request asked for
  "por día o mínimo por mes" — that literally isn't achievable with this free, legal data source, and
  this is called out explicitly in the UI, not silently downgraded.
- **No real per-night occupancy/booking data.** `availability_365` (days shown as available in the
  next year) is used as an occupancy *proxy* (`ocupación estimada ≈ (365 − availability_365) / 365`),
  clearly labeled as an estimate. It over-counts: a host-blocked day (vacation, maintenance, a gap
  enforced by `minimum_nights`) looks identical to a booked day in this field — Inside Airbnb's own
  published data-assumptions document says the same. True booking-level occupancy is not publicly
  available without a paid provider (AirDNA etc. — see Why).
- **No historical backfill.** The importer only ever sees Inside Airbnb's *current* snapshot per
  city (the "Get the Data" page doesn't expose the historical archive in machine-readable form); the
  time series starts accumulating from whenever this feature is deployed and grows one point per
  quarter going forward — it does not retroactively reconstruct past quarters.
- **No ingestion of `calendar.csv.gz` or `reviews.csv.gz`.** Both are available from the same source
  but are one to two orders of magnitude larger (tens to hundreds of MB per city, decompressing to
  gigabytes for `reviews.csv.gz` in the biggest markets) and unnecessary for the price/characteristics
  view this feature targets. The lightweight `visualisations/listings.csv` summary (a few MB per
  city) already carries price, `availability_365`, `reviews_per_month`, room type, neighbourhood, and
  minimum stay — enough for what's being asked. Ingesting the full per-night calendar is a follow-up
  if a real occupancy calculation is ever wanted badly enough to justify the storage and processing
  cost.
- **No listing-level browsing UI** (a map or a per-listing detail page). v1 is aggregate
  charts/stats per city/neighbourhood/room-type, matching what was asked ("evolución del precio",
  "ocupación si fuese posible", "alguna característica más") without scope-creeping into a second
  full listing browser next to the one `rentabilidadZona` already provides for the sale/long-term
  market.
