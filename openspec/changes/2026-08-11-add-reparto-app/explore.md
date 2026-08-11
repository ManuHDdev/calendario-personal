# Exploration: add "reparto" subapp (Tricount clone)

## 1. Convenciones confirmadas en `CLAUDE.md`

Cada subapp (salvo `calendario`, Spring Boot/Angular) sigue: Fastify+TS backend, React+Vite+TS frontend,
Postgres propia por subapp en la instancia compartida, JWT de Keycloak verificado a mano (RS256 vía JWKS,
sin librería de verificación), Zod en endpoints con body (mapacyd/gastos/ofertas/paraisos/watchlist lo usan;
panel/storage/ytdl/juegos validan a mano — no es universal, pero las apps que gestionan datos financieros/
propios sí lo usan, y `reparto` pertenece a ese grupo), soft delete (`activo boolean default true` +
`deleted_at timestamp`, listados siempre filtran `activo=true`), sin ORM (queries `pg` parametrizadas),
red Docker `calendario-net` externa, vars `KEYCLOAK_CERTS_URL`/`PORT`, rol dedicado `<app>_admin` por
subapp (hoy solo existen `paraisos_admin` y `mapacyd_admin` — **`<app>_invitado` no existe todavía en
ningún subapp real**, pese a estar documentado como convención objetivo).

Dos precedentes de acceso mixto relevantes:
- **Ytdl / Paraísos**: públicas, `roles: null` en AppLauncher, Keycloak con `onLoad: 'check-sso'`.
- **Paraísos**: rutas públicas de consulta + rutas admin (`authMiddleware(['admin','paraisos_admin'])`) —
  el patrón de split lectura-pública/gestión-autenticada más parecido a lo que necesita `reparto`, aunque
  "público" en paraísos es anónimo-para-cualquiera, mientras que `reparto` necesita algún tipo de acceso
  por grupo (no existe precedente de autorización a nivel de registro en el monorepo).

## 2. Precedente estructural — ficheros leídos

**`gastos/backend/src`**:
- `index.ts`: bootstrap Fastify, `@fastify/cors` (origin desde `CORS_ORIGIN`), prefijo `/gastos/api`,
  `/health` inline, `PORT` default 3005.
- `middleware/auth.ts`: JWT verificado a mano (decode base64url + `jwks-rsa` + `createVerify('RSA-SHA256')`),
  expone `hasAnyRole(payload, allowedRoles)` y `authMiddleware(allowedRoles)` como `preHandler`. Casi
  idéntico en `paraisos` (deuda técnica documentada: sin paquete compartido).
- `db/pool.ts`: `pg.Pool` + parser custom para `NUMERIC` (OID 1700) → number JS. Relevante para importes/
  splits de `reparto`.
- `db/queries.ts`: funciones que devuelven `{ text, values }`, siempre con `activo = true`.
- `routes/gastos.ts`: un fichero de rutas por recurso, `authMiddleware([...])` por ruta, Zod `.safeParse()`
  inline, error 400 uniforme, DELETE = soft delete (`UPDATE ... SET activo=false, deleted_at=NOW()`).
- `schemas/gasto.schema.ts`: Zod colocado por recurso (`createXSchema`, `updateXSchema` con `.strict()`,
  `listXQuerySchema`), tipos inferidos con `z.infer<>`.
- `infra/init.sql`: **mecanismo real de migración del monorepo** — un único SQL idempotente
  (`CREATE TABLE IF NOT EXISTS` + trigger `update_updated_at_column()` + índices), montado en
  `/docker-entrypoint-initdb.d/init.sql` vía `docker-compose.local.yml`. No existe framework de
  migraciones en ningún subapp — los cambios de esquema se editan a mano en este fichero.
- `infra/docker-compose.local.yml`: compose dedicado por subapp (no hay compose raíz compartido),
  DB expuesta en el host (gastos: 5435), volumen nombrado, healthcheck.
- `Dockerfile`: build Node 20 Alpine en dos etapas, `EXPOSE 3005`, `CMD ["node","dist/index.js"]`.

**`paraisos/backend/src`**:
- `middleware/auth.ts`: estructuralmente idéntico al de gastos.
- `routes/spots.ts`: separa en el mismo fichero secciones "rutas públicas" y "rutas admin
  (`authMiddleware(['admin','paraisos_admin'])`)" — patrón a imitar para un futuro rol `reparto_admin`.
  Incluye un helper `toSpotDto` que limpia `activo`/`deleted_at` antes de responder al cliente.

## 3. AppLauncher — 10 copias confirmadas

