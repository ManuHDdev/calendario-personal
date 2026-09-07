# DEPLOY_NOTES — Instrucciones para el despliegue actual

> **IMPORTANTE para Claude Code:** Lee estas instrucciones, ejecútalas durante el despliegue
> y **borra el contenido de este archivo** cuando termines (deja solo este bloque de cabecera vacío).
> Así evitamos que instrucciones antiguas se mezclen con futuros despliegues.

## Subapp nueva: `locales` (fase 1 — solo backend)

Rastreador de locales y farmacias en venta con verificación de distancia peatonal.
De momento **solo backend**: no hay frontend, así que **no toca nginx ni el
AppLauncher**. Se usa desde el bot de Telegram y por API.

### 1. Crear `/home/manu/locales/.env` en el VPS

```bash
mkdir -p /home/manu/locales
cat > /home/manu/locales/.env <<'EOF'
LOCALES_DB_NAME=locales
LOCALES_DB_USER=locales
LOCALES_DB_PASSWORD=<genera uno: openssl rand -hex 24>

# Misma clave que ya usan paraisos y ruta.
ORS_API_KEY=<tu clave de openrouteservice.org>

# Bot propio, distinto del de pisos y del de gastos (ver paso 3).
TELEGRAM_BOT_TOKEN=
TELEGRAM_OWNER_CHAT_ID=
EOF
chmod 600 /home/manu/locales/.env
```

`LOCALES_MOTOR_DISTANCIA` no hace falta ponerla: por defecto es `ors`.

### 2. Desplegar

El workflow `locales-ci.yml` se dispara solo al mergear a `main` con cambios en
`locales/**`: construye la imagen, la sube a GHCR, copia el compose y el
`init.sql` al VPS y levanta `locales-db` + `locales-backend`.

Comprobación:

```bash
curl -s localhost:3013/locales/api/health
docker logs locales-backend --tail 30
```

En el log de arranque tienen que aparecer dos líneas:
- qué motor de distancias se ha cargado y con qué tope diario;
- **un aviso de que el padrón está VACÍO** (correcto en este punto).

### 3. Dar de alta el bot de Telegram

1. [@BotFather](https://t.me/BotFather) → `/newbot` → guarda el token.
2. Escríbele algo al bot.
3. `cd /home/manu && docker exec locales-backend node -e "..."` no vale aquí;
   lo más simple es abrir
   `https://api.telegram.org/bot<TOKEN>/getUpdates` en el navegador y leer
   `message.chat.id`.
4. Mete las dos variables en el `.env` y `docker compose -f docker-compose.prod.yml up -d locales-backend`.

Sin esas dos variables la app funciona igual, solo se queda sin bot.

### 4. IMPORTAR EL PADRÓN (imprescindible, y no lo hace el workflow)

**Hasta hacerlo, toda comprobación devuelve "sin datos".** Es el comportamiento
correcto —un padrón vacío no demuestra que no haya farmacias cerca— pero la app
no sirve de nada hasta ejecutarlo.

La imagen de producción solo lleva `dist` (no hay `ts-node`), así que el CLI se
invoca sobre el compilado, no con `npm run padron`:

```bash
docker exec -it locales-backend node dist/padron/cli.js madrid
```

Empieza por Madrid, comprueba la salida, y luego añade las demás:

```bash
docker exec -it locales-backend node dist/padron/cli.js andalucia valenciana baleares canarias murcia cataluna galicia
# o, si quieres todo de una vez (tarda; sale a Overpass comunidad por comunidad):
docker exec -it locales-backend node dist/padron/cli.js todas
```

**Qué mirar en la salida:**

- `farmacias: 0` en una comunidad → Overpass falló o está saturado. Reintenta
  esa comunidad más tarde; el importador no borra nada cuando falla.
- Un error de `Oficial Madrid` que menciona **"No se reconocen las columnas"**
  seguido de la cabecera real del CSV → el portal de datos abiertos ha cambiado
  los nombres de columna. El único sitio a tocar es el objeto `ALIAS` en
  `locales/backend/src/padron/oficial/madrid.ts`. Este importador se escribió sin
  poder ver el CSV real, así que es el fallo más probable de todo el despliegue.
- `municipios con padrón incompleto` alto → normal al principio; OSM no tiene la
  población de todos los municipios. En esos municipios no se emitirán verdes,
  solo ámbares, que es la dirección segura del error.

### 5. Probar de punta a punta

Desde el móvil, al bot:

- Comparte una **ubicación** cualquiera de Madrid.
- O manda `/comprobar Gran Vía 1, Madrid`.

Debe contestar con las farmacias más cercanas, sus metros **caminando**, el
veredicto de color y el aviso de que no certifica.

### Lo que NO hay que hacer en este despliegue

- **No tocar `nginx/calendario.conf`.** No hay frontend todavía, así que no hay
  nada que enrutar. (Y recuerda que el fichero del servidor ha divergido del
  repo: cuando llegue el frontend, el bloque `location /locales/` se aplica
  **in situ**, no copiando el fichero.)
- **No tocar Keycloak.** `locales` no añade ningún rol nuevo: solo `admin`.
- **No levantar `locales-valhalla`.** Está tras el perfil `valhalla` y apagado a
  propósito: construir las teselas de España tarda ~1 h y ocupa varios GB. Con
  ORS funciona desde el minuto uno. Antes de plantearlo, mira `free -h` y
  `df -h` del VPS.
