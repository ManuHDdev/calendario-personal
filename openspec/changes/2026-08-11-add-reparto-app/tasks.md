## 1. Base de datos (`reparto` Postgres DB)

- [ ] 1.1 Crear base de datos `reparto` en la instancia Postgres compartida (puerto local `:5439`), propias credenciales — requiere `infra/docker-compose.local.yml` (tasks.md sección 8, "Infra wiring"), fuera del alcance de esta fase; `reparto/infra/init.sql` (1.2-1.7) ya está listo para montarse ahí cuando se cree ese compose
- [x] 1.2 Migración `infra/init.sql`: tabla `group` (`id`, `name`, `access_token` text único, `manager_keycloak_user_id` text, `activo` boolean default true, `deleted_at` timestamp nullable, `created_at`, `updated_at`)
- [x] 1.3 Migración: tabla `group_member` (`id`, `group_id` FK, `name` text, `keycloak_user_id` text nullable, `activo`, `deleted_at`, `created_at`)
- [x] 1.4 Migración: tabla `expense` (`id`, `group_id` FK, `payer_member_id` FK, `amount` numeric, `description` text, `date` date, `category` text nullable, `split_type` enum `equal|exact|percentage`, `activo`, `deleted_at`, `created_at`, `updated_at`)
- [x] 1.5 Migración: tabla `expense_split` (`id`, `expense_id` FK, `member_id` FK, `share_amount` numeric, `share_percentage` numeric nullable)
- [x] 1.6 Índices: `group(access_token)` único, `group_member(group_id)`, `expense(group_id)`, `expense_split(expense_id)`
- [x] 1.7 Trigger `update_updated_at_column()` reutilizado en `group` y `expense` (mismo patrón que `gastos`)

## 2. Backend scaffold (`reparto/backend/`)

- [x] 2.1 Scaffold `reparto/backend/` como Fastify + TypeScript, copiando `gastos/backend`'s `package.json`/`tsconfig.json`/estructura como punto de partida
- [x] 2.2 Copiar `gastos/backend/src/middleware/auth.ts` verbatim a `reparto/backend/src/middleware/auth.ts` (`verifyJwt`, `hasAnyRole`, `authMiddleware`)
- [x] 2.3 `db/pool.ts`: `pg.Pool` + parser custom de `NUMERIC` (OID 1700) → number, igual que `gastos`
- [x] 2.4 `GET /reparto/api/health`
- [x] 2.5 Env vars: `REPARTO_DB_HOST`, `REPARTO_DB_NAME`, `REPARTO_DB_USER`, `REPARTO_DB_PASSWORD`, `KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`, `PORT` (default 3010)

## 3. Autorización de grupo (token de acceso)

- [x] 3.1 Generación de `access_token` (`crypto.randomBytes(24).toString('base64url')`) al crear el grupo
- [x] 3.2 `POST /reparto/api/groups/by-token` — recibe `{ token }`, resuelve el grupo con `crypto.timingSafeEqual`, emite un JWT/token de sesión de grupo de corta vida con `groupId` embebido (firmado con un secreto propio de `reparto`, no reutiliza el de Keycloak)
- [x] 3.3 `groupTokenMiddleware` — `preHandler` que valida el token de sesión de grupo y expone `request.groupId`
- [x] 3.4 `authOrGroupToken(groupIdParam)` — `preHandler` compuesto: prueba JWT de Keycloak (`admin`/`reparto_admin`/`reparto_invitado`), si falla prueba token de sesión de grupo válido para ese `groupId`; si ninguno vale, 401
- [x] 3.5 `POST /reparto/api/groups/:id/rotate-token` (solo gestor Keycloak) — regenera `access_token`, invalida el enlace anterior
- [x] 3.6 Unit tests: comparación en tiempo constante, rechazo de token inválido/de otro grupo, las tres combinaciones de `authOrGroupToken` (JWT válido, token de grupo válido, ninguno)

## 4. Grupos y miembros (API)

