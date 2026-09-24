## Context

`finanzas` already has three data-source patterns to follow: a scheduled importer of an external
file (`importador.ts`, Ministry XLS), a scheduled scraper of live portals (`capitalScraper.ts`,
Fotocasa/pisos.com), and an on-demand search (`rentabilidadZona.ts`). This feature is closest to the
first: a scheduled importer of an external, already-structured dataset, not a scraper of a
JS-rendered site or a search-on-demand endpoint.

Both existing schedulers had a real bug (fixed 2026-09-22, same day this was investigated): they
reprogrammed a full interval from container start instead of from the last recorded attempt, so
frequent redeploys could starve them of ever actually running. The new importer reuses the fixed
`calcularProximaAccion()` helper from `importador.ts` from day one instead of re-introducing that
bug a third time.

## Goals / Non-Goals

**Goals:**
- Track median nightly price over time, per city and room type, for the 9 Spanish markets Inside
  Airbnb covers (Madrid, Barcelona, Girona, Málaga, Mallorca, Menorca, Euskadi, Sevilla, Valencia).
- Provide an occupancy *estimate* and basic listing characteristics (room type, neighbourhood,
  minimum stay, review activity) per city/neighbourhood.
- Never silently pretend the granularity is finer than it is (quarterly snapshots) or that the
  occupancy figure is a real booking count.
- Comply with the CC BY 4.0 license: visible attribution to Inside Airbnb wherever this data is
  shown.

**Non-Goals:** see proposal.md's Non-goals section (daily/monthly granularity, real occupancy,
historical backfill, calendar/reviews ingestion, listing-level browsing).

## Decisions

### Source of truth for "what to download": scrape the public "Get the Data" HTML page, not Airbnb, not a paid API, not Inside Airbnb's internal Gatsby JSON

Verified live (2026-09-24) with the built-in browser and `curl`:

- `https://insideairbnb.com/get-the-data/` is a Gatsby-generated site, but — unlike a typical SPA —
  **the server-rendered HTML already contains every current download link**, no JS execution needed:
  `curl -s -L "https://insideairbnb.com/get-the-data/"` returns ~570KB of HTML with plain `<a href>`
  tags like `https://data.insideairbnb.com/spain/comunidad-de-madrid/madrid/2026-06-20/visualisations/listings.csv`
  for every city Inside Airbnb currently tracks, always pointing at that city's *latest* snapshot.
