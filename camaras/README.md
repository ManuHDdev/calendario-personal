# Cámaras

Cámaras públicas de **Cáceres, Badajoz, Mérida y Villanueva de la Serena**. Solo `admin`.
Documentación completa en la sección «Cámaras» de `CLAUDE.md`.

## Desarrollo local

```bash
cd camaras/infra && docker compose -f docker-compose.local.yml up -d      # Postgres :5445
cd ../backend && npm install
CAMARAS_DB_PORT=5445 CAMARAS_DB_PASSWORD=camaras123 npm run dev           # :3017
cd ../frontend && npm install && npm run dev                              # :5191/camaras/
```

## Verificar el feed de la DGT (haz esto primero)

Los tests usan fixtures sintéticos; esto es lo que demuestra que el feed real encaja con el parser:

```bash
cd camaras/backend
npm run smoke                 # cobertura: cámaras reconocidas, por ciudad y por campo
npm run smoke -- --imagenes   # además descarga las 10 primeras imágenes cercanas
```

Variable opcional `CAMARAS_DGT_FEED_URL` (por defecto DATEX II v3.6; también existe
`camaras_datex2_v37.xml`). Si da 0 cámaras, guarda el XML y ajusta `src/services/dgtParser.ts`.

## Despliegue

`.github/workflows/camaras-ci.yml` (en cada push a `main` que toque `camaras/**`). La primera vez
crea en el VPS `/home/manu/camaras/.env` con:

```
CAMARAS_DB_NAME=camaras
CAMARAS_DB_USER=camaras
CAMARAS_DB_PASSWORD=<generada>
KEYCLOAK_CERTS_URL=<igual que el resto de subapps>
CORS_ORIGIN=https://elbunkerdelingeniero.duckdns.org
```

Los bloques `/camaras/` de nginx los despliega el pipeline de Calendario (`nginx/calendario.conf`).
Después del primer arranque, pulsa «Actualizar catálogo» en la UI (o espera a la importación inicial,
que se lanza sola) y revisa la banda de estado.
