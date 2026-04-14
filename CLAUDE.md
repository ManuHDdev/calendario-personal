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
- Validaciones: Zod (igual que panel y storage)
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
