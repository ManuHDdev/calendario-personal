# DEPLOY_NOTES — Instrucciones para el despliegue actual

> **IMPORTANTE para Claude Code:** Lee estas instrucciones, ejecútalas durante el despliegue
> y **borra el contenido de este archivo** cuando termines (deja solo este bloque de cabecera vacío).
> Así evitamos que instrucciones antiguas se mezclen con futuros despliegues.

---

## Ofertas: columna `habilitada` en `busqueda` (ejecutar ANTES de fusionar a main)

El backend nuevo consulta/escribe la columna `habilitada` en `busqueda`, que no
existe todavía en la base de datos de producción (`ofertas-db`). Hay que
añadirla ANTES de desplegar el backend nuevo, si no las queries fallarán.

Desde el VPS:

```bash
docker exec ofertas-db psql -U ofertas -d ofertas -c "ALTER TABLE busqueda ADD COLUMN IF NOT EXISTS habilitada BOOLEAN NOT NULL DEFAULT TRUE;"
docker exec ofertas-db psql -U ofertas -d ofertas -c "CREATE INDEX IF NOT EXISTS idx_busqueda_activo_habilitada ON busqueda(activo, habilitada);"
```

Además, petición explícita del propietario para esta entrega: dejar
activas solo las búsquedas de consolas (console_only = true) y pausar el
resto (Juegos DS baratos, Philips Hue baratos) hasta que la nueva UI de
activar/desactivar esté desplegada:

```bash
docker exec ofertas-db psql -U ofertas -d ofertas -c "UPDATE busqueda SET habilitada = console_only WHERE activo = true;"
```

Es aditivo y reversible: no borra nada, no cambia `activo`, y el backend
viejo ignora la columna nueva por completo.
