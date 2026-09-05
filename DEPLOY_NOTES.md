# DEPLOY_NOTES — Instrucciones para el despliegue actual

> **IMPORTANTE para Claude Code:** Lee estas instrucciones, ejecútalas durante el despliegue
> y **borra el contenido de este archivo** cuando termines (deja solo este bloque de cabecera vacío).
> Así evitamos que instrucciones antiguas se mezclen con futuros despliegues.

## Ofertas — migración de esquema + healthcheck honesto

### 1. Diagnóstico primero (antes de tocar nada)

Confirmar la avería y anotar lo que se ve, que es lo que dirá si la hipótesis
era correcta:

```bash
docker ps -a | grep ofertas
docker logs --tail 100 ofertas-backend
docker exec -it ofertas-db psql -U "$OFERTAS_DB_USER" -d "$OFERTAS_DB_NAME" -c '\dt' -c '\d busqueda'
```

Si falta la tabla `scraper_state` o la columna `busqueda.habilitada`, la
hipótesis se confirma y el paso 2 lo arregla.

### 2. Aplicar la migración

Copiar `ofertas/infra/migrations/` y `ofertas/infra/migrate.sh` al directorio
del compose de ofertas en el VPS (junto a `init.sql`), y ejecutar:

```bash
bash migrate.sh
```

Es idempotente y transaccional: se puede repetir sin riesgo. Imprime el
esquema resultante al terminar — comprobar que aparecen `scraper_state` con su
fila `id=1` y las columnas `habilitada`, `exclude_keywords`, `language_filter`
y `console_only` en `busqueda`.

### 3. Redesplegar el backend

La imagen trae el `/health` que sí comprueba Postgres y el arreglo del pool
(un reinicio de `ofertas-db` ya no mata el proceso):

```bash
docker compose pull ofertas-backend && docker compose up -d ofertas-backend
curl -s localhost:3006/ofertas/api/health   # dentro de la red, o vía el dominio
```

Debe responder `{"status":"ok","db":"ok",...}`. Si responde 503, la base de
datos no está accesible y el problema es ese, no la app.

### 4. Verificar la UI

Abrir `/ofertas/`: deben cargar las búsquedas guardadas y el indicador
"Scraper: Activo/Pausado" (ya no `…`), sin banner rojo.

### 5. Lo que esto NO arregla — los avisos de Telegram

Los avisos los manda `marketplace-watcher`, un proyecto aparte fuera de este
monorepo, que **todavía lee su propio `config.yaml` y no consume esta API**
(sigue siendo un follow-up pendiente). Nada de lo anterior le afecta. Si sigue
sin enviar ofertas, investigar allí:

```bash
systemctl list-timers | grep -i marketplace
journalctl -u marketplace-watcher --since '24 hours ago' --no-pager | tail -50
df -h /
```

Buscar un `403`/`429` de Wallapop (bloqueo de la IP del VPS) o un error de
parseo (cambio de su API interna). Ambos son fallos del scraper, no de Ofertas.