- [x] 4.1 `POST /reparto/api/groups` (Keycloak `admin`/`reparto_admin`) — alta de grupo, Zod-validado (`name`), genera `access_token`, guarda `manager_keycloak_user_id` del creador
- [x] 4.2 `GET /reparto/api/groups` (Keycloak `admin`/`reparto_admin`/`reparto_invitado`) — listado de grupos del sistema, filtrado por `activo=true`
- [x] 4.3 `GET /reparto/api/groups/:id` (`authOrGroupToken`) — detalle de grupo (sin exponer `access_token` salvo al gestor)
- [x] 4.4 `DELETE /reparto/api/groups/:id` (solo gestor Keycloak) — soft delete (`activo=false`, `deleted_at=now()`)
- [x] 4.5 `POST /reparto/api/groups/:id/members` (`authOrGroupToken`) — alta de miembro por nombre libre, Zod-validado
- [x] 4.6 `PATCH /reparto/api/groups/:id/members/:memberId` (`authOrGroupToken`) — renombrar miembro
- [x] 4.7 `DELETE /reparto/api/groups/:id/members/:memberId` (solo gestor Keycloak) — soft delete, solo si no tiene gastos activos asociados como pagador o participante (400 si los tiene, con mensaje explicando por qué)
- [x] 4.8 Unit tests: Zod rechaza cuerpos malformados, guard de rol/token rechaza accesos cruzados entre grupos, borrado de miembro con gastos asociados devuelve 400

## 5. Gastos y reparto (API)

- [x] 5.1 `POST /reparto/api/groups/:id/expenses` (`authOrGroupToken`) — alta de gasto con `split_type` y lista de splits; valida `equal` (reparto server-side con ajuste de céntimos), `exact` (suma == `amount`), `percentage` (suma == 100 ±0.01, `share_amount` calculado server-side)
- [x] 5.2 `GET /reparto/api/groups/:id/expenses` (`authOrGroupToken`) — listado, filtrado por `activo=true`, incluye splits
- [x] 5.3 `PATCH /reparto/api/groups/:id/expenses/:expenseId` (`authOrGroupToken`) — edición de campos y/o splits (recalcula igual que en el alta)
- [x] 5.4 `DELETE /reparto/api/groups/:id/expenses/:expenseId` (`authOrGroupToken`) — soft delete
- [x] 5.5 `GET /reparto/api/groups/:id/categories` (`authOrGroupToken`) — categorías distintas usadas en el grupo (autocompletado)
- [x] 5.6 Unit tests: `equal` reparte céntimos sobrantes de forma estable, `exact` rechaza sumas que no cuadran, `percentage` rechaza sumas != 100, edición recalcula splits correctamente

## 6. Balances y liquidación

- [x] 6.1 `GET /reparto/api/groups/:id/balances` (`authOrGroupToken`) — balance neto por miembro (pagado − parte que le corresponde), agregación en SQL
- [x] 6.2 `simplifyDebts(balances): Transfer[]` — función pura, algoritmo greedy (mayor deudor ↔ mayor acreedor)
- [x] 6.3 `GET /reparto/api/groups/:id/settlement` (`authOrGroupToken`) — lista de transferencias sugeridas usando `simplifyDebts`
- [x] 6.4 Unit tests: balances suman cero, `simplifyDebts` con fixtures conocidos (2, 3, 5 miembros) produce el número de transferencias esperado y cuadra los saldos

## 7. Frontend (`reparto/frontend/`)

- [x] 7.1 Scaffold `reparto/frontend/` como React + Vite + TypeScript, mirroring `gastos/frontend`'s (login Keycloak + cliente API)
- [x] 7.2 Flujo gestor: login Keycloak → listado de grupos → crear grupo → vista de gestión (miembros, regenerar enlace, borrar grupo)
- [x] 7.3 Flujo miembro sin cuenta: ruta `/reparto/g/:token` que resuelve el token, sin pantalla de login, entra directo a la vista de grupo
- [x] 7.4 Vista de grupo (compartida entre gestor y miembro por token): listado de gastos, formulario de alta/edición con selector de `split_type` (igual / exacto / porcentaje) y UI de reparto por participante
- [x] 7.5 Vista de balances: saldo por miembro + lista de transferencias sugeridas ("X le debe Y € a Z")
- [x] 7.6 Pantalla "Compartir grupo": muestra el enlace actual, botón de copiar, botón de regenerar (con confirmación, avisando que invalida el enlace anterior)
- [x] 7.7 `reparto/frontend/Dockerfile` mirroring `gastos/frontend`'s

## 8. Infra wiring

