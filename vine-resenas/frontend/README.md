# vine-resenas frontend

React 18 + Vite + keycloak-js. Base path `/vine-resenas/`, dev server on port 5193
(proxies `/vine-resenas/api` to the backend on 3018 and `/keycloak` to Keycloak).

- `npm run dev`, `npm run build`, `npm test`
- Roles: write = `admin`/`vine_admin`; read-only = `vine_invitado` (write controls are hidden).
- PWA: installable through `public/manifest.webmanifest` only. There is no service worker on purpose
  (no offline mode); "Add to home screen" works from the manifest.
