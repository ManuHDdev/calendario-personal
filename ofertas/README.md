# Ofertas

UI de gestión de búsquedas guardadas para `marketplace-watcher`. Ver `openspec/changes/2026-07-27-add-ofertas-app/` para la propuesta, el diseño y los requisitos completos.

## Variables de entorno del backend

No se pudo escribir `ofertas/backend/.env.example` en este entorno (bloqueado por la política de permisos del sandbox sobre ficheros `.env*`). Crea manualmente `ofertas/backend/.env` con:

```
PORT=3006
OFERTAS_DB_HOST=localhost
OFERTAS_DB_PORT=5436
OFERTAS_DB_NAME=ofertas
OFERTAS_DB_USER=ofertas
OFERTAS_DB_PASSWORD=changeme
KEYCLOAK_CERTS_URL=http://localhost:8080/realms/calendario/protocol/openid-connect/certs
CORS_ORIGIN=http://localhost:5178
SCRAPER_API_KEY=changeme-generate-a-random-32-byte-token
```

`start-local.sh`/`start-local.ps1` ya inyectan estos valores automáticamente para desarrollo local (con `SCRAPER_API_KEY` por defecto `local-dev-scraper-key`, sobrescribible con la env var del mismo nombre antes de lanzar el script).

## Generar `SCRAPER_API_KEY`

Token estático de un solo uso, sin expiración ni rotación automática (misma postura ya aceptada para los tokens de `vine-bot` en este mismo VPS — ver design.md "Bearer token lifecycle"):

```bash
openssl rand -hex 32
```

Copia el valor generado en `SCRAPER_API_KEY` del backend de `ofertas` (local `.env` o la env var del servicio en producción). Nunca se loguea ni se devuelve en ninguna respuesta HTTP.

Este token es lo único que necesitará `marketplace-watcher` para llamar a `GET /ofertas/api/searches/active` — pero conectar el scraper real a esta API es un follow-up separado y explícito, no parte de este cambio (ver proposal.md "Explicitly out of scope").

## Seed inicial

Las dos búsquedas ya validadas por el propietario ("Juegos DS baratos", "Philips Hue baratos") se insertan automáticamente la primera vez que arranca el contenedor de Postgres, vía `ofertas/infra/init.sql` (mismo mecanismo de seed que usan `gastos`/`mapacyd` para el resto de su esquema).