- [x] 8.1 `infra/docker-compose.yml` (+ `.prod.yml`): servicios `reparto-backend`/`reparto-frontend` en `calendario-net`, volumen para la base de datos — implementado como `reparto/infra/docker-compose.local.yml` + `docker-compose.prod.yml`, mirroring exactamente el patrón por-subapp usado por gastos/ofertas/paraisos/watchlist (no existe un `infra/docker-compose.yml` raíz compartido entre subapps)
- [x] 8.2 `nginx/calendario.conf`: nuevo location block para `reparto`
- [x] 8.3 `start-local.sh`/`start-local.ps1`: añadir `reparto-backend` (puerto 3010) y `reparto-frontend` (puerto 5182) al stack local
- [x] 8.4 CI: workflow de GitHub Actions para `reparto` mirroring el resto de subapps (build + push a `ghcr.io`)
- [x] 8.5 Actualizar las 10 copias de `AppLauncher` (9 React `.tsx` + 1 Angular `.ts`): entrada `reparto` (id/nombre/color/roles `['admin','reparto_admin','reparto_invitado']`/URL local+prod/icono SVG) — más la 11ª copia propia de `reparto/frontend`

## 9. Roles Keycloak

- [x] 9.1 `scripts/keycloak-update-realm.sh`: añadir `reparto_admin` y `reparto_invitado` al bucle de creación de roles; asignar solo `reparto_admin` a `propietario`
- [x] 9.2 `infra/keycloak/realm-export.json` y `realm-export.prod.json`: añadir las definiciones de `reparto_admin` y `reparto_invitado`
- [x] 9.3 `panel/backend/src/services/keycloakAdmin.ts`: añadir ambos roles al array de `listRoles()` Y al array de `setUserRoles()`
- [x] 9.4 `panel/frontend/src/components/UserModal.tsx` y `panel/frontend/src/pages/PanelPage.tsx`: añadir etiqueta/color para ambos roles y actualizar los filtros `.includes(r)`
- [ ] 9.5 Tras mergear: ejecutar `scripts/keycloak-update-realm.sh` contra el Keycloak de producción para crear los roles realmente (los JSON de realm-export solo aplican en un `--import-realm` desde cero) — acción operativa posterior al merge, fuera del alcance de esta fase de wiring de archivos, se deja sin marcar intencionadamente

## 10. Documentación

- [x] 10.1 `reparto/README.md` — descripción de la app y cómo funciona el enlace de acceso de grupo
- [x] 10.2 `CLAUDE.md`: nueva sección `## Reparto` siguiendo el formato de las demás subapps, entrada en la tabla de puertos, entrada en la tabla "Sistema de roles"

## 11. Verificación

- [x] 11.1 `npm run build` (backend) y `npm run build` (frontend) compilan sin errores — verificado directamente: `tsc` limpio en ambos
- [x] 11.2 Tests unitarios de backend en verde (reparto igual/exacto/porcentual, balances, `simplifyDebts`, guards de autorización combinados) — verificado directamente: 63/63 tests (vitest)
- [x] 11.3 (parcial) Manual end-to-end contra Postgres real: `reparto-db-local` levantado, `init.sql` aplicado limpio (4 tablas), backend arrancado contra esa BD. Probado vía curl con un grupo insertado directamente en BD (sin poder generarlo desde `POST /groups`, que exige JWT de Keycloak — ver nota abajo): `POST /groups/by-token` con token válido → sessionToken; con token inválido → 404; alta de 2 miembros sin cuenta vía sessionToken; gasto de 10,00€ reparto `equal` entre 2 → céntimos cuadran exacto (5,00/5,00); `GET /balances` suma cero; `GET /settlement` sugiere la transferencia correcta; split `exact` con suma incorrecta → 400; `DELETE /groups/:id` con solo sessionToken (sin JWT) → 401 (correcto, ver spec.md actualizado). **No probado**: el flujo de gestor vía Keycloak (crear grupo, regenerar enlace, login `admin`) — el Keycloak compartido (`infra/docker-compose.yml`, puerto 5433/8080) no se pudo levantar en esta sesión por conflicto de puerto con el contenedor `latam-market-db` de otro proyecto ya corriendo; pendiente de que el usuario lo pruebe con `start-local.sh`/`.ps1` cuando pare ese otro proyecto o libere el puerto.
- [ ] 11.4 Confirmar que un usuario `familia`/`invitado` sin los roles de `reparto` no ve la app en el AppLauncher y recibe 401/403 si llama a la API de gestión directamente — **no ejecutado**: requiere el Keycloak compartido arriba con un usuario `familia`/`invitado` real, mismo bloqueo de puerto que 11.3
