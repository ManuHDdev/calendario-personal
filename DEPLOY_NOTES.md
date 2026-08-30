# DEPLOY_NOTES — Instrucciones para el despliegue actual

> **IMPORTANTE para Claude Code:** Lee estas instrucciones, ejecútalas durante el despliegue
> y **borra el contenido de este archivo** cuando termines (deja solo este bloque de cabecera vacío).
> Así evitamos que instrucciones antiguas se mezclen con futuros despliegues.

## Alta de la subapp `pisos`

1. **Variables nuevas en el `.env` del VPS** (junto a las del resto de subapps):

   ```
   PISOS_DB_NAME=pisos
   PISOS_DB_USER=pisos
   PISOS_DB_PASSWORD=<generar>
   # Opcionales, con valor por defecto razonable:
   PISOS_INTERVALO_MINUTOS=15
   PISOS_PAGINAS_POR_PORTAL=2
   ```

2. **Bot de Telegram** (necesario para los avisos al móvil; sin él la app
   rastrea y guarda, pero no avisa):

   - `@BotFather` → `/newbot` → guarda el token en `TELEGRAM_BOT_TOKEN`.
   - Escríbele algo al bot y saca tu `chat.id` de
     `https://api.telegram.org/bot<TOKEN>/getUpdates` → `TELEGRAM_OWNER_CHAT_ID`.

   `gastos` ya usa esas dos variables para SU bot. Si el `.env` es compartido,
   crea un bot distinto para pisos y separa las variables por servicio en el
   compose, o los avisos de pisos acabarán saliendo por el bot de gastos.

3. **Nginx**: `nginx/calendario.conf` trae ya el bloque `/pisos/`. Recargar
   con `nginx -t && nginx -s reload` tras copiarlo.

4. **Keycloak**: se han añadido los puertos locales `5183` y `5184` a los
   redirect URIs. El `5183` (ruta) **faltaba desde antes** — sin él, el login
   local de Ruta se rompía al ejecutar el script. Aplicar con:

   ```bash
   bash scripts/keycloak-update-realm.sh http://localhost:8080 admin <password>
   ```

   No afecta a producción: el redirect de producción sigue siendo el mismo.

5. **Comprobación obligatoria tras desplegar** — los tests de CI corren contra
   fixtures y NO prueban que los portales sigan sirviendo lo esperado:

   ```bash
   docker exec -it pisos-backend node -e "process.exit(0)"   # contenedor vivo
   curl -s https://elbunkerdelingeniero.duckdns.org/pisos/api/health
   ```

   Y desde una copia del repo (necesita las devDependencies, así que en local,
   no en el contenedor de producción):

   ```bash
   cd pisos/backend && npm run smoke -- todos "Badajoz" --lat 38.8794 --lng -6.9707 --radio 30
   ```

   Si un portal da cero resultados o cobertura muy baja por campo, ha cambiado
   su estructura: ajustar el bloque de conocimiento de `portales/<portal>.ts`.
