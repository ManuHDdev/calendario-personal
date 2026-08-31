# DEPLOY_NOTES — Instrucciones para el despliegue actual

> **IMPORTANTE para Claude Code:** Lee estas instrucciones, ejecútalas durante el despliegue
> y **borra el contenido de este archivo** cuando termines (deja solo este bloque de cabecera vacío).
> Así evitamos que instrucciones antiguas se mezclen con futuros despliegues.

## Alta de la subapp `pisos`

El pipeline (`.github/workflows/pisos-ci.yml`) construye las imágenes, las sube
a GHCR, copia `docker-compose.prod.yml` e `init.sql` a `/home/manu/pisos` y
levanta los contenedores. Lo único que NO puede hacer solo es crear el `.env`,
porque contiene secretos que no viven en el repositorio.

### La forma corta: un solo comando

Desde una copia del repo, en la máquina que tenga la clave SSH del VPS:

```bash
bash scripts/pisos-setup-vps.sh
```

Pide el token y el chat id, **prueba el bot antes de tocar nada** (si no has
pulsado «Empezar» te lo dice ahí mismo en vez de fallar en silencio dentro de
una semana), escribe el `.env` con la contraseña generada en el propio
servidor, levanta los contenedores y espera a que el backend responda.

Es idempotente: al repetirlo conserva la contraseña de base de datos que ya
hubiera — regenerarla dejaría la base inaccesible.

El resto de esta sección es lo mismo a mano, por si prefieres verlo paso a paso.

### Alternativa sin terminal: provisionar desde GitHub Actions

Si no tienes a mano la maquina con la clave SSH (por ejemplo, desde el movil),
el workflow `Pisos · Provisionar VPS` hace lo mismo usando la clave que ya
tiene el runner. Requiere anadir una sola vez dos secretos de repositorio en
Settings -> Secrets and variables -> Actions:

| Secreto | Valor |
|---|---|
| `PISOS_TELEGRAM_BOT_TOKEN` | el token de @BotFather |
| `PISOS_TELEGRAM_OWNER_CHAT_ID` | tu chat id de Telegram |

Despues, Actions -> «Pisos · Provisionar VPS» -> Run workflow. Comprueba el
bot, escribe el `.env`, levanta los contenedores y espera al health check.
GitHub enmascara los secretos en los logs, asi que el token no aparece.

### Paso obligatorio en el VPS, ANTES del primer despliegue

`docker compose` lee las variables de `/home/manu/pisos/.env`. Sin ese fichero,
`POSTGRES_PASSWORD` llega vacío y el contenedor de Postgres se niega a
arrancar, así que `pisos-backend` (que espera a que esté sano) tampoco sube.
Por eso las tres de base de datos van con `:?` en el compose: sin ellas, el
despliegue aborta al instante diciendo cuál falta.

`KEYCLOAK_CERTS_URL` y `CORS_ORIGIN` NO hacen falta en el `.env`: el backend ya
trae como valor por defecto exactamente el de producción, el mismo que usan las
otras subapps. Solo póngalos si algún día cambian.

```bash
ssh -p 2269 manu@87.216.88.165
mkdir -p /home/manu/pisos
cat > /home/manu/pisos/.env <<'ENV'
PISOS_DB_NAME=pisos
PISOS_DB_USER=pisos
PISOS_DB_PASSWORD=<la contraseña generada para este despliegue>
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

### Si el primer despliegue ya falló sin el .env

Es lo esperado, y no deja nada roto: el volumen se crea pero Postgres nunca
llega a inicializarse (aborta antes de `initdb` por no tener contraseña), así
que `init.sql` sigue pendiente de ejecutarse. Tras crear el `.env`:

```bash
cd /home/manu/pisos
docker compose -f docker-compose.prod.yml up -d
```

Si `pisos-db` siguiera sin arrancar, `docker compose -f docker-compose.prod.yml
down -v` y repetir. El `-v` borra el volumen: aquí es seguro porque todavía no
hay ni un dato dentro, pero NO lo uses una vez la app lleve anuncios guardados.

### El TELEGRAM_OWNER_CHAT_ID

En un chat privado, el `chat_id` es el ID de usuario de Telegram del
propietario. Si no lo sabes, escríbele algo al bot y luego, desde una copia del
repo:

```bash
cd pisos/backend
TELEGRAM_BOT_TOKEN=<token> npm run telegram:chat-id
```

No metas la URL de `getUpdates` en el navegador: lleva el token dentro y acaba
en el historial.

**Requisito que se olvida siempre:** un bot de Telegram NO puede escribir el
primero a alguien que nunca le ha hablado. Hay que abrir el bot y pulsar
«Empezar» una vez; si no, los envíos fallan con `403 bot can't initiate
conversation with a user`, aunque el token y el chat id sean correctos.

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
