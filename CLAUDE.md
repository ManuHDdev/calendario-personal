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
- familia → solo consulta (GET /api/zonas)
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
- `GET /health`

### Variables de entorno
`KEYCLOAK_BASE_URL`, `KEYCLOAK_CERTS_URL`, `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`, `CORS_ORIGIN`, `PORT` (default 3002)

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
`admin` y `familia` → acceso completo (subir, mover, borrar, crear carpetas). `invitado` → sin acceso.

### Rutas (`/storage/api/*`)
`GET /files`, `GET /folders`, `POST /upload`, `GET /files/:path/download|preview|thumbnail`, `PATCH /files/:path` (mover), `DELETE /files/:path`, `POST /folders`, `PATCH /folders/:path` (renombrar), `DELETE /folders/:path`, `GET /health`

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
- `GET /health`

### Variables de entorno del backend
`PARAISOS_DB_HOST`, `PARAISOS_DB_NAME`, `PARAISOS_DB_USER`, `PARAISOS_DB_PASSWORD`, `KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`, `PORT` (default 3007)

### Red Docker
`calendario-net` (externa)

### Imágenes Docker
`ghcr.io/manuhddev/paraisos-backend:latest`, `ghcr.io/manuhddev/paraisos-frontend:latest`

---

## Sistema de roles (OBLIGATORIO conocer)

Los cinco roles de realm en Keycloak son `admin`, `familia`, `invitado`, `paraisos_admin`, `mapacyd_admin`.
Cualquier código que filtre por rol DEBE usar exactamente estos nombres.

| Rol             | Acceso                                                       |
|-----------------|----------------------------------------------------------------|
| admin           | Todas las apps + gestión completa                               |
| familia         | Storage (lectura), MapaCYD (lectura)                             |
| invitado        | Sin acceso a ninguna app                                         |
| paraisos_admin  | Gestión de spots en Paraísos (CRUD)                             |
| mapacyd_admin   | Gestión de zonas y horarios en MapaCYD (CRUD)                   |

Ytdl y Paraísos no aparecen en esta tabla porque son públicas: no requieren
ningún rol ni sesión iniciada, a diferencia del resto de subapps. Gastos, Panel,
Ofertas y Calendario solo son accesibles para `admin` (uso exclusivo del
propietario) — `familia` e `invitado` no las ven en el AppLauncher ni pueden
llamar a su API.

Los roles `paraisos_admin` y `mapacyd_admin` son roles delegados: permiten
gestionar una subapp concreta sin tener acceso `admin` global. Un usuario con
`paraisos_admin` puede crear, editar y borrar spots en Paraísos; con
`mapacyd_admin` puede gestionar zonas y horarios en MapaCYD. Ambos roles se
asignan automáticamente al usuario `propietario` por el script de realm.

El usuario por defecto se llama `propietario` y tiene roles `admin`, `paraisos_admin` y `mapacyd_admin`.

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
| Keycloak           | :8080    | —       |
| PostgreSQL (cal)   | :5433    | —       |
| PostgreSQL (mapacyd)| :5434   | —       |
| PostgreSQL (gastos) | :5435  | —       |
| PostgreSQL (ofertas)| :5436  | —       |
| PostgreSQL (paraisos)| :5437 | —       |

## Deuda técnica conocida

- **Sin tests**: Panel, Storage y mapacyd (backend y frontend) no tienen ningún test, pese a tener pipelines de CI. Calendario sí los tiene (JUnit/Mockito/TestContainers en backend, specs de Angular en frontend). Ytdl backend sí tiene tests (vitest: allowlist de URL, validación de formato, guard de rol) — se añadieron desde el principio al ser una feature nueva; su frontend, igual que el resto, no tiene. Se acepta como deuda existente — cualquier cambio grande o feature nueva en Panel/Storage/mapacyd/Ytdl SÍ debería incluir tests a partir de ahora.
- **JWT middleware duplicado**: `verifyJwt`/`authMiddleware` está copiado casi idéntico en `panel/backend`, `storage/backend`, `mapacyd/backend` y `ytdl/backend` — no hay paquete compartido. No se toca en esta auditoría, solo se deja constancia.
- **AppLauncher (panel de 9 puntitos) duplicado**: cada frontend tiene su propia copia hardcodeada de la lista de apps — `panel/frontend/src/components/AppLauncher.tsx`, `storage/frontend/src/components/AppLauncher.tsx`, `mapacyd/frontend/src/components/AppLauncher.tsx`, `ytdl/frontend/src/components/AppLauncher.tsx`, `gastos/frontend/src/components/AppLauncher.tsx`, `ofertas/frontend/src/components/AppLauncher.tsx`, `paraisos/frontend/src/components/AppLauncher.tsx` y `calendario-frontend/src/app/shared/components/app-launcher/app-launcher.ts`. No hay paquete compartido porque cada subapp es una imagen Docker independiente con su propio contexto de build (`COPY . .` solo dentro de `<subapp>/frontend`) — extraerlo a un paquete común implicaría tocar 7 Dockerfiles y 7 pipelines de CI. **Regla obligatoria: cada vez que se añada o quite una subapp, actualizar las 8 copias de arriba en el mismo cambio** (id, nombre, color, roles, URL local/prod e icono SVG), para que quede visible para `admin` en todas partes.
