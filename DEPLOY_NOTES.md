# DEPLOY_NOTES — Instrucciones para el despliegue actual

> **IMPORTANTE para Claude Code:** Lee estas instrucciones, ejecútalas durante el despliegue
> y **borra el contenido de este archivo** cuando termines (deja solo este bloque de cabecera vacío).
> Así evitamos que instrucciones antiguas se mezclen con futuros despliegues.

---

## Cambios de esta entrega que requieren acción manual en producción

### 1. Actualizar Keycloak: roles y usuario

El realm de Keycloak en producción tiene el rol `PROPIETARIO` (antiguo).
Las aplicaciones ahora usan `admin`, `familia`, `invitado`.
Hay que añadir esos roles y asignar `admin` al usuario `propietario`.

Desde el VPS (los contenedores están corriendo), ejecutar:

```bash
bash /ruta/al/proyecto/scripts/keycloak-update-realm.sh http://localhost:8080 admin <KEYCLOAK_ADMIN_PASSWORD>
```

El script:
- Crea los roles `admin`, `familia`, `invitado` si no existen
- Asigna el rol `admin` al usuario `propietario`
- Actualiza los redirect URIs del cliente `calendario-frontend`

Si no se conoce la contraseña de admin de Keycloak, se puede obtener del
`docker-compose.yml` de producción o del `.env` del servidor.

### 2. Verificar acceso a sub-aplicaciones

Tras el despliegue, comprobar que se puede acceder a:
- `https://elbunkerdelingeniero.duckdns.org/` → Calendario
- `https://elbunkerdelingeniero.duckdns.org/storage/` → Storage
- `https://elbunkerdelingeniero.duckdns.org/panel/` → Panel (solo admin)
- `https://elbunkerdelingeniero.duckdns.org/mapacyd/` → MapaCYD

### 3. No hay cambios en nginx ni en Docker Compose

Esta entrega solo modifica código de las aplicaciones. No tocar nginx ni docker-compose de producción.

---

*Borrar el contenido de este archivo tras el despliegue.*
