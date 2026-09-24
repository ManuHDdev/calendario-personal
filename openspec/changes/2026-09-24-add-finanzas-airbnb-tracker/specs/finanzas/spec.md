## ADDED Requirements

### Requirement: Short-term-rental market tracker (Inside Airbnb)
`finanzas` SHALL provide price and characteristic tracking for the short-term-rental market, sourced
from Inside Airbnb (CC BY 4.0), for the 9 Spanish markets it covers: Madrid, Barcelona, Girona,
Málaga, Mallorca, Menorca, Euskadi, Sevilla and Valencia.

#### Scenario: Importer downloads and stores a new quarterly snapshot
- **WHEN** the scheduled importer runs and Inside Airbnb's "Get the Data" page lists a snapshot date
  for a city that isn't yet in `alquiler_turistico_listing`
- **THEN** the importer downloads that city's `visualisations/listings.csv`, upserts one row per
  listing keyed by `(listing_id, snapshot_date)`, and records the run in `alquiler_turistico_estado`

#### Scenario: A row with no price is never fabricated
- **WHEN** a source CSV row has an empty `price` field
- **THEN** the stored `precio_noche` is `NULL`, and that row is excluded from any median/average
  price aggregate — never treated as `0`

#### Scenario: One city fails, the rest still import
- **WHEN** one city's CSV fails to download or parse during a run
- **THEN** that city is skipped and logged, the other cities in the same run still import normally,
  and the run is marked successful overall if at least one city succeeded

#### Scenario: Redeploy does not reset the wait
- **WHEN** the backend restarts less than `FINANZAS_INTERVALO_IMPORTACION_AIRBNB_HORAS` after the
  last recorded attempt (success or failure)
- **THEN** the importer schedules its next run for the remaining time since that last attempt, not a
  fresh full interval from restart

### Requirement: Aggregated read API
`GET /finanzas/api/alquiler-turistico/*` SHALL require the same `admin`-or-`invitado` JWT gate as
every other `finanzas` route, and SHALL expose aggregated (never raw per-listing) data: a price/
occupancy-estimate time series per city, room type and optional neighbourhood, and the list of
supported cities/neighbourhoods.

#### Scenario: Unknown city is rejected
- **WHEN** a request names a `ciudad` outside the 9 supported markets
- **THEN** the backend responds with HTTP 400, not an empty result

#### Scenario: Occupancy is always labeled as an estimate
- **WHEN** the API returns an occupancy figure for a city/period
- **THEN** the field is named to make clear it is derived from `availability_365` (e.g.
  `ocupacionEstimadaPct`), never presented as confirmed bookings

### Requirement: Attribution and granularity are disclosed in the UI
The frontend SHALL display a persistent Inside Airbnb / CC BY 4.0 attribution wherever this data is
shown, and SHALL NOT present the price time series as finer-grained than the source actually is.

#### Scenario: Insufficient history for a trend
- **WHEN** a city has fewer than 2 stored snapshots
- **THEN** the UI shows an explanatory message instead of a chart line, and does not imply a trend
  from a single point
