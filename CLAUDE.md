# PROYECTO: Calendario Personal

## Stack tecnológico
- Backend: Spring Boot 3.x, Java 17, Maven
- Frontend: Angular 17+ (standalone components), Angular Material
- Base de datos: PostgreSQL 15
- Autenticación: Keycloak (OpenID Connect / JWT)
- Contenedores: Docker + Docker Compose
- CI/CD: GitHub Actions
- Calidad: SonarQube Community
- Documentación API: OpenAPI 3 / Swagger UI (springdoc-openapi)

## Roles
Único rol con acceso: `admin` (el propietario es el único usuario). `familia` e `invitado`
no tienen acceso a Calendario, ni a la API ni al AppLauncher — el backend exige
`ROLE_admin` en todo `/api/**` (salvo `/api/auth/logout`, accesible a cualquier
autenticado para poder cerrar sesión), y el frontend oculta navbar/rutas y
redirige a `/acceso-denegado` si el usuario autenticado no es admin.

## Paquete base Java
com.manuhddev.calendario

## Estructura de paquetes backend
com.manuhddev.calendario
├── config/         → Seguridad, CORS, Keycloak, Swagger
├── controller/     → REST Controllers
├── dto/            → DTOs de entrada (RequestDTO) y salida (ResponseDTO)
├── entity/         → Entidades JPA
├── enums/          → Enumerados
├── exception/      → Excepciones personalizadas + GlobalExceptionHandler
├── mapper/         → MapStruct mappers
├── repository/     → JPA Repositories
└── service/        → Interfaz + implementación (impl/)

## Estructura frontend
src/app/
├── core/           → AuthGuard, interceptors JWT, servicios singleton
├── shared/         → Componentes, pipes y directivas reutilizables
└── features/
    ├── calendario/  → Vista anual, tooltip, navegación
    └── eventos/     → Formulario, detalle, imágenes

## Reglas de negocio globales (OBLIGATORIAS)
1. BORRADO LÓGICO en todas las entidades: campos `activo` (boolean, default true) y `deletedAt` (LocalDateTime, nullable). El DELETE HTTP nunca borra físicamente: pone activo=false y deletedAt=now().
2. Los listados del Repository filtran SIEMPRE por activo=true.
3. DTOs separados: [Entidad]RequestDTO para entrada, [Entidad]ResponseDTO para salida. El ResponseDTO nunca incluye deletedAt.
4. Mapeos con MapStruct, nunca manuales en el service.
5. Validaciones Jakarta en todos los RequestDTOs (@NotNull, @NotBlank, @Size, etc.).
6. Swagger obligatorio en todos los controllers: @Operation(summary), @ApiResponse.
7. Seguridad: todos los endpoints protegidos con JWT de Keycloak. Sin roles múltiples: el propietario es el único usuario.
8. Tests unitarios con JUnit 5 + Mockito. Tests de integración con TestContainers (PostgreSQL real, nunca H2).

## Diseño frontend (OBLIGATORIO)
- Estética minimalista estilo Apple: colores neutros (blanco, gris muy claro, negro suave), tipografía limpia (Inter o SF Pro si disponible), espaciado generoso, bordes suaves, sombras sutiles.
- Angular Material con tema personalizado: paleta neutra, sin colores vivos por defecto.
- Sin decoración excesiva. Cada elemento en pantalla debe tener un propósito.
- Animaciones suaves (200-300ms), no llamativas.

## Convenciones de nomenclatura
### Backend
- Entidades: PascalCase singular → Evento, ImagenEvento
- DTOs: EventoRequestDTO, EventoResponseDTO, EventoResumenDTO, EventoDetalleDTO
- Servicios: EventoService (interfaz) + EventoServiceImpl
- Controllers: EventoController, ImagenEventoController
- Mappers: EventoMapper, ImagenEventoMapper
- Excepciones: EventoNotFoundException, ImagenEventoNotFoundException

### Frontend
- Componentes: kebab-case → calendario-anual, evento-form, evento-detalle, evento-tooltip
- Servicios: EventoService, ImagenEventoService
- Modelos: Evento, EventoResumen, EventoDetalle, ImagenEvento

## Regla de Git (OBLIGATORIA)
- Usar siempre merge --no-ff (no fast forward) para mantener trazabilidad
- Una rama por HU: feature/CAL-XX-descripcion-corta
- Commits con prefijo: feat:, fix:, test:, infra:, docs:

## Infraestructura de producción
- **VPS**: `ssh -p 2269 87.216.88.165`
- **Dominio**: `elbunkerdelingeniero.duckdns.org`
- El VPS tiene otras aplicaciones desplegadas — usar Nginx como reverse proxy con virtualhost propio para Calendario, sin tocar la configuración existente.
- Certificados SSL con Let's Encrypt (Certbot), uno por subdominio/dominio, aislados del resto.

## Repositorio GitHub
- `https://github.com/ManuHDdev/calendario-personal`

## Antes de generar cualquier fichero
Lee siempre los ficheros existentes de la misma capa para seguir el mismo patrón.

---

## mapacyd — Mapa de Cargas y Descargas

### Ubicación
Calendario/mapacyd/ dentro del monorepo elbunkerdelingeniero.

### Stack
- Backend: Fastify + Node.js + TypeScript (igual que panel/ y storage/)
- Frontend: React + Vite + TypeScript
- Base de datos: PostgreSQL 15, tablas: zona_cyd y horario_zona
- Autenticación: Keycloak 26.1, realm "calendario", JWT stateless
- Mapa: Leaflet.js instalado vía npm (no CDN)
- Validaciones: Zod en todos los endpoints. NOTA: panel y storage validan manualmente, sin Zod — no siguen este mismo patrón pese a lo que decía una versión anterior de este documento.
- Sin ORM — queries directas con el cliente pg

### Roles
- admin o mapacyd_admin → gestión completa (POST/PUT/DELETE zonas y horarios)
- familia o mapacyd_invitado → solo consulta (GET /api/zonas)
- invitado → sin acceso a mapacyd

### Reglas obligatorias
- Soft delete en todas las tablas: campo activo (boolean default true) + deleted_at (timestamp nullable)
- Timestamps automáticos: created_at, updated_at
- Los listados SIEMPRE filtran por activo = true
- DELETE HTTP → soft delete (activo=false, deleted_at=now()), nunca borrado físico
- Validaciones Zod en todos los endpoints que reciben body
- CORS configurado vía variable CORS_ALLOWED_ORIGINS
- El frontend NO accede a la BD directamente, todo por API

### Variables de entorno del backend
- MAPACYD_DB_HOST, MAPACYD_DB_NAME, MAPACYD_DB_USER, MAPACYD_DB_PASSWORD
- KEYCLOAK_JWKS_URI (mismo que panel y storage)
- CORS_ALLOWED_ORIGINS
- PORT (default 3003)

### Red Docker
La red Docker se llama calendario-net (externa, ya existe). No crearla — unirse a ella.

### Imágenes Docker
ghcr.io/manuhddev/mapacyd-backend:latest
ghcr.io/manuhddev/mapacyd-frontend:latest

### Puerto en servidor
El frontend Docker expone el puerto 3073 en localhost (127.0.0.1:3073:80).

### Instrucción permanente
Antes de generar cualquier fichero de mapacyd, lee los ficheros equivalentes
en panel/backend/src/ para seguir el mismo patrón de código y estilo.

---

## Panel — Administración de usuarios

### Ubicación
Calendario/panel/ dentro del monorepo elbunkerdelingeniero.

### Stack
- Backend: Fastify + Node.js + TypeScript (igual que storage/ y mapacyd/)
- Frontend: React + Vite + TypeScript
- Sin base de datos propia — todo el estado vive en Keycloak (Admin REST API)
- Autenticación: Keycloak 26.1, realm "calendario", JWT verificado a mano (RS256 vía JWKS)
- Validaciones: manuales (sin Zod) — solo comprobación de campos obligatorios antes de llamar a Keycloak

### Roles
Único rol con acceso: `admin` (authAdminMiddleware lo exige en todas las rutas). `familia` e `invitado` no tienen acceso a Panel.

### Rutas (`/panel/api/*`)
- `GET/POST/PUT/DELETE /users` → CRUD de usuarios vía Keycloak Admin API
- `GET /roles` → lista fija `['admin','familia','invitado']`
- `GET /usage` → consumo agregado de las APIs externas rastreadas en el monorepo (ORS vía Paraísos, TMDB/Google Books vía Watchlist, Football-Data.org vía Fútbol), admin-only (`authAdminMiddleware`). Llama al `GET /usage` interno de cada subapp en paralelo (`Promise.allSettled`, timeout 3s); si uno falla, sus entradas se marcan `unavailable: true` en vez de tumbar toda la petición — ver `panel/backend/src/services/subappUsage.ts`. Fútbol es un repo externo al monorepo (ver sección "Fútbol" más abajo), pero expone el mismo contrato interno (`PANEL_INTERNAL_TOKEN`, misma forma de respuesta) que Paraísos/Watchlist
- `GET /health`

### Dashboard de uso de APIs externas
Sección nueva en `PanelPage` (`UsageDashboard.tsx`), tarjetas con llamadas de hoy, restante (cuando la API tiene tope publicado) y hora de reinicio (medianoche UTC). Documentado en `openspec/changes/2026-09-09-add-api-usage-dashboard/`.

### Variables de entorno
`KEYCLOAK_BASE_URL`, `KEYCLOAK_CERTS_URL`, `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`, `CORS_ORIGIN`, `PORT` (default 3002), `PANEL_INTERNAL_TOKEN` (compartido con Paraísos, Watchlist y Fútbol), `PARAISOS_BACKEND_URL` (default `http://paraisos-backend:3007`), `WATCHLIST_BACKEND_URL` (default `http://watchlist-backend:3009`), `FUTBOL_BACKEND_URL` (default `http://football-predictor-backend-1:8000` — contenedor del repo externo `football-predictor`, unido a `calendario-net`)