- `robots.txt` on both `insideairbnb.com` and `data.insideairbnb.com` only disallows the
  `ia_archiver` user agent (Internet Archive's crawler) — no blanket disallow for a normal descriptive
  User-Agent, unlike the anti-bot posture this monorepo already treats as a hard exclusion for
  Idealista/Airbnb.
- All four candidate file URLs for a sample city returned `200 OK` via plain `curl -I`:
  `data/listings.csv.gz` (~10MB), `data/calendar.csv.gz` (~20MB), `data/reviews.csv.gz` (~161MB),
  `visualisations/listings.csv` (~6MB, uncompressed CSV, the one this feature actually uses).

Rejected alternative: Inside Airbnb also exposes a machine-readable JSON manifest of every
city/snapshot (found via the site's own internal Gatsby static-query request,
`/page-data/sq/d/<content-hash>.json`) with `dataRoot`/`publishDate`/`scrapeID` per city — richer
than scraping HTML, but the `<content-hash>` in that URL is an artifact of Gatsby's build process and
is not a documented, stable API; it can change on Inside Airbnb's next site rebuild with no
deprecation notice. The plain "Get the Data" HTML page **is** the documented, stable public surface
(it's the literal page humans are told to visit for downloads) — scraping its `<a href>` values is
version-stable in the way an internal build hash is not.

Rejected alternative: querying `data.insideairbnb.com` as an S3 bucket listing (`?prefix=...`) to
discover the latest date per city without needing the HTML page at all. Tried live — returns
`AccessDenied`; the bucket does not allow anonymous listing, only direct object GETs when the exact
key (including date) is already known.

### What gets downloaded: only `visualisations/listings.csv` per city, not the full `data/` files

Confirmed via `curl` HEAD request against Madrid's snapshot: the summary CSV (used by Inside Airbnb's
own map visualisation) already carries everything this feature needs — `price`, `room_type`,
`neighbourhood`/`neighbourhood_group`, `minimum_nights`, `number_of_reviews`,
`number_of_reviews_ltm`, `reviews_per_month`, `availability_365`, `calculated_host_listings_count`,
`latitude`/`longitude` — at ~6MB uncompressed for Madrid (the largest of the 9 markets), versus
~10MB *compressed* for the full `listings.csv.gz` (more columns: `property_type`, `bedrooms`,
`amenities`, host-verification flags, etc.) and ~20MB/~161MB compressed for `calendar.csv.gz`/
`reviews.csv.gz` respectively. Fetching, decompressing and parsing the full detail + calendar +
reviews files for 9 cities every quarter is meaningfully more backend work and storage for
characteristics this feature doesn't ask for (bedroom count, amenities) or an occupancy signal that
`availability_365` already approximates at a fraction of the cost. Same trade-off logic already
applied in `capitalScraper.ts`'s "one page per capital+portal, not two" decision — a periodic
snapshot doesn't need the same completeness as a live feed.

Known, documented data-quality gotcha (verified live in Madrid's actual CSV): many rows have an
**empty `price` field** — hotel-channel-managed listings, in particular, routinely omit it. The
parser treats an empty/unparseable price as `null`, never `0` or a fabricated value, and any
aggregate (median price) is computed only over rows where `price` is present — same "an unknown
datum is never substituted, it's excluded from that one aggregate" principle already documented
for `mediana()` and `capitalScraper.ts`'s `precio_m2_medio`.

Known gotcha: listing `id` values can exceed `Number.MAX_SAFE_INTEGER` (e.g. `1008521039996399925`,
a 19-digit id seen live in Madrid's data — modern Airbnb-generated listing ids, as opposed to
legacy short numeric ones). The column is stored and compared as `TEXT` end-to-end (parser, DB
column, TypeScript type), never parsed into a JS `number` or a Postgres `INTEGER`/`BIGINT`, since it
is only ever used as an opaque identity key, never arithmetic.

### Schema: one row per `(listing_id, snapshot_date)`, city and neighbourhood as plain columns

```sql
CREATE TABLE alquiler_turistico_listing (
  listing_id                     TEXT NOT NULL,
  ciudad                         TEXT NOT NULL,       -- 'madrid' | 'barcelona' | 'girona' | ...
  snapshot_date                  DATE NOT NULL,        -- Inside Airbnb's publish date for that city's snapshot
  nombre                         TEXT,
  barrio_grupo                   TEXT,                 -- neighbourhood_group (may be null)
  barrio                         TEXT,                 -- neighbourhood
  latitud                        DOUBLE PRECISION,
  longitud                       DOUBLE PRECISION,
  tipo_habitacion                TEXT,                 -- room_type, verbatim from source
  precio_noche                   NUMERIC,              -- NULL when the source row has no price
  estancia_minima_noches         INTEGER,
  num_resenas                    INTEGER,
  resenas_ultimos_12_meses       INTEGER,
  resenas_por_mes                NUMERIC,
  ultima_resena                  DATE,
  anuncios_del_anfitrion         INTEGER,              -- calculated_host_listings_count
  disponibilidad_365             INTEGER,              -- availability_365, the occupancy-proxy input
  actualizado_en                 TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (listing_id, snapshot_date)
);
CREATE INDEX idx_alquiler_turistico_ciudad_fecha ON alquiler_turistico_listing (ciudad, snapshot_date);
CREATE INDEX idx_alquiler_turistico_barrio ON alquiler_turistico_listing (ciudad, barrio);
```

`PRIMARY KEY (listing_id, snapshot_date)` rather than including `ciudad`: Airbnb listing ids are
globally unique across all cities (confirmed by the source data's own structure — a listing belongs
to exactly one region), so `ciudad` is redundant as a key component and only needed for filtering.
Re-running the importer against the same snapshot (same city, same date, e.g. a retried failed run)
upserts idempotently via `ON CONFLICT (listing_id, snapshot_date) DO UPDATE`, exactly like
`construirUpsertFilaQuery` in `importador.ts`.

`alquiler_turistico_estado` mirrors `importacion_estado`/`capital_scraper_estado`: singleton row,
`ultima_ejecucion`, `ultima_ejecucion_ok`, a count (`filas_importadas`), `error`. Both new tables are
also created by a new `ensureSchemaAirbnb.ts` at every backend startup (same reason
`ensureSchemaCapitales.ts` exists: production's `finanzas-db` volume already has data, so `init.sql`
alone won't create them there).

### Scheduling: reuse `calcularProximaAccion()`, weekly check interval

New env var `FINANZAS_INTERVALO_IMPORTACION_AIRBNB_HORAS` (default `168`, i.e. weekly) — deliberately
much longer than the Ministry importer's default 24h, since Inside Airbnb only republishes a given
city roughly once a quarter; checking weekly is already an order of magnitude more frequent than
necessary and costs one ~570KB HTML fetch plus, on the rare week something changed, up to 9 small CSV
downloads. The importer calls `calcularProximaAccion()` (imported from `importador.ts`, same as
`capitalScraper.ts` already does) so a redeploy resumes the wait instead of resetting it.

Per-city handling mirrors `pisos`'s "a portal that fails degrades the result, it doesn't abort the
run" principle: if the HTML page fails to fetch, the whole run logs an error and stops (nothing to
parse without it). If the HTML fetch succeeds but one city's CSV download or parse fails, that city
is skipped (logged), the other 8 still import, and the run is still marked `ultima_ejecucion_ok: true`
overall as long as at least one city succeeded — with the per-city failures visible in the log, same
spirit as `capitalScraper`'s "un capital que falla no aborta la vuelta".

### Occupancy estimate: `(365 - availability_365) / 365`, always labeled as an estimate

Computed in the frontend aggregation layer (`lib/alquilerTuristico.ts`), not stored pre-computed in
the DB — it's a derived view of `disponibilidad_365`, same "derive, don't duplicate" approach already
used for `roiSinApalancamientoPct` and `desviacionVsMedianaVentaPct`. Every UI surface showing it
carries the label "ocupación estimada" (never "ocupación" alone) and a tooltip/footnote explaining the
over-counting caveat from proposal.md's Non-goals. Listings with `disponibilidad_365 IS NULL` are
excluded from this average, not treated as 0% or 100% occupied.

### Frontend charting: `lightweight-charts`, one point per snapshot date — same library, explicit sparse-data framing

Reuses the same `createChart` + line/area series pattern as `PreciosVivienda.tsx`
(`finanzas/frontend`) and `crypto-trader`'s `PriceChart.tsx`, for visual/behavioral consistency
(zoom/pan, theme-reactive colors via the `--accent`/`--border` CSS variables and the existing
`MutationObserver` pattern on `data-theme`). The key difference from the Ministry price chart: that
one has decades of quarterly points and reads as a smooth line; this one starts with as few as ONE
point right after this feature ships (only the most recent Inside Airbnb snapshot exists in the DB
until the importer's next scheduled run picks up a new quarter) and grows very slowly. The UI must
not imply a false trend from 1–2 points — a minimum-points guard shows "aún no hay suficiente
histórico para ver una tendencia (vuelve el próximo trimestre)" instead of a nearly-flat two-dot line
that looks more meaningful than it is.

### Attribution: a persistent, visible credit line, not just a footnote in the README

CC BY 4.0 requires attribution to be reasonable given the medium. The new section carries a fixed,
non-dismissible line — "Datos: Inside Airbnb (insideairbnb.com), licencia CC BY 4.0" with a link to
insideairbnb.com — directly under the section heading, always visible whenever the section is open
(not hidden behind an info icon), matching the seriousness `locales`/`viabilidad` already gives its
own mandatory legal disclaimer (`AVISO_NO_CERTIFICA`).

## Risks / Trade-offs

[Risk: Inside Airbnb changes its "Get the Data" page's HTML structure (Gatsby rebuild, new markup) and
the scraper's link-extraction regex stops matching] → Mitigation: the extraction is a single, narrow
regex over `href` values matching `data\.insideairbnb\.com/spain/[^"]+/visualisations/listings\.csv`
— resilient to markup/CSS changes around it, only breaks if they change the URL domain or path
convention itself (which would also break every other tool that already depends on this exact
convention, including their own site). A failed extraction degrades to "0 cities found this run",
logged and visible in `alquiler_turistico_estado`, never a crash — same posture as every other
importer in this monorepo.

[Risk: a city not confirmed live at proposal time (regional coverage can change) silently
disappears or a new one appears] → Mitigation: the target city list is a fixed array of 9 slugs
(mirroring `capitales.ts`'s "a hand-written map is more reliable than any heuristic" convention,
verified live against the real page at proposal time), not derived dynamically from whatever the page
currently lists — a city Inside Airbnb drops just stops updating (its last snapshot stays in the DB,
clearly dated) rather than silently vanishing from the selector; adding a newly-covered city is a
one-line follow-up, not automatic.

[Risk: growing the `alquiler_turistico_listing` table indefinitely, one row per listing per quarter,
across 9 cities (~5,000–20,000 listings each) forever] → Mitigation: back-of-envelope at Madrid's
scale (the largest market, ~20k active listings), 4 snapshots/year, ~15 small columns per row, is on
the order of a few million rows and well under 1GB/year — comparable to or smaller than
`precio_vivienda_capital`'s growth rate, and no retention/pruning logic is introduced in v1 (documented
as a possible follow-up, not a current concern).

[Risk: quarterly-only data makes the feature feel "broken" or stale to a first-time user expecting
daily movement] → Mitigation: explicit non-goal in the UI copy itself (see "Frontend charting"
decision above) — the app tells the user why there's so little data yet, rather than the data
silently looking sparse with no explanation.
