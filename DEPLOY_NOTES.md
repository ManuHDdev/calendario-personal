# DEPLOY_NOTES — Instrucciones para el despliegue actual

> **IMPORTANTE para Claude Code:** Lee estas instrucciones, ejecútalas durante el despliegue
> y **borra el contenido de este archivo** cuando termines (deja solo este bloque de cabecera vacío).
> Así evitamos que instrucciones antiguas se mezclen con futuros despliegues.

## Alta de la subapp `pisos`

El pipeline (`.github/workflows/pisos-ci.yml`) construye las imágenes, las sube
a GHCR, copia `docker-compose.prod.yml` e `init.sql` a `/home/manu/pisos` y
levanta los contenedores. Lo único que NO puede hacer solo es crear el `.env`,
porque contiene secretos que no viven en el repositorio.

### Paso obligatorio en el VPS, ANTES del primer despliegue

`docker compose` lee las variables de `/home/manu/pisos/.env`. Sin ese fichero,
`POSTGRES_PASSWORD` llega vacío y el contenedor de Postgres se niega a
arrancar, así que `pisos-backend` (que espera a que esté sano) tampoco sube.

```bash
ssh -p 2269 manu@87.216.88.165
mkdir -p /home/manu/pisos
cat > /home/manu/pisos/.env <<'ENV'
PISOS_DB_NAME=pisos
PISOS_DB_USER=pisos
PISOS_DB_PASSWORD=<la contraseña generada para este despliegue>
KEYCLOAK_CERTS_URL=http://calendario-keycloak:8080/keycloak/realms/calendario/protocol/openid-connect/certs
CORS_ORIGIN=https://elbunkerdelingeniero.duckdns.org
PISOS_INTERVALO_MINUTOS=15
PISOS_PAGINAS_POR_PORTAL=2
TELEGRAM_BOT_TOKEN=<token del bot de pisos, de @BotFather>
TELEGRAM_OWNER_CHAT_ID=<ver abajo>
ENV
chmod 600 /home/manu/pisos/.env
```

`TELEGRAM_BOT_TOKEN` y `TELEGRAM_OWNER_CHAT_ID` son **de este `.env` y solo de
este**: `gastos` usa esas mismas dos variables para SU bot, que es
conversacional y distinto. Cada subapp tiene su directorio y su `.env` en el
VPS, así que no se pisan — pero no reutilices el token de gastos aquí, o los
avisos de pisos saldrán por el bot equivocado.

### Sacar el TELEGRAM_OWNER_CHAT_ID

Escríbele algo al bot desde Telegram y luego, desde una copia del repo:

```bash
cd pisos/backend
TELEGRAM_BOT_TOKEN=<token> npm run telegram:chat-id
```

Imprime los chats que le han escrito al bot. No metas la URL de `getUpdates` en
el navegador: lleva el token dentro y acaba en el historial.

### Comprobación tras desplegar

```bash
curl -s https://elbunkerdelingeniero.duckdns.org/pisos/api/health
docker logs pisos-backend --tail 30    # debe decir "Rastreador programado cada ~15 min"
```

Si el log dice `TELEGRAM_BOT_TOKEN/TELEGRAM_OWNER_CHAT_ID sin configurar`, el
rastreo funciona pero no habrá avisos: revisa el `.env` y `docker compose up -d`.

### Comprobación de los portales (IMPORTANTE, no la salta CI)

Los tests corren contra fixtures y NO prueban que Fotocasa/pisos.com/Wallapop
sigan sirviendo hoy lo esperado — CI no sale a internet. Desde una copia local
del repo:

```bash
cd pisos/backend && npm install
npm run smoke -- todos "Badajoz" --lat 38.8794 --lng -6.9707 --radio 30
```

Fíjate en la **cobertura por campo** que imprime, no solo en el número de
anuncios: un parser medio roto devuelve anuncios con todo a `null` y aun así
"funciona". Cero resultados o cobertura muy baja en un portal → ha cambiado su
estructura; ajustar el bloque marcado en `pisos/backend/src/portales/<portal>.ts`.

### Keycloak

Se han añadido los puertos locales `5183` y `5184` a los redirect URIs. El
`5183` (ruta) **faltaba desde su alta** y rompía su login local al ejecutar el
script. Solo afecta a desarrollo local; producción no cambia:

```bash
bash scripts/keycloak-update-realm.sh http://localhost:8080 admin <password>
```

### Nginx

`nginx/calendario.conf` ya trae el bloque `/pisos/`, y el pipeline de
Calendario lo publica y recarga nginx solo. El bloque usa `set $svc_pisos ...`
antes de `proxy_pass`, que hace que nginx resuelva el host en cada petición y
no al cargar la configuración: por eso `nginx -t` pasa aunque los contenedores
de pisos todavía no existan, y el orden de despliegue no importa.