**`.env` gestionado por CI, no a mano**: a diferencia de Paraísos/Watchlist (cuyo
deploy no toca `.env`, confía en lo que ya haya en el servidor), el deploy de
Panel (`panel-ci.yml`) **regenera `~/panel/.env` desde cero en cada push a
main**, con las variables que el propio workflow conoce como secrets de GitHub
(`KEYCLOAK_ADMIN_PASSWORD`, `PANEL_INTERNAL_TOKEN`). Cualquier variable añadida
a mano por SSH que el workflow no escriba se pierde en el siguiente deploy —
si Panel necesita una variable nueva, añadirla también en `panel-ci.yml`, no
solo en el servidor (bug real: `PANEL_INTERNAL_TOKEN` se borró dos veces el
2026-09-15 hasta que se corrigió aquí).

### Red Docker
`calendario-net` (externa)

### Imágenes Docker
`ghcr.io/manuhddev/panel-backend:latest`, `ghcr.io/manuhddev/panel-frontend:latest`

---

## Storage — Almacenamiento de archivos

### Ubicación
Calendario/storage/ dentro del monorepo elbunkerdelingeniero.

### Stack
- Backend: Fastify + Node.js + TypeScript (igual que panel/ y mapacyd/)
- Frontend: React + Vite + TypeScript
- Sin base de datos — filesystem directo sobre `STORAGE_PATH` (en producción: `/mnt/storage-ssd`)
- Procesado de imágenes: sharp (miniaturas 400x400, conversión HEIC/HEIF → JPEG)
- Streaming de vídeo con soporte de Range requests (206 Partial Content)
- Autenticación: Keycloak, JWT verificado a mano (mismo patrón que panel/mapacyd); acepta el token también como query param (`?token=`) para `<img>`/`<video>`/`<iframe>` que no pueden mandar headers
- Validaciones: manuales (sin Zod)

### Roles
`admin` y `familia` → acceso completo (subir, mover, borrar, crear carpetas). `invitado` → sin acceso. Una subida en curso es privada de quien la empezó: nadie más puede consultarla, continuarla ni cancelarla.

### Rutas (`/storage/api/*`)
`GET /files` (query `folder`, `rootOnly`), `GET /folders`, `POST /upload`, `GET /files/:path/download|preview|thumbnail`, `PATCH /files/:path` (mover), `DELETE /files/:path`, `POST /folders`, `PATCH /folders/:path` (renombrar), `DELETE /folders/:path`, `GET /health`

Subida troceada y reanudable: `POST /uploads` (abre sesión), `GET /uploads/:id`
(por dónde va), `PATCH /uploads/:id` (un trozo, binario crudo + cabecera
`X-Chunk-Offset`), `POST /uploads/:id/complete`, `DELETE /uploads/:id`.

### Subidas reanudables (por qué existen)
Con una única petición de 2 GB, que el móvil se bloquee a mitad tira la conexión
y se pierde la subida entera. Por eso los archivos de más de 8 MB van en trozos:
si uno falla se reintenta solo ese, y lo ya subido se queda en el servidor.

Dos invariantes que explican el código:
1. **`received_bytes` de la base de datos es la única fuente de verdad**, no el
   tamaño del `.part`. Si el proceso muere entre escribir el trozo y confirmarlo,
   el `.part` va por delante; por eso se trunca a `received_bytes` antes de cada
   append, en vez de fiarse de lo que hay en disco.
2. **El servidor decide desde dónde se reanuda.** El cliente pregunta antes de
   cada reintento en lugar de usar su propia cuenta, que puede estar adelantada
   si se perdió la respuesta de un trozo que sí llegó.

Los `.part` viven en `.meta/uploads/` (dentro de `HIDDEN_DIRS`, así que nunca
asoman en los listados) y se barren a las 24 h sin actividad.

### Carpeta "Sin carpeta"
Los archivos subidos sin elegir carpeta caen en la raíz de `STORAGE_PATH`. La
entrada "Sin carpeta" del sidebar **no es una carpeta de disco**: es
`GET /files?rootOnly=true`, que lista solo la raíz sin descender. No se mueve
ningún archivo, así que aplica igual a todo lo que ya hubiera.

### Límite de subida (OBLIGATORIO mantener alineado)
**2 GB**, dimensionado para vídeo de iPhone: un `.mov` en 4K ronda los 400 MB por
minuto. Ese número está en **tres** sitios que deben coincidir:
`MAX_UPLOAD_BYTES` en `storage/backend/src/services/fileService.ts` (única
definición — `index.ts` y las rutas lo importan de ahí), `client_max_body_size`
en `storage/frontend/nginx.conf` (el nginx que va dentro de la imagen del
frontend) y `client_max_body_size` del bloque `location /storage/` en
`nginx/calendario.conf`. Si a un nginx se le olvida la directiva, aplica su
default de **1 MB** y falla hasta una foto con 413 antes de llegar al backend —
el `server` de `calendario.conf` tiene además un límite global de 20 M que el
bloque de Storage sobreescribe a propósito.

No hay que fiarse de la memoria: `fileService.test.ts` lee los dos `.conf` y
falla si alguno se desalinea o pierde la directiva.

### Fotos de iPhone (.HEIC)
El navegador no siempre sabe qué es un `.heic`: en Windows, Chrome y Firefox lo
suben como `application/octet-stream` o sin tipo. Por eso el backend no se fía
del MIME declarado — `resolveMimeType()` lo deduce de la extensión cuando llega
uno genérico. Se admiten `image/heic` e `image/heif`.

### Variables de entorno
`STORAGE_PATH` (prod: `/mnt/storage-ssd`), `KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`, `PORT` (default 3001)

### Red Docker y volumen
`calendario-net` (externa). `/mnt/storage-ssd` montado 1:1 en el contenedor.

### Imágenes Docker
`ghcr.io/manuhddev/storage-backend:latest`, `ghcr.io/manuhddev/storage-frontend:latest`

---

## Ytdl — Descargador de YouTube

### Ubicación
Calendario/ytdl/ dentro del monorepo elbunkerdelingeniero.

### Stack
- Backend: Fastify + Node.js + TypeScript (igual que panel/, storage/ y mapacyd/)
- Frontend: React + Vite + TypeScript
- Sin base de datos, sin filesystem propio — cada petición es stateless: se resuelve
  la URL con `yt-dlp`, se transcodifica/extrae con `ffmpeg` cuando hace falta, y el
  resultado se stremea directo como respuesta HTTP (nunca se escribe a disco)
- Sin autenticación: herramienta pública, sin JWT ni chequeo de rol en el backend
- Validaciones: manuales (sin Zod) — allowlist de host de YouTube y de formato antes de invocar cualquier proceso hijo
- Único subapp del monorepo con tests de backend (vitest): allowlist de URL y validación de formato (ya no hay guard de rol, se eliminó junto con la autenticación)

### Acceso
Ytdl es una herramienta pública: cualquier visitante puede descargar MP4/MP3 sin
iniciar sesión. El frontend inicializa Keycloak con `onLoad: 'check-sso'` (sin
redirigir a login) solo para detectar si el visitante ya tiene una sesión SSO
activa en otra app del monorepo (Calendario/Storage/etc en el mismo navegador);
si es así, se muestra el menú de apps compartido, pero no es requisito para usar
la herramienta.

### Rutas (`/ytdl/api/*`)
`GET /download?url=<youtube-url>&format=mp4|mp3` (streaming, sin persistencia), `GET /health`

### Motor de descarga
`yt-dlp` (binario CLI) + `ffmpeg`, invocados como child process con argv array
(`execFile`/`spawn`, nunca un string de shell) — nunca vía librería npm. La URL se
valida contra la allowlist de YouTube ANTES de invocar cualquier proceso hijo.

### Variables de entorno
`KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`, `PORT` (default 3004)

### Red Docker
`calendario-net` (externa)

### Imágenes Docker
`ghcr.io/manuhddev/ytdl-backend:latest`, `ghcr.io/manuhddev/ytdl-frontend:latest`

---

## Gastos — Tracker de gastos personales

### Ubicación
Calendario/gastos/ dentro del monorepo elbunkerdelingeniero.

### Stack
- Backend: Fastify + Node.js + TypeScript (igual que panel/, storage/, mapacyd/ y ytdl/)
- Frontend: React + Vite + TypeScript
- Base de datos: PostgreSQL 15, propia (`gastos`, misma instancia compartida que `mapacyd`), tabla `gasto`
- Autenticación: Keycloak 26.1, realm "calendario", JWT verificado a mano (mismo patrón que panel/storage/mapacyd/ytdl)
- OCR: Tesseract (binario nativo, invocado como proceso hijo vía `execFile` — sin runtime Python/ML) + `sharp` para preprocesado de imagen (escala de grises, contraste, umbralización)
- Bot de Telegram: Telegraf, long polling (sin webhook público), arrancado en el mismo proceso que el backend Fastify
- Validaciones: Zod en todos los endpoints que reciben body
- Sin ORM — queries directas con el cliente pg

### Roles
Único rol con acceso: `admin` (el propietario es el único usuario). `familia` e `invitado` no tienen acceso a Gastos, ni a la API ni al AppLauncher.

### Rutas (`/gastos/api/*`)
- `GET /gastos` — listado, filtros `mes`/`categoria`/`estado`, siempre `activo=true`
- `POST /gastos` — alta manual, directamente `estado='confirmado'`, `origen='manual'`
- `PATCH /gastos/:id` — edición de campos y/o confirmación de un borrador (`estado='confirmado'`)
- `DELETE /gastos/:id` — borrado lógico (`activo=false`, `deleted_at=now()`)
- `GET /totales?mes=YYYY-MM` — suma de gastos `confirmado` del mes, agrupada por categoría (los `pendiente_revision` NUNCA cuentan)
- `GET /categorias` — categorías distintas usadas hasta ahora (autocompletado)
- `POST /gastos/ocr` — interno (sigue exigiendo JWT + rol admin), recibe una imagen + `perfil: 'ticket'|'banco'`, ejecuta OCR + el parser correspondiente, guarda la imagen en `GASTOS_IMAGES_PATH` y crea un `gasto` en `estado='pendiente_revision'`
- `GET /health`

