## Why

The owner wants one place to look at public cameras of the four Extremaduran cities he cares about
(Cáceres, Badajoz, Mérida, Villanueva de la Serena) — "as many as possible".

Research before this proposal (see design.md):

- **DGT (Spain's traffic authority) publishes its camera catalogue as open data** (DATEX II, CC-BY,
  all of Spain except the Basque Country and Catalonia) at `nap.dgt.es`. This is the one legitimate,
  machine-readable, redistributable source — but it only has **road** cameras, not city-centre ones.
- **City webcams barely exist** for these four cities: nothing found for Villanueva de la Serena,
  no municipal feed found for Cáceres or Mérida. They can only be added by hand.
- Aggregators of misconfigured private cameras (Insecam-style) are deliberately out of scope:
  privacy and legality.

## What Changes

- **New subapp `camaras`** (Fastify + React + Postgres, admin-only), port 3017 / 5191.
- **Importer** of the DGT feed, filtered by radius around each city, scheduled like `finanzas`' importers.
- **Manual cameras** (image URL and/or page URL) added from the UI, for webcams found elsewhere.
- **Image proxy with cache** so the browser never talks to the origin and N viewers cost one request.
- **Map + grid UI**, city filter, accent-insensitive search, favourites, "no signal" handling.
- Registered in the AppLauncher (18 internal copies), nginx and CI. No new Keycloak role.

## Impact

- New: `camaras/`, `.github/workflows/camaras-ci.yml`, nginx blocks, openspec change.
- Edited: the 18 internal `AppLauncher` copies, `CLAUDE.md`, `nginx/calendario.conf`.
- Not changed: Keycloak realm (admin only), Panel, external repos' launcher copies (still pending).
