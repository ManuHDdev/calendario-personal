## Why

El propietario quiere repartir gastos de grupo (viajes, pisos compartidos, cenas) de la misma forma que
Tricount: crear un grupo, apuntar gastos pagados por distintas personas, y ver quién le debe a quién sin
tener que hacer cuentas a mano. A diferencia de todas las subapps existentes, los participantes de un
grupo no tienen por qué tener cuenta en el sistema — en Tricount cualquiera se añade por nombre. Ninguna
subapp actual (Gastos, Calendario, Panel...) cubre reparto multi-persona; Gastos es explícitamente
personal y de un solo usuario.

## What Changes

- Añadir una nueva subapp `reparto`: gestión de grupos de gasto compartido al estilo Tricount.
- Un usuario Keycloak autenticado (rol `admin` o `reparto_admin`) crea un grupo y se convierte en su
  gestor. El gestor añade miembros por nombre libre — no requieren cuenta ni login.
- Cada grupo genera un **enlace de acceso compartible** (token opaco de solo lectura/aportación, sin
  login) para que los miembros sin cuenta puedan entrar, ver el grupo y añadir/editar sus propios gastos
  sin pasar por Keycloak. El gestor sigue siendo el único que puede borrar el grupo o expulsar miembros.
- Backend (Fastify + TypeScript, Postgres propia vía `pg`, Zod): grupos, miembros, gastos con reparto
  igual / importes exactos / porcentajes, cálculo de balances por miembro y sugerencia de liquidación
  (algoritmo greedy que minimiza el número de transferencias).
- Frontend (React + Vite + TypeScript): listado de grupos (gestor), vista de grupo (gestor vía Keycloak
  o miembro vía enlace) con gastos, balances y "quién debe a quién".
- Auth: dos vías independientes en la misma app — JWT de Keycloak verificado a mano (igual que
  gastos/paraisos) para el gestor, y un token de grupo opaco (columna `access_token` en `group`,
  comparación en tiempo constante) para miembros sin cuenta — mismo patrón de "dos mecanismos
  independientes para dos audiencias" ya usado en `ofertas` (JWT vs `SCRAPER_API_KEY`), adaptado a
  autorización por grupo en vez de global.
- Roles Keycloak nuevos: `reparto_admin` (gestión completa, delegable sin dar `admin` global) y
  `reparto_invitado` (consulta, primer caso real de esta convención documentada pero nunca aplicada).
- Docker: nuevas imágenes `reparto-backend`/`reparto-frontend`, se unen a `calendario-net`; nginx recibe
  un nuevo location block.

## Capabilities

### New Capabilities
- `reparto`: grupos de gasto compartido — alta de grupo, miembros por nombre libre + enlace de acceso sin
  cuenta, gastos con reparto igual/exacto/porcentual, balances por miembro, sugerencia de liquidación.

### Modified Capabilities
(ninguna — cambio aditivo; no se modifica el comportamiento de ninguna subapp existente)

## Impact

- Nuevo directorio `reparto/` (backend + frontend) en la raíz del monorepo, junto a `gastos/`, `ofertas/`,
  `paraisos/`.
- Nueva base de datos Postgres `reparto` (propia, sin ORM, soft delete) en la misma instancia compartida.
- `infra/docker-compose.yml` (+ `.prod.yml`): dos servicios nuevos en `calendario-net`, más volumen para
  la base de datos de `reparto`.
- `nginx/calendario.conf`: nuevo location block para `reparto`.
- Las 10 copias de `AppLauncher` (9 React `.tsx` + 1 Angular `.ts`): nueva entrada `reparto` con
  `roles: ['admin', 'reparto_admin', 'reparto_invitado']`.
- `scripts/keycloak-update-realm.sh` + `infra/keycloak/realm-export.json` + `realm-export.prod.json`:
  nuevos roles de realm `reparto_admin` (asignado a `propietario`) y `reparto_invitado` (creado, sin
  asignar).
- `panel/backend/src/services/keycloakAdmin.ts` (`listRoles()` y el array de `setUserRoles()`) y
  `panel/frontend` (arrays de etiqueta/color/filtro): añadir los dos roles nuevos para que el Panel pueda
  asignarlos/desasignarlos.
- `CLAUDE.md`: nueva sección `## Reparto`, entrada en la tabla de puertos y en la tabla "Sistema de
  roles".
- No hay cambios en Calendario, Panel, Storage, MapaCYD, Ytdl, Gastos, Ofertas, Paraísos, Juegos o
  Watchlist más allá de la entrada de AppLauncher y los arrays de roles del Panel.
