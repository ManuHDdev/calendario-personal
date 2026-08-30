# Pisos — rastreador de anuncios de vivienda en venta

Vigila Fotocasa, pisos.com y Wallapop cada pocos minutos y avisa por Telegram
en cuanto aparece un piso que cumple los criterios guardados. Existe porque un
piso barato en España dura horas: el valor no está en buscar mejor, está en
enterarse antes.

- Frontend: `http://localhost:5184/pisos/` · producción `/pisos/`
- Backend: `:3012`, rutas bajo `/pisos/api`
- Base de datos: PostgreSQL `pisos` (local `:5441`)
- Acceso: solo rol `admin` (uso exclusivo del propietario)

## Cómo funciona

1. Se guarda una **búsqueda**: zona, precio, m², habitaciones, baños,
   requisitos (ascensor/garaje/terraza) y en qué portales mirar.
2. Un **planificador dentro del propio backend** (`services/planificador.ts`)
   recorre cada ~15 min todas las búsquedas activas. No es un cron externo ni
   depende de ningún asistente: mientras el contenedor esté levantado
   (`restart: unless-stopped`), rastrea solo.
3. Cada portal devuelve sus anuncios, se **normalizan** a una forma común y se
   aplica el filtro de criterios en el backend (`services/criterios.ts`).
4. Los anuncios se guardan con UPSERT. Los que son **nuevos** —y los que han
   **bajado de precio**— se mandan por Telegram y se marcan como sin ver en la
   UI.

### Dos principios que explican casi todo el código

**Un dato desconocido no descarta un anuncio.** Los portales solo publican los
extras en la ficha, no en el listado. Si un anuncio no dice si tiene ascensor,
`ascensor` es `null` ("no lo sé") y pasa el filtro; solo se descarta un `false`
explícito ("sin ascensor"). Tratar el silencio como un "no" haría desaparecer
la mayoría de los pisos válidos sin que nadie se entere.

**Un rastreo parcial nunca debe parecerse a uno completo.** Si Fotocasa
devuelve 403 pero pisos.com responde, el rastreo continúa con lo que tiene y
guarda el motivo del fallo en `busqueda.ultimo_rastreo_error`, que la UI
enseña en rojo sobre esa búsqueda. Mismo criterio que `plan.fullCoverage` en la
subapp `ruta`.

## Portales

| Portal | Cómo se lee | Filtros que aplica el portal |
|---|---|---|
| Fotocasa | Estado embebido de su SPA, con JSON-LD de reserva | precio, m², habitaciones |
| pisos.com | JSON-LD de schema.org | precio, m², habitaciones |
| Wallapop | API interna `api.wallapop.com/api/v3/search` | precio y radio |

Wallapop necesita **coordenadas y radio**, no un nombre de zona: sin ellos, esa
búsqueda salta ese portal con un motivo explícito en lugar de barrer España
entera. Los otros dos van por nombre de zona.

Wallapop tampoco expone m² ni habitaciones estructurados (los anuncios los
escribe un particular), así que esos datos se extraen del título y la
descripción en `portales/normalizar.ts`. Por eso el filtro fino se aplica
igual para los tres portales, después de normalizar, y no delegando en el
buscador de cada uno.

Todo el conocimiento específico de un portal está en un bloque marcado dentro
de `portales/<portal>.ts`. Si un portal cambia, ese es el único sitio a tocar.

## Comprobar que los portales siguen funcionando

Los tests unitarios corren contra fixtures y verifican la lógica de parseo,
pero **no pueden verificar que los portales sigan sirviendo hoy lo esperado**:
ni CI ni un entorno sin salida a internet llegan a ellos. Para eso está el
smoke, que sale a la red de verdad:

```bash
cd pisos/backend
npm run smoke -- fotocasa "Badajoz"
npm run smoke -- pisos "Madrid" --max 250000
npm run smoke -- wallapop "Badajoz" --lat 38.8794 --lng -6.9707 --radio 30
npm run smoke -- todos "Badajoz" --lat 38.8794 --lng -6.9707 --radio 30
```