`ytdl`, `watchlist`, `storage`, `paraisos`, `panel`, `ofertas`, `mapacyd`, `gastos`, `juegos`
(`frontend/src/components/AppLauncher.tsx`) + `calendario-frontend/src/app/shared/components/app-launcher/app-launcher.ts`
(Angular). Estructura de referencia (`gastos/frontend/src/components/AppLauncher.tsx`): array `APPS: AppDef[]`
(`id`, `nombre`, `color`, `roles: string[] | null`), `getUrls()` (local vs prod), `AppIcon` con un `case` SVG
por app, filtro `visibles = APPS.filter(a => !a.roles || a.roles.some(r => roles.includes(r)))`.

## 4. Ficheros de roles de Keycloak a tocar

- `scripts/keycloak-update-realm.sh`: bucle de creación de roles (línea ~52) + bloques de asignación a
  `propietario` (líneas ~99-136) + eco final de documentación (~192-193).
- `infra/keycloak/realm-export.json` y `realm-export.prod.json`: bloque de definición de roles
  (`admin`, `familia`, `invitado`, `paraisos_admin`, `mapacyd_admin`).
- `panel/backend/src/services/keycloakAdmin.ts`: array de `listRoles()` (línea ~120) **y** array separado
  en `setUserRoles()` (línea ~244) — ambos necesarios o el rol no se puede desasignar desde el Panel.
- `panel/frontend/src/{components/UserModal.tsx,pages/PanelPage.tsx}`: `ALL_ROLES`, mapas de etiqueta/color,
  y dos `.filter(...).includes(r)` que gatean qué chips de rol se renderizan.

## 5. Pregunta de diseño abierta (para `sdd-propose`)

El requisito de producto (miembros de grupo sin cuenta Keycloak, solo el creador autenticado) no tiene
precedente en el monorepo: "público" hoy siempre significa anónimo-para-cualquiera (ytdl, paraisos), y el
control de acceso siempre es por rol de realm, nunca por registro. Dos puntos sin resolver:

1. **Modelado de miembros**: tabla `group_member` (`id`, `group_id`, `name` libre, `keycloak_user_id`
   nullable — solo poblado para el creador/gestor) vs. lista de nombres pura sin ningún vínculo de cuenta.
   Afecta directamente a cómo se autoriza "quién puede ver/editar un grupo": el JWT de Keycloak solo cubre
   al creador; miembros sin cuenta necesitan otro mecanismo de acceso (enlace compartible/token, PIN de
   grupo...) — no existe nada parecido a autorización a nivel de registro en ningún subapp actual.
2. **Modelado de splits y balances en SQL puro**: sin ORM y sin herramienta de migraciones (solo
   `infra/init.sql` editado a mano), diseñar `expense` + `expense_split` (importe o porcentaje por
   miembro, con `CHECK` similar al patrón `origen`/`estado` de `gasto`), y si la simplificación de deudas
   se calcula en lectura (agregación en query) o se persiste/cachea. No hay precedente de agregación
   financiera multi-entidad en el monorepo — `gastos/totales` es un `GROUP BY` de una sola tabla, no un
   libro mayor multi-miembro.

## 6. Próximos puertos libres

Siguiendo la tabla secuencial de `CLAUDE.md` (última entrada: Watchlist `:5181` / `:3009` / DB `:5438`):
- Frontend: **`:5182`**
- Backend: **`:3010`**
- PostgreSQL (reparto): **`:5439`**

---

**Ficheros leídos**: `CLAUDE.md`; `gastos/backend/src/{index.ts,middleware/auth.ts,db/pool.ts,db/queries.ts,routes/gastos.ts,schemas/gasto.schema.ts}`;
`gastos/infra/{init.sql,docker-compose.local.yml}`; `gastos/backend/Dockerfile`;
`gastos/frontend/src/components/AppLauncher.tsx`; `paraisos/backend/src/{middleware/auth.ts,routes/spots.ts}`;
`scripts/keycloak-update-realm.sh`; `infra/keycloak/realm-export.json`; `panel/backend/src/services/keycloakAdmin.ts`;
`panel/frontend/src/{components/UserModal.tsx,pages/PanelPage.tsx,components/AppLauncher.tsx}`.

## Riesgos identificados
1. El rol `<app>_invitado` referenciado como convención no existe todavía en ningún subapp real — hay que
   establecerlo de cero, no seguir un ejemplo existente.
2. No existe framework de migraciones (solo `init.sql` editado a mano), lo que limita la iteración de un
   esquema más complejo como el de `reparto`.
3. El acceso de miembros sin cuenta no tiene precedente en el monorepo y necesita diseño nuevo en la fase
   de propuesta.