### Flujo del bot de Telegram
El propietario envía una foto (ticket de papel o captura de app bancaria) al bot. El bot responde con un teclado inline ("🧾 Ticket" / "🏦 Banco"); al pulsar, descarga la foto vía la API de Telegram y llama al pipeline de OCR en el mismo proceso (sin segundo salto HTTP), y responde con el importe/fecha/comercio extraídos, indicando que queda pendiente de revisión en la app. Cualquier mensaje que no venga de `TELEGRAM_OWNER_CHAT_ID` se ignora sin respuesta. Ver `gastos/README.md` para el alta manual del bot vía `@BotFather`.

### Variables de entorno del backend
`GASTOS_DB_HOST`, `GASTOS_DB_NAME`, `GASTOS_DB_USER`, `GASTOS_DB_PASSWORD`, `KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`, `PORT` (default 3005), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_CHAT_ID`, `GASTOS_IMAGES_PATH`

### Red Docker
`calendario-net` (externa)

### Imágenes Docker
`ghcr.io/manuhddev/gastos-backend:latest`, `ghcr.io/manuhddev/gastos-frontend:latest`

---

## Ofertas — UI de gestión para marketplace-watcher

### Ubicación
Calendario/ofertas/ dentro del monorepo elbunkerdelingeniero.

### Stack
- Backend: Fastify + Node.js + TypeScript (igual que panel/, storage/, mapacyd/, ytdl/ y gastos/)
- Frontend: React + Vite + TypeScript
- Base de datos: PostgreSQL 15, propia (`ofertas`, misma instancia compartida que `mapacyd`/`gastos`), tabla `busqueda`
- Autenticación: **dos mecanismos independientes, para dos audiencias distintas**:
  - Keycloak 26.1, realm "calendario", JWT verificado a mano (mismo patrón que panel/storage/mapacyd/ytdl/gastos) para todas las rutas humanas `/ofertas/api/searches*`.
  - Bearer token estático (`SCRAPER_API_KEY`, comparación en tiempo constante) exclusivamente para `GET /ofertas/api/searches/active` — pensado para un consumidor externo sin login interactivo (ver "Relación con marketplace-watcher" más abajo). Un JWT de Keycloak válido NO da acceso a esa ruta, y ese bearer token NO da acceso a las rutas CRUD.
- Validaciones: Zod en todos los endpoints que reciben body
- Sin ORM — queries directas con el cliente pg

### Roles
Único rol con acceso humano: `admin` (el propietario es el único usuario), misma postura que Gastos/Panel. `familia` e `invitado` no tienen acceso a Ofertas, ni a la API ni al AppLauncher. El endpoint `/searches/active` no usa roles de Keycloak en absoluto — usa el bearer token descrito arriba.

### Rutas (`/ofertas/api/*`)
- `GET /searches` — listado de búsquedas guardadas, siempre `activo=true` (admin, Keycloak)
- `POST /searches` — alta de una búsqueda guardada (admin, Keycloak)
- `PATCH /searches/:id` — edición de campos (admin, Keycloak)
- `DELETE /searches/:id` — borrado lógico (`activo=false`, `deleted_at=now()`) (admin, Keycloak)
- `GET /searches/active` — **bearer-token-gated (`SCRAPER_API_KEY`), no Keycloak** — devuelve solo las búsquedas `activo=true`, mapeadas a un DTO explícito (`name`, `keyword`, `max_price`, `min_price`, `latitude`, `longitude`, `distance_km`, `milanuncios_province_slug`, `language_filter`, `console_only`, `sites: { wallapop, milanuncios, vinted }`) que imita el `SearchQuery`/`config.yaml` que ya usa `marketplace-watcher`, no un volcado de las columnas internas de `busqueda`
- `GET /scraper/state` — devuelve `{ running, updated_at }` del on/off global del scraper (admin, Keycloak), usado por la UI al cargar
- `PATCH /scraper/state` — actualiza `{ running: boolean }` (admin, Keycloak, Zod), devuelve el nuevo estado — es lo que llama el botón de pausar/reanudar de la UI
- `GET /scraper/status` — **bearer-token-gated (`SCRAPER_API_KEY`), no Keycloak** — devuelve solo `{ running }`, pensado para que `marketplace-watcher` lo consulte antes de cada ejecución
- `GET /health`

### Relación con marketplace-watcher (IMPORTANTE)
`ofertas` es la UI de gestión para `marketplace-watcher`, un scraper Python **fuera de este monorepo** (`marketplace-watcher/`, desplegado vía systemd timer en el VPS) que vigila Wallapop/Milanuncios/Vinted. Este subapp expone y persiste las búsquedas guardadas y el contrato de lectura (`GET /searches/active`), pero **conectar el scraper para que realmente llame a esta API en vez de leer su `config.yaml` local es un follow-up explícito y separado**, no parte de esta feature. Hasta que ese follow-up se haga, `marketplace-watcher` sigue funcionando exactamente igual que hoy, sin ninguna dependencia dura de `ofertas`.

### Variables de entorno del backend
`OFERTAS_DB_HOST`, `OFERTAS_DB_NAME`, `OFERTAS_DB_USER`, `OFERTAS_DB_PASSWORD`, `KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`, `PORT` (default 3006), `SCRAPER_API_KEY` (token estático generado una sola vez, p. ej. `openssl rand -hex 32` — nunca se loguea ni se devuelve en ninguna respuesta)

### Red Docker
`calendario-net` (externa)

### Imágenes Docker
`ghcr.io/manuhddev/ofertas-backend:latest`, `ghcr.io/manuhddev/ofertas-frontend:latest`

## Paraísos — Mapa de paraísos naturales

### Ubicación
Calendario/paraisos/ dentro del monorepo elbunkerdelingeniero.

### Stack
- Backend: Fastify + Node.js + TypeScript (igual que panel/, storage/, mapacyd/, ytdl/, gastos/ y ofertas/)
- Frontend: React + Vite + TypeScript
- Base de datos: PostgreSQL 15, propia (`paraisos`), tabla `spot`
- Mapa: Leaflet.js instalado vía npm (no CDN)
- Autenticación: Keycloak 26.1, realm "calendario", JWT verificado a mano (mismo patrón)
- Validaciones: Zod en todos los endpoints que reciben body
- Sin ORM — queries directas con el cliente pg
- Procesado de imágenes: sharp (redimensionado a 1600px de ancho máx. + reencode JPEG calidad 82 en cada subida)

### Acceso
Paraísos es una herramienta pública: cualquier visitante puede ver el mapa y los spots sin iniciar sesión. El frontend inicializa Keycloak con `onLoad: 'check-sso'` (sin redirigir a login) solo para detectar si el visitante ya tiene una sesión SSO activa; si es así, se muestra el menú de apps compartido y, si el usuario tiene rol `admin` o `paraisos_admin`, los controles de gestión de spots.

### Roles
- Sin sesión / cualquier rol → consulta (GET /spots, GET /spots/:id, /stats, /regions)
- `admin` o `paraisos_admin` → gestión completa (POST/PATCH/DELETE spots)

### Rutas (`/paraisos/api/*`)
- `GET /spots` — listado de spots activos, filtro opcional `?categoria=piscina|ruta|playa`
- `GET /spots/:id` — detalle de un spot
- `GET /spots/stats` — conteo por categoría
- `GET /spots/regions` — regiones distintas
- `POST /spots` — alta de spot (admin, Keycloak)
- `PATCH /spots/:id` — edición de spot (admin, Keycloak)
- `DELETE /spots/:id` — borrado lógico (admin, Keycloak)
- `POST /images` — subida de imagen de spot (admin, Keycloak), `multipart/form-data` campo `file`, devuelve `{ url }`
- `GET /images/:filename` — sirve una imagen subida (público, sin auth)
- `GET /route-distance` — distancia y duración por carretera entre dos puntos vía OpenRouteService (público, sin auth), query `fromLat`/`fromLng`/`toLat`/`toLng`. Protegido con límite propio de 2000 peticiones/día (por debajo del límite real de ORS), límite de 20 peticiones/5min por IP, y caché en memoria de 6h por par de coordenadas (redondeadas a ~100m). El contador diario vive en Postgres (tabla `api_usage_counter`), no en memoria — sobrevive a un redeploy, a diferencia de la caché de resultados y el límite por IP, que sí siguen en memoria y se resetean
- `GET /usage` — consumo de hoy de ORS (interno, para el dashboard de Panel), bearer-token-gated con `PANEL_INTERNAL_TOKEN` (comparación en tiempo constante, mismo patrón que `SCRAPER_API_KEY` de Ofertas) — un JWT de Keycloak NO da acceso a esta ruta
- `GET /health`

### Variables de entorno del backend
`PARAISOS_DB_HOST`, `PARAISOS_DB_NAME`, `PARAISOS_DB_USER`, `PARAISOS_DB_PASSWORD`, `KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`, `PORT` (default 3007), `PARAISOS_IMAGES_PATH` (prod: `/app/data/images`, volumen Docker persistente), `ORS_API_KEY` (gratuito, generar en openrouteservice.org — plan gratuito real: 2500 peticiones/día, 40.000/mes, 40 concurrentes), `PANEL_INTERNAL_TOKEN` (compartido con Panel y Watchlist, gatea `GET /usage`)

### Red Docker
`calendario-net` (externa)

### Imágenes Docker
`ghcr.io/manuhddev/paraisos-backend:latest`, `ghcr.io/manuhddev/paraisos-frontend:latest`

---

## Juegos — Hub de juegos de fiesta

### Ubicación
Calendario/juegos/ dentro del monorepo elbunkerdelingeniero.

### Stack
- Backend: Fastify + Node.js + TypeScript (igual que panel/, storage/, mapacyd/, ytdl/, gastos/, ofertas/ y paraisos/)
- Frontend: React + Vite + TypeScript
- Sin base de datos: los bancos de contenido (palabras, preguntas, prompts) son JSON estático cargado en memoria al arrancar; el estado de las salas en vivo vive solo en memoria del proceso (`Map<roomCode, RoomState>`), nunca se persiste
- Tiempo real: `@fastify/websocket` — primera feature del monorepo con WebSocket, una única ruta `/juegos/api/ws` que dispatcha según `gameType` de la sala
- Autenticación: Keycloak 26.1, realm "calendario", JWT verificado a mano (mismo patrón que el resto de subapps); el WS lleva el JWT como query param (`?token=`), igual que storage para `<img>`/`<video>`, porque el WebSocket nativo del navegador no permite fijar cabeceras custom en el handshake
- Validaciones: manuales (sin Zod)
- Sin ORM — no aplica (sin base de datos)

### Acceso
Juegos es la primera subapp del monorepo abierta a **cualquier rol autenticado**
(`admin`, `familia` e `invitado` por igual) — no confundir con Ytdl/Paraísos, que
son públicas sin sesión: aquí sí se exige login válido, pero ningún rol
concreto. El guard es `requireAuthenticated` (JWT válido, sin comprobación de
rol), una función nueva y separada de `hasAnyRole` — no una lista de roles
metida en el patrón existente.

### Roles
- Cualquier usuario autenticado (`admin`, `familia`, `invitado`) → acceso completo a los cinco juegos

### Rutas (`/juegos/api/*`)
- `GET /impostor/word?categoria=` — palabra de El Impostor (pasar y jugar), extraída del shuffle-bag
- `GET /yo-nunca/prompt` — prompt de Yo Nunca
- `GET /verdad-o-reto/prompt?tipo=verdad|reto` — prompt de Verdad o Reto
- `POST /rooms` — crea una sala en vivo (`{ gameType: 'impostor-live' | 'trivia-live' }`), devuelve `{ roomCode }` y registra al creador como host
- `GET /ws?token=&room=` — upgrade a WebSocket, une al jugador a la sala y retransmite el estado (roles, votos, preguntas, marcador) según `gameType`
- `GET /health`

### Bancos de contenido (estático, no editable en v1)
`juegos/backend/src/content/*.json` — ≥300 palabras (Impostor), ≥500 preguntas (Trivia), ≥150 prompts (Yo Nunca), ≥150 prompts (Verdad o Reto). No existe ningún endpoint de escritura sobre estos bancos; editar contenido implica editar el JSON y redesplegar. Un `shuffle-bag` (Fisher–Yates por sesión) garantiza no repetir hasta agotar el banco completo.

### Salas en vivo
Estado en memoria (`Map<roomCode, RoomState>`), sin Redis ni pub/sub — coherente con que cada subapp es una única instancia Docker. Reconexión con ~60s de período de gracia (el jugador conserva su rol/slot); pasado ese tiempo el hueco se libera y se avisa al resto. Un reinicio del backend destruye las salas activas (aceptado como trade-off v1, ver design.md).

### Variables de entorno del backend
`KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`, `PORT` (default 3008)

### Red Docker
`calendario-net` (externa)

### Imágenes Docker
`ghcr.io/manuhddev/juegos-backend:latest`, `ghcr.io/manuhddev/juegos-frontend:latest`

---

## Watchlist — Películas, series y libros pendientes

### Ubicación
Calendario/watchlist/ dentro del monorepo elbunkerdelingeniero.

### Stack
- Backend: Fastify + Node.js + TypeScript (igual que panel/, storage/, mapacyd/, ytdl/, gastos/, ofertas/, paraisos/ y juegos/)
- Frontend: React + Vite + TypeScript
- Base de datos: PostgreSQL 15, propia (`watchlist`), tabla `item`
- Autenticación: Keycloak 26.1, realm "calendario", JWT verificado a mano (mismo patrón)
- Búsqueda externa: TMDB (themoviedb.org) para películas/series, Google Books para libros — autocompletado de título, poster y sinopsis al añadir un ítem
- Validaciones: Zod en todos los endpoints que reciben body
- Sin ORM — queries directas con el cliente pg

### Roles
Único rol con acceso: `admin` (el propietario es el único usuario). `familia` e `invitado` no tienen acceso a Watchlist, ni a la API ni al AppLauncher.

### Rutas (`/watchlist/api/*`)
- `GET /items` — listado, filtros `tipo`/`estado`, siempre `activo=true`
- `POST /items` — alta (desde resultado de búsqueda o manual)
- `PATCH /items/:id` — edición de campos y/o cambio de estado
- `DELETE /items/:id` — borrado lógico (`activo=false`, `deleted_at=now()`)
- `GET /search/movies?q=` — autocompletado de películas vía TMDB
- `GET /search/tv?q=` — autocompletado de series vía TMDB
- `GET /search/books?q=` — autocompletado de libros vía Google Books
- `GET /usage` — consumo de hoy de TMDB y Google Books (interno, para el dashboard de Panel), bearer-token-gated con `PANEL_INTERNAL_TOKEN` (mismo patrón que Paraísos/Ofertas) — un JWT de Keycloak NO da acceso a esta ruta
- `GET /health`

### Consumo de TMDB y Google Books
Cada llamada real (nunca un cache hit) incrementa un contador diario en Postgres (`api_usage_counter`, mismo esquema que Paraísos). Google Books tiene cuota gratuita por defecto de 1000/día (Google Cloud); TMDB no publica un tope diario, así que su entrada en `GET /usage` no lleva límite/restante, solo el conteo de hoy. Esto es puramente informativo — no se añade ningún bloqueo nuevo a `/search/*`.

### Variables de entorno del backend
`WATCHLIST_DB_HOST`, `WATCHLIST_DB_NAME`, `WATCHLIST_DB_USER`, `WATCHLIST_DB_PASSWORD`, `KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`, `PORT` (default 3009), `TMDB_API_KEY` (gratuito, themoviedb.org), `GOOGLE_BOOKS_API_KEY` (gratuito, Google Cloud Console). Si alguna de las dos claves falta, el endpoint de búsqueda correspondiente devuelve 503 en vez de romper el arranque del backend. `PANEL_INTERNAL_TOKEN` (compartido con Panel y Paraísos, gatea `GET /usage`).

### Red Docker
`calendario-net` (externa)

### Imágenes Docker
`ghcr.io/manuhddev/watchlist-backend:latest`, `ghcr.io/manuhddev/watchlist-frontend:latest`

---

## Reparto — Gastos de grupo compartido (estilo Tricount)

### Ubicación
Calendario/reparto/ dentro del monorepo elbunkerdelingeniero.

### Stack
- Backend: Fastify + Node.js + TypeScript (igual que panel/, storage/, mapacyd/, ytdl/, gastos/, ofertas/, paraisos/, juegos/ y watchlist/)
- Frontend: React + Vite + TypeScript
- Base de datos: PostgreSQL 15, propia (`reparto`), tablas `group`, `group_member`, `expense`, `expense_split`
- Autenticación: **dos mecanismos independientes, para dos audiencias distintas** (mismo patrón que `ofertas`, adaptado de "un token global" a "un token por grupo"):
  - Keycloak 26.1, realm "calendario", JWT verificado a mano (mismo patrón que el resto de subapps), para el gestor de grupos.
  - Token de sesión de grupo (JWT propio, firmado con `REPARTO_GROUP_TOKEN_SECRET`, obtenido al resolver el `access_token` de un enlace de grupo) para miembros sin cuenta Keycloak — ver `reparto/README.md` para el detalle completo del flujo.
  - Las rutas de gastos/miembros/balances aceptan cualquiera de los dos (`authOrGroupToken`), cada uno acotado a su alcance (Keycloak: todo el sistema para el gestor; token de grupo: únicamente ese `groupId`).
- Validaciones: Zod en todos los endpoints que reciben body
- Sin ORM — queries directas con el cliente pg

### Roles
- `admin` o `reparto_admin` → gestión completa (crear/borrar grupos, gestionar miembros, regenerar enlace)
- `reparto_invitado` → solo consulta (ver todos los grupos del sistema, sin crear/editar)
- Miembro sin cuenta (vía enlace de grupo) → lectura/escritura de gastos y miembros de ESE grupo únicamente, nunca borra el grupo ni expulsa miembros

### Rutas (`/reparto/api/*`)
- `POST /groups` — alta de grupo (gestor Keycloak), genera `access_token`
- `GET /groups` — listado de grupos del sistema (gestor Keycloak)
- `GET /groups/:id` — detalle de grupo (gestor Keycloak o token de grupo válido para ese id)
- `DELETE /groups/:id` — soft delete (solo gestor Keycloak)
- `POST /groups/by-token` — resuelve un `access_token` de enlace a una sesión de grupo (público, sin JWT)
- `POST /groups/:id/rotate-token` — regenera el `access_token`, invalida el enlace anterior (solo gestor Keycloak)
- `POST/GET/PATCH/DELETE /groups/:id/members[/:memberId]` — miembros por nombre libre (gestor Keycloak o token de grupo; expulsar miembro solo gestor)
- `POST/GET/PATCH/DELETE /groups/:id/expenses[/:expenseId]` — gastos con `split_type` `equal`/`exact`/`percentage` (gestor Keycloak o token de grupo)
- `GET /groups/:id/categories` — categorías usadas en el grupo (autocompletado)
- `GET /groups/:id/balances` — balance neto por miembro
- `GET /groups/:id/settlement` — transferencias sugeridas (algoritmo greedy `simplifyDebts`)
- `GET /health`

### Variables de entorno del backend
`REPARTO_DB_HOST`, `REPARTO_DB_NAME`, `REPARTO_DB_USER`, `REPARTO_DB_PASSWORD`, `REPARTO_GROUP_TOKEN_SECRET` (obligatorio, firma los tokens de sesión de grupo — nunca reutiliza el secreto de Keycloak), `KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`, `PORT` (default 3010)

### Red Docker
`calendario-net` (externa)

### Imágenes Docker
`ghcr.io/manuhddev/reparto-backend:latest`, `ghcr.io/manuhddev/reparto-frontend:latest`

---

## Ruta — Wallapop a lo largo de un trayecto

### Ubicación
Calendario/ruta/ dentro del monorepo elbunkerdelingeniero.

### Stack
- Backend: Fastify + Node.js + TypeScript (igual que panel/, storage/, mapacyd/, ytdl/, gastos/, ofertas/, paraisos/, juegos/, watchlist/ y reparto/)
- Frontend: React + Vite + TypeScript
- Base de datos: PostgreSQL 15, propia (`ruta`), tablas `busqueda_ruta` y `geocode_cache`
- Mapa: Leaflet.js instalado vía npm (no CDN)
- Rutas por carretera: OpenRouteService (misma `ORS_API_KEY` que paraisos, pero aquí se conserva la GEOMETRÍA completa, no solo el summary)
- Geocodificación: Nominatim (OpenStreetMap), serializada a 1 req/s y cacheada de forma permanente en `geocode_cache`
- Marketplace: Wallapop vía su API interna `api.wallapop.com/api/v3/search` (no oficial, mismo endpoint que el proyecto `marketplace-watcher`)
- Autenticación: Keycloak 26.1, realm "calendario", JWT verificado a mano (mismo patrón)
- Validaciones: Zod en todos los endpoints que reciben body
- Sin ORM — queries directas con el cliente pg
- Con tests de backend (vitest), ejecutados en CI

### Roles
Único rol con acceso: `admin` (el propietario es el único usuario), misma postura que Gastos/Ofertas/Watchlist. `familia` e `invitado` no tienen acceso a Ruta, ni a la API ni al AppLauncher. **No añade ningún rol nuevo al realm de Keycloak.**

### Qué hace
Dado un trayecto A→B, devuelve los anuncios de Wallapop que estén a menos de N km de desvío de la ruta real, ordenados por el orden en que se pasarían conduciendo. El filtro NO es "cerca de las ciudades del camino": es la distancia perpendicular al trazado real, calculada anuncio a anuncio, usando las coordenadas que Wallapop expone en `location.latitude`/`location.longitude` de cada ítem.

### Geometría del corredor (IMPORTANTE — no "simplificar")
Wallapop solo acepta círculos (centro + `distance_in_km`), y lo que hace falta es un corredor. Con círculos de radio `Q` cada `S` km, la desigualdad triangular da `|P C| <= R + S/2`, luego **`S = 2*(Q - R)`**, y exige `Q > R`.

La cota aparentemente más ajustada `Q >= sqrt(R^2 + (S/2)^2)` **es incorrecta**: solo vale para rutas rectas. En el exterior de una curva deja puntos hasta un 8% fuera del círculo más cercano (medido contra una polilínea Badajoz–Madrid), perdiendo anuncios en silencio. Está documentado en `ruta/backend/src/services/corridor.ts` y verificado en `corridor.test.ts`, que recorre el borde del corredor de una ruta con curvas.

El planificador elige el radio MÁS PEQUEÑO que cabe en el presupuesto de peticiones, no el más grande: cada página de Wallapop está limitada a 40 anuncios, así que los círculos grandes gastan sus huecos en anuncios lejos de la ruta y pierden recall.

### Rutas (`/ruta/api/*`)
- `GET /geocode?q=` — texto libre → coordenadas (Nominatim, cacheado en Postgres)
- `POST /search` — la búsqueda de corredor; devuelve `route` (polilínea, km, minutos), `plan` (centros, radio, espaciado, `fullCoverage`), `listings` y `stats` (`fetched`, `matched`, `requests`, `failedRequests`)
- `GET /searches` — búsquedas guardadas, siempre `activo=true`
- `POST /searches` — alta
- `GET /searches/:id` — detalle
- `PATCH /searches/:id` — edición parcial
- `DELETE /searches/:id` — borrado lógico (`activo=false`, `deleted_at=now()`)
- `GET /health`

`plan.fullCoverage` y `stats.failedRequests` se muestran en la UI cuando no son perfectos: una búsqueda parcial nunca debe parecerse a una completa.

### Alcance deliberado: solo Wallapop
Milanuncios NO tiene búsqueda por coordenadas + radio (solo por slug de provincia), así que un desvío de N km no se puede cumplir sin geocodificar cada anuncio. Queda fuera a propósito. Añadirlo más adelante no obliga a rediseñar nada: el filtro exacto por distancia a la polilínea es agnóstico de la fuente.

### Variables de entorno del backend
`RUTA_DB_HOST`, `RUTA_DB_NAME`, `RUTA_DB_USER`, `RUTA_DB_PASSWORD`, `RUTA_DB_PORT`, `KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`, `PORT` (default 3011), `ORS_API_KEY` (obligatoria; sin ella `POST /search` devuelve 503 en vez de romper el arranque)

### Red Docker
`calendario-net` (externa)

### Imágenes Docker
`ghcr.io/manuhddev/ruta-backend:latest`, `ghcr.io/manuhddev/ruta-frontend:latest`

---

## Pisos — Rastreador de anuncios de vivienda en venta

### Ubicación
Calendario/pisos/ dentro del monorepo elbunkerdelingeniero.

### Stack
- Backend: Fastify + Node.js + TypeScript (igual que panel/, storage/, mapacyd/, ytdl/, gastos/, ofertas/, paraisos/, juegos/, watchlist/, reparto/ y ruta/)
- Frontend: React + Vite + TypeScript
- Base de datos: PostgreSQL 15, propia (`pisos`), tablas `busqueda` y `anuncio` + singleton `scraper_state`
- Autenticación: Keycloak 26.1, realm "calendario", JWT verificado a mano (mismo patrón)
- Avisos: bot de Telegram (Telegraf) **de una sola dirección** — solo emite, no escucha comandos ni hace long polling, a diferencia del bot conversacional de `gastos`
- Validaciones: Zod en todos los endpoints que reciben body
- Sin ORM — queries directas con el cliente pg
- Con tests de backend (vitest), ejecutados en CI

### Qué hace
Vigila Fotocasa, pisos.com y Wallapop cada pocos minutos y avisa por Telegram
en cuanto aparece un piso **en venta** que cumple los criterios guardados
(zona, precio, m², habitaciones, baños, ascensor/garaje/terraza). Solo compra:
el alquiler queda fuera a propósito.

### Tipo de inmueble: `vivienda` | `local` (excluyentes)

Cada búsqueda declara un `tipo`: `vivienda` (por defecto) o `local` comercial.
No es un interruptor de "busca las dos cosas" — son criterios, secciones de
portal y avisos distintos. Reglas:

- **Migración**: `busqueda.tipo` y `anuncio.tipo` nacen con `DEFAULT 'vivienda'`,
  así que toda búsqueda y todo anuncio anteriores quedan `vivienda` y se
  comportan byte a byte igual. No hay `UPDATE` de relleno.
- **Inmutable**: el `PATCH /searches/:id` rechaza `tipo` con 400 (`.strict()` +
  `.omit`), y la allowlist de `updateBusqueda()` tampoco lo incluye (dos capas).
  El frontend nunca lo envía en una edición y el selector se deshabilita al
  editar. Para cambiar de tipo se crea otra búsqueda.
- **Fotocasa y pisos.com**: `tipo='local'` cambia el segmento de URL a la
  sección comercial (`/es/comprar/locales/…` y `/venta/locales-<zona>/`,
  **verificados contra el portal en vivo el 2026-09-10** — Madrid y Badajoz,
  ~30 anuncios/página con precio+m²+imagen al 100%; en Fotocasa el nodo trae
  `buildingType: "Business"` sin `buildingSubtype` y la ficha vuelve bajo
  `/es/comprar/local-comercial/…`), invierte el filtro de
  subtipos (acepta local/nave/oficina, rechaza piso/ático/chalet) y usa una
  horquilla de superficie ampliada `[10, 5000]` m² en vez de `[15, 1000]`.
  `minRooms`/`habitacionesDesde` no se emiten para `local`.
- **Wallapop** se omite en las búsquedas de `local` con motivo visible
  (`puedeBuscar → {ok:false}`): su categoría inmobiliaria no distingue local de
  vivienda de forma fiable.
- **Filtro fino**: para `local`, `cumpleCriterios` no evalúa habitaciones,
  baños ni ascensor/garaje/terraza; sí ubicación, precio, metros y exclusiones.
  Un anuncio cuyo `tipo` no coincide con el de la búsqueda se descarta.
- **Avisos**: la cabecera es `🏪 Local nuevo` o `🏠 Piso nuevo` según el tipo.
- **Smoke**: `npm run smoke -- <portal> "<zona>" --tipo local` (default
  `vivienda`); en `local` la cobertura por campo omite hab/baños para no leerse
  como avería.

**Lo que NO cambia con esta feature**: no hay puerto nuevo, ni base de datos
nueva, ni rol nuevo en Keycloak, ni entrada nueva en el AppLauncher — `pisos`
sigue siendo una sola subapp `admin`. La tabla de puertos, la tabla de roles y
las 15 copias del AppLauncher se quedan exactamente como están.

### El rastreador corre solo (IMPORTANTE)
El planificador vive **dentro del propio proceso del backend**
(`services/planificador.ts`, `setTimeout` encadenado — no `setInterval`, para
que un rastreo largo no se solape consigo mismo). No hay cron externo, systemd
timer ni asistente de por medio: mientras el contenedor esté levantado
(`restart: unless-stopped`), rastrea. Es la diferencia deliberada con
`ofertas`, cuyo scraper (`marketplace-watcher`) es un proyecto Python separado
fuera de este monorepo.

### Dos principios de diseño que explican casi todo el código
1. **Un dato desconocido no descarta un anuncio.** `null` es "el portal no lo
   dice" y pasa el filtro; solo un `false` explícito ("sin ascensor") descarta.
   Los portales solo publican los extras en la ficha, no en el listado, así que
   tratar el silencio como un "no" haría desaparecer la mayoría de los pisos
   válidos en silencio.
2. **Un rastreo parcial nunca debe parecerse a uno completo.** Un portal caído
   degrada el resultado, no lo aborta: se guarda lo encontrado y el motivo del
   fallo queda en `busqueda.ultimo_rastreo_error`, que la UI enseña en rojo.
   Mismo criterio que `plan.fullCoverage` en `ruta`.

### Portales
Todo el conocimiento específico de un portal vive en un bloque marcado dentro
de `portales/<portal>.ts` — es el único sitio a tocar si un portal cambia.

- **Fotocasa** y **pisos.com**: por nombre de zona. Se leen del JSON que la
  propia página deja embebido (JSON-LD de schema.org o el estado que hidrata su
  SPA), NO raspando clases CSS: los nombres de clase cambian con cada
  despliegue de su front, el JSON-LD está ahí para Google y es mucho más
  estable. Además, en el estado embebido se buscan nodos por su FORMA (id +
  precio + superficie) y no por su ruta exacta, que también cambia.
- **Wallapop**: mismo endpoint interno que ya usa `ruta`. Necesita
  **coordenadas y radio**, no un nombre de zona; sin ellos esa búsqueda salta
  ese portal con un motivo explícito. Tampoco expone m²/habitaciones
  estructurados (los escribe un particular), así que se extraen del título y la
  descripción en `portales/normalizar.ts`.

Por eso el filtro fino se aplica en el backend, igual para los tres portales,
después de normalizar — y no delegando en el buscador de cada uno, que ofrecen
juegos de filtros distintos.

**Idealista queda fuera a propósito**: está detrás de DataDome y un cliente
HTTP simple se bloquea en días; su API oficial (100 peticiones/mes gratis,
previa aprobación) no da para rastrear cada 15 minutos.

### Tests y smoke (IMPORTANTE)
Los tests de vitest corren contra **fixtures**, no contra los portales reales:
verifican la lógica de parseo, pero no pueden verificar que un portal siga
sirviendo hoy lo esperado — CI no sale a internet. Para eso está
`npm run smoke -- <portal|todos> "<zona>"`, que golpea el portal de verdad y
enseña la **cobertura por campo** (precio, m², habitaciones…). Esa cobertura es
la métrica real: un parser medio roto devuelve anuncios con todo a `null` y aun
así "funciona". Ejecutarlo tras cada despliegue y cuando un portal deje de
devolver resultados.

### Rutas (`/pisos/api/*`)
- `GET /searches` — búsquedas guardadas, siempre `activo=true`
- `POST /searches` — alta
- `PATCH /searches/:id` — edición parcial
- `DELETE /searches/:id` — borrado lógico (`activo=false`, `deleted_at=now()`)
- `POST /searches/:id/rastrear` — rastreo manual ("Buscar ahora"). **No
  notifica a propósito**: la primera pasada de una búsqueda nueva trae decenas
  de anuncios antiguos que no son novedades y dispararía cien mensajes de golpe
- `GET /listings` — feed de anuncios, filtros `busqueda`/`portal`/`nuevos`/`descartados`.
  Un `portal` desconocido es un 400, no una lista vacía: filtrar por algo que no
  existe devolvería un resultado indistinguible de "no hay anuncios de esa fuente"
- `PATCH /listings/:id` — marcar visto / descartado
- `POST /listings/marcar-vistos` — marca lo que encaja en el filtro (`busqueda_id`,
  `portal`), no la tabla entera: el botón se pulsa sobre una vista ya acotada
- `DELETE /listings/:id` — borrado lógico
- `GET`/`PATCH` `/scraper/state` — on/off global del rastreador (admin, Keycloak)
- `GET /health`

### Roles
Único rol con acceso: `admin` (el propietario es el único usuario), misma
postura que Gastos/Ofertas/Watchlist/Ruta. `familia` e `invitado` no tienen
acceso a Pisos, ni a la API ni al AppLauncher. **No añade ningún rol nuevo al
realm de Keycloak.**

### Bot de Telegram
Emite avisos, no escucha comandos. Alta manual vía `@BotFather` — ver
`pisos/README.md`. Sin `TELEGRAM_BOT_TOKEN`/`TELEGRAM_OWNER_CHAT_ID` el
rastreador sigue funcionando y guardando anuncios, solo se queda sin avisos (lo
dice en el log al arrancar). Un anuncio cuyo envío falla **no se marca como
notificado**, así que se reintenta en la siguiente vuelta en vez de perderse.

### Variables de entorno del backend
`PISOS_DB_HOST`, `PISOS_DB_NAME`, `PISOS_DB_USER`, `PISOS_DB_PASSWORD`,
`PISOS_DB_PORT`, `KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`, `PORT` (default 3012),
`PISOS_INTERVALO_MINUTOS` (default 15, con ±20% de jitter),
`PISOS_PAGINAS_POR_PORTAL` (default 2), `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_OWNER_CHAT_ID`, `WALLAPOP_CATEGORIA_INMUEBLES` (default `200`,
sobrescribible por si Wallapop cambia el id de su categoría inmobiliaria).

### Red Docker
`calendario-net` (externa)

### Imágenes Docker
`ghcr.io/manuhddev/pisos-backend:latest`, `ghcr.io/manuhddev/pisos-frontend:latest`

---

## Locales — locales y farmacias en venta, con la distancia legal comprobada

### Ubicación
Calendario/locales/ dentro del monorepo elbunkerdelingeniero.

### Estado
**Entregadas las fases 1, 5, 6 y 9**: esquema, padrón, motores de distancia,
semáforo de viabilidad, API de consulta, bot de doble sentido, **los 10
rastreadores de portales** (5 de locales, 5 de farmacias), el **planificador**
(dentro del proceso del backend, `setTimeout` encadenado), la **API completa**
(`/searches`, `/listings`, `/scraper/state`), la **emisión de avisos** por
Telegram y el **frontend** React. Ya tiene entrada en el AppLauncher (las 14
copias). Pendiente: la primera pasada de `npm run smoke` con red real contra
cada portal — los parsers están escritos desde el patrón de `pisos` sin poder
verificarlos contra el portal en vivo (ver `locales/README.md`).

### Stack
- Backend: Fastify + Node.js + TypeScript (igual que el resto de subapps Node)
- Frontend: React + Vite + TypeScript, mapa Leaflet vía npm (semáforo de
  viabilidad, feed de anuncios, panel de comprobación puntual, normativa
  editable, cobertura del padrón)
- Base de datos: PostgreSQL 15, propia (`locales`), tablas `provincia`,
  `normativa`, `farmacia`, `centro_sanitario`, `cobertura_municipio`, `busqueda`,
  `anuncio`, `geocode_cache`, `ruta_cache`, `presupuesto_rutas`, `scraper_state`
- Autenticación: Keycloak 26.1, realm "calendario", JWT verificado a mano
- Rutas peatonales: **motor intercambiable** — OpenRouteService (`foot-walking`
  matrix, misma `ORS_API_KEY` que paraisos y ruta) o una instancia propia de
  Valhalla (`sources_to_targets`, `costing=pedestrian`)
- Geocodificación: Nominatim, 1 req/s, cacheada de forma permanente (patrón de `ruta`)
- Padrón: OpenStreetMap vía Overpass + registro oficial de la comunidad donde exista
- Bot de Telegram: Telegraf, long polling, **de doble sentido** (emite y escucha),
  como el de `gastos` y a diferencia del de `pisos`
- Validaciones: Zod en todos los endpoints que reciben body
- Sin ORM — queries directas con el cliente pg
- Con tests de backend (vitest), ejecutados en CI

### Qué hace
Busca locales comerciales en venta donde instalar una farmacia, y farmacias ya en
funcionamiento en venta, y comprueba la distancia **caminando** (no en línea
recta) a la farmacia y al centro sanitario más cercanos contra la distancia
mínima que exige esa comunidad autónoma. Ámbito nacional: las 52 provincias y las
19 comunidades están sembradas.

### El semáforo (lo que explica casi todo el diseño)
**Nunca dice "cumple" o "no cumple".** La coordenada de un anuncio no es fiable a
escala de 250 m —los portales la desplazan a propósito— así que el veredicto
lleva una banda de incertidumbre derivada de la precisión de las coordenadas
(0 m si es dirección con número, 150 m si es aproximada, 300 m si se desconoce):

- 🟢 **verde**: cumple incluso en el peor caso del error de posición
- 🔴 **rojo**: incumple incluso en el mejor caso
- 🟡 **ámbar**: el dato no permite decidir — hay que mirarlo
- ⚪ **sin_datos**: no se ha podido calcular, y se dice por qué

### Los dos errores no valen lo mismo
Un falso rojo cuesta una oportunidad; un falso verde cuesta un viaje, una señal o
peor. De esa asimetría salen tres comportamientos que hay que respetar al tocar
este código:

1. **Un padrón incompleto degrada los verdes a ámbar.** Un falso verde solo puede
   venir de una farmacia que existe y no está en la base de datos. Se valida
   contra la cota poblacional (~1 farmacia por cada 2.800 habitantes); donde no
   cuadra, no se emite ningún verde.
2. **Sin normativa cargada para una comunidad se devuelve `sin_datos`, no verde.**
3. **Sin población conocida, la cobertura se declara insuficiente.** No saber
   nunca puede leerse como "cumple".

### El prefiltro: dos radios, y el margen NO es opcional
Caminar es siempre >= la línea recta, así que descartar candidatas lejanas no
puede producir falsos negativos. Pero hay **dos** radios y confundirlos produce
falsos verdes:

- **Radio decisivo** = `umbral + margen`. Dentro de él, una candidata sin medir
  puede cambiar el veredicto, así que no medirla degrada a ámbar. Sin sumar el
  margen, una farmacia justo fuera del radio podría estar realmente dentro del
  umbral tras corregir la posición.
- **Radio informativo** = `umbral × 3 + margen`. Solo para poder decir a cuántos
  metros está la más cercana aunque cumpla de sobra.

### Normativa: es dato, no código
Una fila por comunidad en `normativa`, editable por API. El mínimo estatal son
250 m (Ley 16/1997). **`verificado` distingue lo comprobado contra la norma
autonómica de lo que solo hereda ese mínimo**: solo 6 de las 20 filas van
verificadas (Madrid 250/150, Andalucía, Comunidad Valenciana, Baleares, Canarias,
y la excepción canaria de 1.000 m en zonas farmacéuticas turísticas de tipo
común). El resto se sirve con `verificado: false` y el veredicto lo dice.

`distancia_centros_sanitarios_m` a `NULL` significa **"esta comunidad no impone
esa distancia"**, nunca "cero metros".

### Aviso legal (obligatorio en toda superficie que muestre un veredicto)
El método exacto de medición lo fija el reglamento de cada comunidad. Esta app
descarta y prioriza; **no certifica nada**. `AVISO_NO_CERTIFICA` en
`src/viabilidad/index.ts` acompaña a cada veredicto en la API y en el bot.

### El padrón hay que importarlo antes de usar nada
```bash
cd locales/backend && npm run padron -- madrid   # o `todas`
```
Con el padrón vacío toda comprobación devuelve `sin_datos`. El backend lo avisa
en el log al arrancar. Tres reglas del importador: una fuente que desaparece **se
da de baja, no se borra**; una importación fallida **no vacía nada**; y la
cobertura **se recalcula siempre** al terminar.

### Rutas (`/locales/api/*`)
- `GET/POST/PATCH/DELETE /searches` — búsquedas guardadas (Zod discriminado por
  `tipo`: `local` pide superficie/precio, `farmacia` acepta facturación y no
  exige coordenadas). Soft delete. `id` es SERIAL, no UUID.
- `POST /searches/:id/rastrear` — rastreo manual. **No notifica a propósito.**
- `GET /listings` — feed, filtros `busqueda`/`tipo`/`veredicto`/`nuevos`/`descartados`
- `PATCH /listings/:id` · `POST /listings/marcar-vistos` · `DELETE /listings/:id`
- `GET/PATCH /scraper/state` — on/off global del rastreador
- `POST /viabilidad/comprobar` — punto o dirección → veredicto (lo que usa el bot)
- `GET /viabilidad/presupuesto` — cuota de motor de rutas restante hoy
- `GET /normativa` · `PATCH /normativa/:comunidad` — distancias por comunidad
- `GET /padron/cobertura` — dónde el padrón está incompleto (`?incompletos=true`)
- `GET /padron/resumen` — qué hay cargado, por comunidad y fuente
- `GET /health`

### El rastreador corre solo
El planificador vive dentro del proceso del backend (`services/planificador.ts`,
`setTimeout` encadenado, jitter ±20%, respeta `scraper_state.running`). Mientras
el contenedor esté en pie, rastrea cada `LOCALES_INTERVALO_MINUTOS` (default 15).
La primera vuelta de una búsqueda nueva no notifica (traería decenas de anuncios
viejos). Un anuncio 🔴 o ⚪ no dispara aviso; 🟢 y 🟡 sí (el ámbar, marcado como
"a confirmar"). Un envío fallido no marca `notificado` → se reintenta.

### Roles
Único rol con acceso: `admin`, misma postura que Gastos/Ofertas/Ruta/Pisos.
**No añade ningún rol nuevo al realm de Keycloak.**

### Variables de entorno del backend
`LOCALES_DB_HOST`, `LOCALES_DB_NAME`, `LOCALES_DB_USER`, `LOCALES_DB_PASSWORD`,
`LOCALES_DB_PORT`, `KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`, `PORT` (default 3013),
`LOCALES_MOTOR_DISTANCIA` (`ors`|`valhalla`, default `ors`), `ORS_API_KEY`,
`VALHALLA_URL`, `LOCALES_PRESUPUESTO_RUTAS_DIARIO` (default 400 — **el endpoint
de matriz de ORS tiene cuota más baja que el de direcciones**),
`LOCALES_INTERVALO_MINUTOS` (default 15, jitter ±20%),
`LOCALES_PAGINAS_POR_PORTAL` (default 2), `OVERPASS_URL`,
`LOCALES_DATASET_MADRID`, `NOMINATIM_USER_AGENT`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_OWNER_CHAT_ID`. Ver `locales/backend/.env.example`.

### Red Docker
`calendario-net` (externa). El servicio `locales-valhalla` del compose de
producción está tras el perfil `valhalla` y **apagado por defecto**: construir
las teselas de España tarda del orden de una hora y ocupa varios GB, y el backend
no depende de él para arrancar.

### Imágenes Docker
`ghcr.io/manuhddev/locales-backend:latest`, `ghcr.io/manuhddev/locales-frontend:latest`

---

## Trader — Laboratorio de predicción de precios de cripto

### Ubicación
**Fuera de este monorepo**: `crypto-trader/`, repositorio propio
(`https://github.com/ManuHDdev/crypto-trader`, privado). Se integra igual que
`vine-bot` y `marketplace-watcher`: ruta en nginx y entrada en el menú de apps,
sin vivir dentro de `Calendario/`.

### Stack
- Backend: **Python 3.12 + FastAPI** — la única subapp que no es Fastify/TypeScript.
  Desviación deliberada: el backend es un pipeline de investigación con pandas,
  LightGBM y pyarrow, y reescribirlo en Node para respetar la convención sería
  el tipo equivocado de consistencia.
- Frontend: React + Vite + TypeScript (igual que el resto)
- Sin base de datos: los datos son Parquet y JSON sobre un bind mount
  (`/home/manu/trader/data`, ~51MB: velas de 676 pares, series exógenas,
  evaluaciones y cuentas de paper trading)
- Autenticación: Keycloak 26.1, realm "calendario", RS256 verificado con PyJWT
  contra el JWKS del realm. A diferencia del resto de subapps no se verifica el
  JWT a mano: reimplementar comprobaciones de firma en un segundo lenguaje para
  imitar una decisión de estilo añade riesgo sin añadir consistencia real.
- Tests: 261 backend (pytest), 28 frontend (vitest)

### Roles
Único rol con acceso: `admin`. No hay nivel de solo lectura — lo que sirve es un
registro de investigación privado. `familia` e `invitado` reciben 403 (no 401:
están autenticados, reenviarlos al login sería un bucle).

### Rutas (`/trader/api/*`)
- `GET /health` — **única ruta abierta**, porque un healthcheck que necesita
  credencial no sirve como healthcheck
- `GET /status` — series almacenadas y si la ejecución real está activada
- `GET /candles?symbol=&timeframe=&limit=` — velas OHLCV
- `GET /signals?timeframe=` — lectura actual por activo (régimen de tendencia,
  ciclo de halving, estructura Wyckoff), cada una etiquetada con la evidencia
  que el laboratorio estableció para ella
- `GET /paper` — cuentas de paper trading y su curva de equity
- `GET /evaluations`, `GET /evaluations/:symbol/:timeframe` — informes
  walk-forward guardados

Toda la API es de solo lectura: hay un test que falla si aparece cualquier ruta
que no sea `GET`. No existe ninguna credencial de exchange ni ningún camino de
código que coloque una orden.

### Trabajo programado
Cron diario en el VPS a las 00:30 UTC:
`docker exec trader-backend python scripts/tick.py`. Refresca las velas y
avanza las cuentas de paper trading una barra. Idempotente: reejecutarlo no
duplica nada y una ejecución tras una caída recupera los días perdidos.

### Variables de entorno del backend
`CRYPTO_DATA_DIR`, `CRYPTO_MODEL_DIR`, `CRYPTO_CORS_ORIGINS`,
`CRYPTO_KEYCLOAK_CERTS_URL`, `CRYPTO_KEYCLOAK_ISSUER`, `CRYPTO_ENABLE_DOCS`
(false en producción: el frontend proxea todo el prefijo `/trader/api/`, así que
un Swagger expuesto entregaría el esquema a cualquiera que cargase la URL),
`CRYPTO_LIVE_TRADING_ENABLED` (ningún camino de código honra `true`; existe para
que la intención sea explícita)

### Red Docker
`calendario-net` (externa)

### Imágenes Docker
`ghcr.io/manuhddev/trader-backend:latest`, `ghcr.io/manuhddev/trader-frontend:latest`

### CI/CD
El workflow del propio repositorio publica en GHCR usando el `GITHUB_TOKEN` que
GitHub acuña por ejecución con `permissions: packages: write` — **no** un PAT en
`GHCR_TOKEN` como el resto del monorepo. Una credencial de larga vida menos que
crear, guardar y rotar. El job de despliegue está tras
`vars.VPS_DEPLOY_ENABLED` y apagado hasta que se instale una clave SSH dedicada;
mientras tanto se despliega con `scripts/deploy.sh` desde una estación con
acceso al VPS. Ver `DEPLOY.md` en ese repositorio.

### Aviso importante sobre nginx
El bloque `location /trader/` está aplicado **in situ** en el fichero del
servidor (`/home/manu/nginx-shared/conf.d/elbunkerdelingeniero.conf`), que ha
divergido de `nginx/calendario.conf` de este repositorio. Copiar el fichero del
repo encima del servidor rompería las rutas que solo existen allí.

---

## Fútbol (Football Predictor) — Predicción de resultados de fútbol

### Ubicación
Repo independiente `football-predictor/` (fuera de este monorepo), bajo
`/futbol/` — mismo patrón que Rummikub Assistant y Trader: repo standalone
con su propio stack, unido a `calendario-net`.

### Stack
- Backend Python 3.11 + FastAPI hexagonal; frontend React 19 + Vite.
- BD PostgreSQL 16 propia — servicio `db` en su `docker-compose.prod.yml`
  (llamado `db`, **no** `postgres`, para no chocar en `calendario-net` con
  el `postgres` de Calendario).
- Predicción: Dixon-Coles + capa GBM (LightGBM) gateada por backtest,
  100% local, sin LLM ni APIs de pago. Datos: temporada actual de
  football-data.org, histórico (~5 temporadas) de football-data.co.uk.
- Auth: realm `calendario`, cliente compartido `calendario-frontend`
  (sin cliente propio), JWT con PyJWT + PyJWKClient. Solo rol `admin`.

### Rutas (`/futbol/api/*`)
`GET /fixtures`, `GET /fixtures/{id}`, `GET /model/performance`,
`GET /health` (abierto). La Champions League no se predice (el modelo es
por liga; el seed solo cubre las 5 grandes).

`GET /usage` — consumo de hoy de Football-Data.org (interno, para el dashboard
de Panel), bearer-token-gated con `PANEL_INTERNAL_TOKEN` — mismo contrato que
`GET /usage` de Paraísos/Watchlist (comparación en tiempo constante, un JWT de
Keycloak NO da acceso a esta ruta). Esto añade una dependencia cruzada de
repos: `PANEL_INTERNAL_TOKEN` debe tener el mismo valor en el `.env` de
`football-predictor` que en Panel/Paraísos/Watchlist, pese a vivir en un
repositorio separado — ver `panel/backend/src/services/subappUsage.ts`
(`FUTBOL_BACKEND_URL`, default `http://football-predictor-backend-1:8000`).
**Path interno distinto al de Paraísos/Watchlist**: el backend FastAPI registra
la ruta como `/usage` a secas (no `/futbol/api/usage`) — ese prefijo solo lo
añade nginx para el dominio público. Panel llama a `/usage` directamente
contra el contenedor, sin pasar por nginx.

### Despliegue
Pipeline propio en GitHub Actions (`football-predictor/.github/workflows/deploy.yml`,
`workflow_dispatch`): SSH, `deploy/.env`, `docker compose up -d --build`,
health-check. Contenedores `football-predictor-{backend,db,frontend}-1`.

Los bloques nginx `/futbol/` y `/futbol/api/` viven en `nginx/calendario.conf`
de este repo (como los de `trader`/`locales`), así que sobreviven a cualquier
redeploy de Calendario. El `deploy/scripts/install-nginx-snippet.sh` del repo
de football-predictor solo hace falta en un servidor donde ese fichero aún no
los tenga, y no hace nada si ya están.

---

## Sistema de roles (OBLIGATORIO conocer)

Los ocho roles de realm en Keycloak son `admin`, `familia`, `invitado`, `paraisos_admin`, `mapacyd_admin`,
`mapacyd_invitado`, `reparto_admin`, `reparto_invitado`. Cualquier código que filtre por rol DEBE usar
exactamente estos nombres.

| Rol               | Acceso                                                       |
|-------------------|----------------------------------------------------------------|
| admin             | Todas las apps + gestión completa                               |
| familia           | Storage (lectura), MapaCYD (lectura), Juegos (completo)         |
| invitado          | Juegos (completo) — sin acceso a ninguna otra app                |
| paraisos_admin    | Gestión de spots en Paraísos (CRUD)                             |
| mapacyd_admin     | Gestión de zonas y horarios en MapaCYD (CRUD)                   |
| mapacyd_invitado  | Consulta de zonas y horarios en MapaCYD (solo lectura)          |
| reparto_admin     | Gestión completa de grupos de gasto compartido en Reparto (CRUD) |
| reparto_invitado  | Consulta de todos los grupos de Reparto (solo lectura, sin crear/editar) |

Locales tampoco añade rol: solo `admin`, como Gastos/Ofertas/Ruta/Pisos.

Ytdl y Paraísos no aparecen en esta tabla porque son públicas: no requieren
ningún rol ni sesión iniciada, a diferencia del resto de subapps. Gastos, Panel,
Ofertas, Ruta, Pisos, Locales, Trader, Fútbol y Calendario solo son accesibles para `admin` (uso exclusivo del
propietario) — `familia` e `invitado` no las ven en el AppLauncher ni pueden
llamar a su API. Juegos es la única excepción a ese último punto: es la primera
subapp visible y utilizable por los tres roles por igual (ver sección "Juegos"
arriba). Reparto añade un matiz más: es accesible para `admin` y, además,
delegable vía `reparto_admin` (gestión completa) y `reparto_invitado` (solo
consulta) — sin necesitar acceso `admin` global, igual que ya ocurría con
Paraísos y MapaCYD.

Los roles `paraisos_admin`, `mapacyd_admin` y `reparto_admin` son roles
delegados: permiten gestionar una subapp concreta sin tener acceso `admin`
global. Un usuario con `paraisos_admin` puede crear, editar y borrar spots en
Paraísos; con `mapacyd_admin` puede gestionar zonas y horarios en MapaCYD; con
`reparto_admin` puede crear y administrar grupos de gasto compartido en
Reparto. Los tres se asignan automáticamente al usuario `propietario` por el
script de realm.

`mapacyd_invitado` y `reparto_invitado` son roles delegados de solo lectura
(consulta sin poder gestionar) — `mapacyd_invitado` fue el primer caso real de
la convención `<app>_invitado` (documentada en memoria pero no aplicada a
ninguna subapp hasta entonces); `reparto_invitado` es el segundo. A diferencia
de los roles `_admin`, ninguno de los dos se asigna automáticamente a
`propietario` — ambos se crean en el realm pero quedan sin asignar, delegables
manualmente desde Panel cuando haga falta.

El usuario por defecto se llama `propietario` y tiene roles `admin`, `paraisos_admin`, `mapacyd_admin` y `reparto_admin`.

## Keycloak — configuración y despliegue

### Archivos de realm
- `infra/keycloak/realm-export.json` → usado en local (ports 4200/5173/5174/5175)
- `infra/keycloak/realm-export.prod.json` → usado en producción

El realm se importa SOLO la primera vez que Keycloak arranca (flag `--import-realm`).
Si Keycloak ya está corriendo y hay cambios en el realm, usar:

```bash
bash scripts/keycloak-update-realm.sh [host] [admin_user] [admin_password]
```

Ejemplos:
```bash
# Local
bash scripts/keycloak-update-realm.sh

# Producción (desde el VPS o con acceso directo)
bash scripts/keycloak-update-realm.sh http://localhost:8080 admin <password_del_env>
```

### DEPLOY_NOTES.md
El archivo `DEPLOY_NOTES.md` en la raíz del proyecto puede contener instrucciones
específicas para el despliegue actual. Siempre leerlo antes de desplegar y borrar
su contenido tras aplicar las instrucciones (dejar el archivo vacío).

## Puertos locales
| App                | Frontend | Backend |
|--------------------|----------|---------|
| Calendario         | :4200    | :8081   |
| Panel              | :5174    | :3002   |
| Storage            | :5173    | :3001   |
| MapaCYD            | :5175    | :3003   |
| Ytdl               | :5176    | :3004   |
| Gastos             | :5177    | :3005   |
| Ofertas            | :5178    | :3006   |
| Paraísos           | :5179    | :3007   |
| Juegos             | :5180    | :3008   |
| Watchlist          | :5181    | :3009   |
| Reparto            | :5182    | :3010   |
| Trader             | :5183    | :3011   |
| Ruta               | :5183    | :3011   |
| Pisos              | :5184    | :3012   |
| Locales            | :5185    | :3013   |
| Fútbol (repo externo, stack propio) | :5186 | :8000 |
| Keycloak           | :8080    | —       |
| PostgreSQL (cal)   | :5433    | —       |
| PostgreSQL (mapacyd)| :5434   | —       |
| PostgreSQL (gastos) | :5435  | —       |
| PostgreSQL (ofertas)| :5436  | —       |
| PostgreSQL (paraisos)| :5437 | —       |
| PostgreSQL (watchlist)| :5438| —       |
| PostgreSQL (reparto)| :5439  | —       |
| PostgreSQL (ruta)  | :5440   | —       |
| PostgreSQL (pisos) | :5441   | —       |
| PostgreSQL (locales)| :5442  | —       |

## Deuda técnica conocida

- **Sin tests**: Panel (backend) tiene vitest desde el dashboard de uso de APIs (`subappUsage.ts`, `routes/usage.ts`) pero el resto del backend (`users.ts`, `me.ts`, `keycloakAdmin.ts`) y todo el frontend siguen sin cobertura; mapacyd (backend y frontend) sigue sin ningún test, pese a tener pipelines de CI. Storage sí los tiene desde el fix del 413 (vitest en backend: permisos, tipos MIME, subidas troceadas y alineación del tope de subida con los dos nginx; y en frontend: paginación de la rejilla y el cliente de subida reanudable). Calendario sí los tiene (JUnit/Mockito/TestContainers en backend, specs de Angular en frontend). Ytdl backend sí tiene tests (vitest: allowlist de URL, validación de formato, guard de rol) — se añadieron desde el principio al ser una feature nueva; su frontend, igual que el resto, no tiene. Se acepta como deuda existente — cualquier cambio grande o feature nueva en Panel/Storage/mapacyd/Ytdl SÍ debería incluir tests a partir de ahora.
- **JWT middleware duplicado**: `verifyJwt`/`authMiddleware` está copiado casi idéntico en `panel/backend`, `storage/backend`, `mapacyd/backend`, `ytdl/backend` y `watchlist/backend` — no hay paquete compartido. No se toca en esta auditoría, solo se deja constancia.
- **AppLauncher (panel de 9 puntitos) duplicado**: cada frontend tiene su propia copia hardcodeada de la lista de apps — `panel/frontend/src/components/AppLauncher.tsx`, `storage/frontend/src/components/AppLauncher.tsx`, `mapacyd/frontend/src/components/AppLauncher.tsx`, `ytdl/frontend/src/components/AppLauncher.tsx`, `gastos/frontend/src/components/AppLauncher.tsx`, `ofertas/frontend/src/components/AppLauncher.tsx`, `paraisos/frontend/src/components/AppLauncher.tsx`, `juegos/frontend/src/components/AppLauncher.tsx`, `watchlist/frontend/src/components/AppLauncher.tsx`, `reparto/frontend/src/components/AppLauncher.tsx`, `ruta/frontend/src/components/AppLauncher.tsx`, `pisos/frontend/src/components/AppLauncher.tsx`, `locales/frontend/src/components/AppLauncher.tsx`, `crypto-trader/frontend/src/components/AppLauncher.tsx` (fuera de este monorepo, ver Trader abajo) y `calendario-frontend/src/app/shared/components/app-launcher/app-launcher.ts`. No hay paquete compartido porque cada subapp es una imagen Docker independiente con su propio contexto de build (`COPY . .` solo dentro de `<subapp>/frontend`) — extraerlo a un paquete común implicaría tocar 14 Dockerfiles y 14 pipelines de CI. **Regla obligatoria: cada vez que se añada o quite una subapp, actualizar las 15 copias de arriba en el mismo cambio** (id, nombre, color, roles, URL local/prod e icono SVG), para que quede visible para `admin` en todas partes.

`locales` ya está en las 14 copias del AppLauncher (`roles: ['admin']`), añadido
junto con su frontend (fase 9). `crypto-trader/frontend` sigue fuera de este
repo y se actualiza aparte.