Enseña cuántos anuncios ha entendido y **qué cobertura tiene cada campo**
(precio, m², habitaciones…). Esa cobertura es la métrica que importa: un
parser medio roto devuelve anuncios con todo a `null` y aun así "funciona".

Cero resultados o cobertura muy baja en un portal → ese portal ha cambiado su
estructura; hay que ajustar su bloque de conocimiento.

**Ejecútalo la primera vez que despliegues**, antes de fiarte de que el
rastreador está encontrando cosas.

## Bot de Telegram

Emite avisos, no escucha comandos (a diferencia del bot de `gastos`, que sí es
conversacional). Alta:

1. Habla con [@BotFather](https://t.me/BotFather) → `/newbot` → guarda el token.
2. Escríbele algo a tu bot y visita
   `https://api.telegram.org/bot<TOKEN>/getUpdates` para leer tu `chat.id`.
3. Configura `TELEGRAM_BOT_TOKEN` y `TELEGRAM_OWNER_CHAT_ID`.

Sin esas dos variables el rastreador sigue funcionando y guardando anuncios;
solo se queda sin avisos, y lo dice en el log al arrancar. Un anuncio cuyo
envío falla **no se marca como notificado**, así que se reintenta en la
siguiente vuelta en vez de perderse.

## Endpoints (`/pisos/api/*`)

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/searches` | Búsquedas guardadas (`activo = true`) |
| `POST` | `/searches` | Alta |
| `PATCH` | `/searches/:id` | Edición parcial |
| `DELETE` | `/searches/:id` | Borrado lógico |
| `POST` | `/searches/:id/rastrear` | Rastreo manual («Buscar ahora»). No notifica |
| `GET` | `/listings` | Feed de anuncios. Filtros `busqueda`, `nuevos`, `descartados` |
| `PATCH` | `/listings/:id` | Marcar visto / descartado |
| `POST` | `/listings/marcar-vistos` | Marcar todo como visto |
| `DELETE` | `/listings/:id` | Borrado lógico |
| `GET`/`PATCH` | `/scraper/state` | On/off global del rastreador |
| `GET` | `/health` | Salud |

El rastreo manual **no notifica a propósito**: quien lo pulsa está mirando la
pantalla, y la primera pasada de una búsqueda recién creada trae decenas de
anuncios antiguos que no son novedades. Sin eso, crear una búsqueda dispararía
cien mensajes de Telegram de golpe.

## Variables de entorno

| Variable | Por defecto | Para qué |
|---|---|---|
| `PISOS_DB_HOST` / `_NAME` / `_USER` / `_PASSWORD` / `_PORT` | | PostgreSQL |
| `KEYCLOAK_CERTS_URL` | | Verificación del JWT |
| `CORS_ORIGIN` | | Orígenes permitidos, separados por coma |
| `PORT` | `3012` | Puerto del backend |
| `PISOS_INTERVALO_MINUTOS` | `15` | Cada cuánto rastrea (±20% de jitter) |
| `PISOS_PAGINAS_POR_PORTAL` | `2` | Páginas por portal y vuelta |
| `TELEGRAM_BOT_TOKEN` | | Sin él, no hay avisos |
| `TELEGRAM_OWNER_CHAT_ID` | | Chat al que avisar |
| `WALLAPOP_CATEGORIA_INMUEBLES` | `200` | Id de categoría inmobiliaria, por si Wallapop lo cambia |

## Sobre el scraping

Los tres portales se leen con peticiones HTTP normales y cabeceras de
navegador de escritorio, porque el User-Agent por defecto de Node lo rechazan
casi todos los sitios de consumo. No hay rotación de proxies ni evasión de
CAPTCHA: si un portal responde 403 de forma sostenida, ese portal se marca
como fallido y se ve en la UI, en lugar de insistir. El intervalo por defecto
(~15 min con jitter) y la pausa de 4 s entre búsquedas están puestos para no
ser un problema para los portales.

Idealista queda fuera a propósito: está detrás de DataDome y un cliente HTTP
simple se bloquea en días. Su API oficial (100 peticiones/mes en el plan
gratuito, previa aprobación) no da para un rastreo cada 15 minutos.
