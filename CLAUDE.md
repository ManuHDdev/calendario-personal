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

## Antes de generar cualquier fichero
Lee siempre los ficheros existentes de la misma capa para seguir el mismo patrón.
