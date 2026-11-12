# vine-resenas frontend

React 18 + Vite + keycloak-js. Base path `/vine-resenas/`, dev server on port 5193
(proxies `/vine-resenas/api` to the backend on 3018 and `/keycloak` to Keycloak).

- `npm run dev`, `npm run build`, `npm test`
- URLs: the list tab and search live in the query string (`/vine-resenas/?filtro=listos&q=cable`; values `faltan_fotos|falta_feedback|listos|resena_generada|en_espera`, unknown or missing = Todos), so Back/Forward restore them and links are shareable. `/vine-resenas/publicados` is the archive, `/vine-resenas/p/:asin` the detail (it returns to the exact list URL it came from) and `/vine-resenas/c/:token` the public guest page (never touches Keycloak). No nginx change is needed: every path under `/vine-resenas/` falls back to `index.html`.
- ASINs are links to `https://www.amazon.es/dp/<ASIN>` (new tab, `noopener noreferrer`); only valid ASINs (`[A-Z0-9]{10}`) become links.
- Roles: write = `admin`/`vine_admin`; read-only = `vine_invitado` (write controls are hidden).
- PWA: installable through `public/manifest.webmanifest` only. There is no service worker on purpose
  (no offline mode); "Add to home screen" works from the manifest.
