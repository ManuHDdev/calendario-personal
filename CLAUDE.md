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
- admin → gestión completa (POST/PUT/DELETE zonas y horarios)
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

## Sistema de roles (OBLIGATORIO conocer)

Los tres roles de realm en Keycloak son `admin`, `familia`, `invitado`.
Cualquier código que filtre por rol DEBE usar exactamente estos nombres.

| Rol       | Acceso                                                       |
|-----------|----------------------------------------------------------------|
| admin     | Todas las apps + gestión completa                               |
| familia   | Calendario, Storage (lectura), MapaCYD (lectura)                |
| invitado  | Solo Calendario                                                 |

Ytdl no aparece en esta tabla porque es pública: no requiere ningún rol ni
sesión iniciada, a diferencia del resto de subapps.

El usuario por defecto se llama `propietario` y tiene rol `admin`.

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
| Keycloak           | :8080    | —       |
| PostgreSQL (cal)   | :5433    | —       |
| PostgreSQL (mapacyd)| :5434   | —       |

## Deuda técnica conocida

- **Sin tests**: Panel, Storage y mapacyd (backend y frontend) no tienen ningún test, pese a tener pipelines de CI. Calendario sí los tiene (JUnit/Mockito/TestContainers en backend, specs de Angular en frontend). Ytdl backend sí tiene tests (vitest: allowlist de URL, validación de formato, guard de rol) — se añadieron desde el principio al ser una feature nueva; su frontend, igual que el resto, no tiene. Se acepta como deuda existente — cualquier cambio grande o feature nueva en Panel/Storage/mapacyd/Ytdl SÍ debería incluir tests a partir de ahora.
- **JWT middleware duplicado**: `verifyJwt`/`authMiddleware` está copiado casi idéntico en `panel/backend`, `storage/backend`, `mapacyd/backend` y `ytdl/backend` — no hay paquete compartido. No se toca en esta auditoría, solo se deja constancia.
