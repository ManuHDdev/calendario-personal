# DEPLOY_NOTES — Instrucciones para el despliegue actual

> **IMPORTANTE para Claude Code:** Lee estas instrucciones, ejecútalas durante el despliegue
> y **borra el contenido de este archivo** cuando termines (deja solo este bloque de cabecera vacío).
> Así evitamos que instrucciones antiguas se mezclen con futuros despliegues.

## `locales` — fases 5, 6 y 9 (rastreadores de portales + planificador + frontend)

La subapp pasa de "solo backend de consulta" a **rastreador completo con
frontend**. Novedades de este despliegue frente al anterior:

- Nuevo contenedor `locales-frontend` (imagen `ghcr.io/manuhddev/locales-frontend`).
- Nuevo bloque `location /locales/` en nginx — **se aplica IN SITU** (el fichero
  del servidor ha divergido del repo).
- El AppLauncher ya trae la entrada `locales` en las 14 imágenes de frontend —
  se propaga solo al redesplegar cada subapp; no hay que tocar nada a mano.
- El planificador arranca dentro de `locales-backend`: en cuanto haya una
  búsqueda guardada y `scraper_state.running = true`, rastrea cada 15 min.

### 1. `/home/manu/locales/.env` en el VPS

Si ya existe de un despliegue anterior, solo revisa que estén las de Telegram.
Si es la primera vez:

```bash
mkdir -p /home/manu/locales
cat > /home/manu/locales/.env <<'EOF'
LOCALES_DB_NAME=locales
LOCALES_DB_USER=locales
LOCALES_DB_PASSWORD=<openssl rand -hex 24>

# Misma clave que ya usan paraisos y ruta.
ORS_API_KEY=<tu clave de openrouteservice.org>

# Bot propio, distinto del de pisos y del de gastos (paso 4).
TELEGRAM_BOT_TOKEN=
TELEGRAM_OWNER_CHAT_ID=
EOF
chmod 600 /home/manu/locales/.env
```

### 2. Desplegar (lo hace el workflow `locales-ci.yml` al mergear a `main`)

Construye backend + frontend, sube ambas imágenes a GHCR, copia
`docker-compose.prod.yml` + `init.sql` al VPS y levanta `locales-db` +
`locales-backend` + `locales-frontend`.

`init.sql` es idempotente: en un despliegue sobre una BD ya existente añade las
columnas `busqueda.habilitada` / `busqueda.notificar` y cambia la clave única de
`anuncio` a `(busqueda_id, portal, portal_id)` sin perder datos.

Comprobación:

```bash
curl -s localhost:3013/locales/api/health
docker logs locales-backend --tail 40   # motor de rutas + aviso de padrón + "planificador arrancado"
docker compose -f /home/manu/locales/docker-compose.prod.yml ps
```

### 3. nginx — aplicar el bloque IN SITU

El fichero del servidor es `/home/manu/nginx-shared/conf.d/elbunkerdelingeniero.conf`
(ha divergido del repo — **no copiar `nginx/calendario.conf` encima**). Añadir,
junto a los otros bloques de subapp, el contenido del bloque `location /locales/`
que está en `nginx/calendario.conf` de este repo (proxy a `http://locales-frontend:80`,
`proxy_read_timeout 180s`). Después:

```bash
docker exec <contenedor-nginx> nginx -t && docker exec <contenedor-nginx> nginx -s reload
```

Verifica que `https://elbunkerdelingeniero.duckdns.org/locales/` carga y pide login.

### 4. Bot de Telegram (opcional pero recomendado)

1. [@BotFather](https://t.me/BotFather) → `/newbot` → guarda el token.
2. Escríbele algo al bot.
3. Abre `https://api.telegram.org/bot<TOKEN>/getUpdates` y lee `message.chat.id`.
4. Mete `TELEGRAM_BOT_TOKEN` y `TELEGRAM_OWNER_CHAT_ID` en el `.env` y
   `docker compose -f docker-compose.prod.yml up -d locales-backend`.

Sin esas variables la app y el rastreador funcionan igual, solo sin avisos.

### 5. IMPORTAR EL PADRÓN (imprescindible, y no lo hace el workflow)

**Hasta hacerlo, todo veredicto es "sin datos"** y el planificador no marcará
ningún anuncio como viable. La imagen de producción solo lleva `dist`:

```bash
docker exec -it locales-backend node dist/padron/cli.js madrid
# comprueba la salida, luego el resto:
docker exec -it locales-backend node dist/padron/cli.js andalucia valenciana baleares canarias murcia cataluna galicia
# o de una vez (tarda, sale a Overpass comunidad por comunidad):
docker exec -it locales-backend node dist/padron/cli.js todas
```

Qué mirar: `farmacias: 0` en una comunidad → Overpass saturado, reintenta luego
(el importador no borra nada al fallar). Error de `Oficial Madrid` con "No se
reconocen las columnas" + la cabecera real → tocar el objeto `ALIAS` en
`locales/backend/src/padron/oficial/madrid.ts` (importador escrito sin ver el
CSV real; es el fallo más probable).

### 6. SMOKE de los portales (los parsers NO están verificados contra el portal real)

Los 10 rastreadores están escritos desde el patrón de `pisos` sin salida a
internet en el entorno de desarrollo. La primera pasada con red real dirá cuáles
aciertan:

```bash
docker exec -it locales-backend node dist/smoke.js locales "Madrid"
docker exec -it locales-backend node dist/smoke.js farmacias "Madrid"
```

Mira la **cobertura por campo** (`📊 precio X/N · superficie X/N · …`). Un portal
que devuelve 0 anuncios o todo a `null` necesita un ajuste de selectores en su
`portales/<portal>.ts` (bloque `─────`). Es esperable en varios: anótalos y se
ajustan en un follow-up, no bloquean el resto.

### 7. Probar de punta a punta

1. Entra en `/locales/`, crea una búsqueda de tipo `local` (zona "Madrid",
   portales fotocasa + pisoscom) y otra de tipo `farmacia`.
2. "Rastrear ahora" en cada una → mira `encontrados` / `guardados` / `fallos`.
3. El feed de Anuncios debe mostrar el semáforo y los metros a la farmacia.
4. Pestaña "Comprobar": `Gran Vía 1, Madrid` → veredicto + mapa.
5. Desde el móvil, al bot: comparte una ubicación o `/comprobar Gran Vía 1, Madrid`.

### Lo que NO hay que hacer

- **No tocar Keycloak.** `locales` no añade ningún rol: solo `admin`.
- **No levantar `locales-valhalla`.** Perfil `valhalla`, apagado a propósito
  (~1 h de teselas, varios GB). Con ORS funciona desde el minuto uno.
- **No copiar `nginx/calendario.conf` al servidor.** Solo el bloque, a mano.
