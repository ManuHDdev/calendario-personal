## Key decisions

### The DGT parser matches records by shape, not by path
It was written **without access to the real feed** (the development sandbox could not reach
`nap.dgt.es`). Instead of hard-coding an XML path — exactly what differs between DATEX II v1, v3.6 and
v3.7 — it finds the deepest node holding coordinates plus an image URL, tolerating namespace prefixes
and the v3 multilingual `<values><value lang>` pattern. Name/id fall back to the parent node.
Tests use synthetic fixtures; `npm run smoke -- --imagenes` is the real verification and must be run
from a machine with internet access after the first deploy. A parse that yields 0 cameras throws and
is surfaced in the UI (`importacion_estado`), never stored as a successful empty import.

### Failed import never empties the catalogue
`retirada` (the DGT stopped publishing it) is set only after a successful import that produced at least
one nearby camera. The upsert never touches `favorita` or `activo`, so a camera the owner hid does not
come back and a favourite survives. The unique key `(origen, external_id)` deliberately ignores `activo`.

### Image proxy
`<img>` cannot send `Authorization`, so the image route accepts `?token=` (same trade-off as
`storage`/`descargas`; nginx `access_log off`, Fastify serializer redacts it). The proxy validates
every hop (≤3 redirects) against private IP ranges, caps size (5 MB) and time (8 s), and only passes
raster image types (no SVG). In-memory cache with in-flight de-duplication and a short negative cache.
Accepted limit: DNS rebinding, since URLs are written only by the owner or the official feed.

### "No signal" must never look like a live image
On a failed refresh the UI keeps the last good frame, greyed out and labelled, with a retry button;
the backend answers 502 (origin failure) rather than 404. Frames carry their capture time.

### Cities are code, not data
`ciudades.ts` is a fixed list (same reasoning as `capitales.ts` in finanzas). The DB stores the slug as
text so adding a city never needs a migration.

## Out of scope
- Live video (HLS/MJPEG): only still images that refresh.
- Automatic discovery of city webcams: none found; manual entry instead.
- Updating the 3 external repos' launcher copies.
