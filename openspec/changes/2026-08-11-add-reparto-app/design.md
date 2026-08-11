## Context

El monorepo tiene ocho subapps hermanas en el mismo stack (Fastify+TS / React+Vite+TS / Postgres propia
sin ORM / JWT de Keycloak verificado a mano / Zod / soft delete `activo`+`deleted_at`), sin framework de
migraciones — el único mecanismo de esquema es un `infra/init.sql` idempotente montado en el contenedor de
Postgres. `paraisos` es el precedente más cercano de "acceso mixto" (rutas públicas de consulta + rutas
admin con `authMiddleware(['admin','paraisos_admin'])`), pero su "público" es anónimo-para-cualquiera, sin
ningún concepto de autorización por registro. `ofertas` sí tiene precedente de "dos mecanismos de auth
independientes para dos audiencias" (JWT de Keycloak para el CRUD humano, bearer token estático
`SCRAPER_API_KEY` para el consumidor externo) — es el patrón más reutilizable para `reparto`, adaptado de
"un token global" a "un token por grupo".

`reparto` necesita dos cosas que no existen en ningún subapp actual: miembros sin cuenta Keycloak, y
autorización por registro (un token que da acceso a un grupo concreto, no a la app entera).

## Goals / Non-Goals

**Goals:**
- Un usuario Keycloak (`admin`/`reparto_admin`) crea y administra grupos con la misma facilidad que
  cualquier otra subapp de gestión del monorepo.
- Los miembros de un grupo pueden ser personas sin cuenta — solo un nombre — igual que el Tricount real.
- Los miembros sin cuenta pueden entrar a su grupo (ver gastos, balances, añadir/editar sus propios
  gastos) usando solo el enlace que les pasa el gestor, sin registro ni login.
- Reparto de gastos en tres modos: a partes iguales, por importes exactos, por porcentajes — con
  validación de que la suma cuadre con el importe total.
- Balance por miembro dentro del grupo y sugerencia de liquidación que minimice el número de
  transferencias necesarias.
- Mismo nivel de aislamiento y seguridad que el resto del monorepo: nada de lo que se construya aquí debe
  abrir una vía de acceso a otra subapp.

**Non-Goals:**
- No hay multi-moneda en v1 — un grupo tiene una única moneda implícita (EUR), igual que el resto de
  subapps financieras del monorepo (`gastos`). Follow-up explícito si hace falta.
- No hay adjuntar fotos de tickets a los gastos de `reparto` (eso ya lo cubre `gastos` para el caso
  personal) — solo importe/concepto/fecha/categoría.
- No hay pagos reales ni integración bancaria — la "liquidación" es solo una sugerencia de quién debe
  transferir a quién, el usuario lo hace fuera de la app (como el Tricount real).
- No hay notificaciones (email/push) cuando se añade un gasto — el miembro revisa el enlace cuando quiera.
- El enlace de acceso de un grupo no distingue entre miembros dentro del mismo grupo — cualquiera con el
  enlace actúa en nombre del grupo, no de una persona concreta autenticada (ver más abajo, es una
  decisión consciente, no un descuido).

## Decisions

### Miembros sin cuenta: tabla `group_member` con `keycloak_user_id` nullable

`group_member`: `id`, `group_id`, `name` (texto libre, obligatorio), `keycloak_user_id` (text, nullable —
solo poblado si el miembro resulta ser también el gestor u otro usuario Keycloak que se auto-añade),
`activo`, `deleted_at`, `created_at`. No se valida contra Keycloak en ningún caso: `name` es simplemente
el texto que introduce el gestor (o un miembro con acceso de escritura) al añadir a alguien. Esto es
deliberadamente simple — no hay tabla de "invitaciones" ni de "usuarios pendientes"; un miembro es solo
una fila con un nombre, exactamente como una fila de Tricount.

Se descarta una lista de nombres pura (sin id propio) porque los gastos necesitan referenciar
`payer_member_id` y las filas de `expense_split` necesitan `member_id` — un id estable por fila es
necesario de todas formas, así que darle una tabla propia no añade complejidad real.

### Autorización por grupo: token opaco de grupo, no de miembro

Cada `group` tiene una columna `access_token` (texto aleatorio de alta entropía, `crypto.randomBytes(24)`
en base64url, generado al crear el grupo, único por índice). El enlace compartible es
`https://.../reparto/g/<access_token>`. El backend expone una ruta `GET /reparto/api/groups/by-token/:token`
que, con comparación en tiempo constante (`crypto.timingSafeEqual`, mismo patrón que
`ofertas`/`SCRAPER_API_KEY`), resuelve el token a un grupo y emite una cookie/[localStorage token] de
sesión de grupo de corta vida para las siguientes llamadas — no se reenvía el token completo en cada URL
de la SPA, solo en el primer hit.

Se decide **un token por grupo, no un token por miembro**: cualquiera con el enlace actúa en nombre del
grupo (puede añadir gastos, elegir de qué miembro es cada gasto, editar/borrar gastos, pero NO borrar el
grupo entero ni expulsar miembros — eso solo lo puede el gestor Keycloak). Alternativa descartada: un
token por miembro que solo permite actuar como ese miembro concreto. Se descarta por fricción real de
Tricount — en la práctica, cualquiera del grupo apunta gastos de cualquier otro (ej. "yo pagué la cena de
todos"), y separar identidad de miembro y sesión de acceso habría requerido un segundo factor de
verificación (¿cómo sabe el backend que "Ana" que entra con el enlace es realmente Ana y no otro miembro
usando el mismo enlace?) que Tricount tampoco resuelve — su enlace de grupo es exactamente así de
compartido. Rotar el `access_token` (regenerar) es una acción del gestor si el enlace se filtra, y
revoca el acceso anterior sin tocar los datos del grupo.

El token vive en una tabla con su propio índice único y **nunca se devuelve en ningún listado** ni se
loguea — el patrón exacto de `ofertas`/`SCRAPER_API_KEY` en cuanto a no-exposición.

### Rutas y guards: tres niveles, no dos

A diferencia del resto del monorepo (solo "público" vs "admin/rol"), `reparto` tiene tres niveles:

1. **Gestor (Keycloak)**: `authMiddleware(['admin', 'reparto_admin'])` — crear/borrar grupo, gestionar
   miembros, regenerar el `access_token`. `reparto_invitado` da solo lectura a nivel Keycloak (ver todos
   los grupos en modo consulta), no escritura.
2. **Miembro por token de grupo**: `groupTokenMiddleware` — nuevo `preHandler` que resuelve
   `Authorization: Bearer <group-session-token>` (emitido tras validar el `access_token` del enlace) al
   `group_id` correspondiente y lo inyecta en `request.groupId`. Da acceso de lectura/escritura a gastos y
   miembros de ESE grupo únicamente — nunca a otros grupos ni a rutas de gestión de grupo.
3. **Combinado**: las rutas de gastos (`GET/POST/PATCH/DELETE /groups/:groupId/expenses`) aceptan
   CUALQUIERA de los dos guards (Keycloak admin O token de grupo válido para ese `groupId`) — se
   implementa como un `preHandler` compuesto que prueba primero el JWT de Keycloak y, si no hay o no es
   válido, prueba el token de grupo; si ninguno vale, 401/403. Esto evita duplicar cada ruta de gastos dos
   veces.

### Reparto de gastos: `expense` + `expense_split`, tres modos con `CHECK` en cada uno

`expense`: `id`, `group_id`, `payer_member_id` (FK a `group_member`), `amount` (numeric), `description`,
`date`, `category` (texto libre, igual que `gastos`), `split_type` (`equal` | `exact` | `percentage`),
`activo`, `deleted_at`, `created_at`, `updated_at`.

`expense_split`: `id`, `expense_id`, `member_id`, `share_amount` (numeric — SIEMPRE se persiste el importe
resuelto en euros, nunca solo el porcentaje) `share_percentage` (numeric, nullable — solo informativo
cuando `split_type='percentage'`, para poder mostrar "25%" en vez de recalcularlo).

Validación en el handler (no en SQL, ya que no hay ORM ni triggers complejos en el resto del monorepo):
- `equal`: importe total dividido entre el número de participantes seleccionados; el resto de redondeo
  (céntimos) se asigna a los primeros N participantes en orden estable, para que la suma cuadre exacto
  con `amount` (problema clásico de reparto — Tricount hace lo mismo).
- `exact`: la suma de `share_amount` de todos los splits debe ser exactamente igual a `amount` (Zod
  `.refine()` + comprobación en el handler antes del insert; si no cuadra, 400).
- `percentage`: la suma de `share_percentage` debe ser 100 (con un margen de redondeo de ±0.01);
  `share_amount` se calcula server-side a partir del porcentaje, con el mismo ajuste de céntimos de
  `equal` para que la suma cuadre exacto.

Se descarta cualquier `CHECK constraint` de Postgres para la suma (no se puede expresar una suma
cross-fila en un `CHECK` de una tabla hija sin un trigger) — la validación vive en el backend, igual que
el resto de reglas de negocio de este monorepo (no hay triggers de negocio en ninguna subapp existente
salvo el `updated_at` genérico).

### Balances y liquidación: calculados en lectura, no persistidos

El balance de un miembro dentro de un grupo = (suma de `amount` de gastos donde es `payer_member_id`) −
(suma de `share_amount` de sus `expense_split` en ese grupo). Se calcula con una query de agregación en
`GET /groups/:groupId/balances` — no se persiste ni se cachea, igual que `gastos/totales` (`GROUP BY` en
lectura). El volumen esperado (gastos de un grupo de viaje/piso, no miles de filas) hace innecesaria una
tabla de balances materializada.

**Simplificación de deudas** (algoritmo greedy estándar, el mismo que usa Tricount): con la lista de
balances netos por miembro, se separan en acreedores (balance > 0) y deudores (balance < 0), se ordenan
de mayor a menor importe absoluto, y se emparejan iterativamente el mayor deudor con el mayor acreedor
(la transferencia es `min(|deuda|, |crédito|)`), actualizando ambos saldos y repitiendo hasta que todos
los saldos sean ~0. No es óptimo en el caso general (el mínimo número de transferencias es NP-difícil en
general), pero el algoritmo greedy da un resultado razonable y es el mismo compromiso que usa Tricount en
la práctica — no se persiste, se recalcula en cada `GET /groups/:groupId/settlement`.

### Roles Keycloak: primer uso real de `<app>_invitado`

`reparto_admin` sigue el patrón ya existente (`paraisos_admin`, `mapacyd_admin`) — gestión completa,
delegable. `reparto_invitado` es el primer caso real de la convención `<app>_invitado` documentada en
memoria pero nunca aplicada a una subapp: da acceso de solo consulta a nivel Keycloak (ver todos los
grupos existentes en modo lectura, sin crear/editar). No sustituye ni se confunde con el token de grupo
— un `reparto_invitado` ve todos los grupos desde dentro del sistema autenticado; alguien con solo el
enlace de un grupo ve únicamente ESE grupo, sin sesión Keycloak. Son dos audiencias distintas que
conviven: "alguien del monorepo con permiso de solo lectura sobre `reparto`" vs. "alguien externo al que
se le compartió un enlace concreto".

### Base de datos: `reparto`, Postgres 15 propia, siguiente puerto libre

Base de datos `reparto` en la instancia Postgres compartida (puerto `:5439` en local), mismo patrón que
`gastos`/`ofertas`/`paraisos`. Sin ORM, queries `pg` parametrizadas. Tablas: `group` (`id`, `name`,
`access_token` único, `manager_keycloak_user_id`, `activo`, `deleted_at`, `created_at`, `updated_at`),
`group_member`, `expense`, `expense_split` (ver arriba). Índices: `group(access_token)` único,
`group_member(group_id)`, `expense(group_id)`, `expense_split(expense_id)`.

## Risks / Trade-offs

[Riesgo: filtrar el `access_token` de un grupo (captura de pantalla del enlace, reenvío no intencionado)
da acceso de escritura a cualquiera] → Mitigación: el gestor puede regenerar el token en cualquier
momento desde la vista de gestión, invalidando el enlace anterior sin perder ningún dato del grupo; el
token nunca se muestra en listados ni logs, solo en la pantalla de "compartir grupo".

[Riesgo: sin verificación de identidad por miembro, cualquiera con el enlace puede editar/borrar gastos
de otros] → Mitigación: es el mismo modelo de confianza que el Tricount real dentro de un grupo (personas
que ya confían entre sí, ej. compañeros de viaje/piso); el borrado de gastos es soft-delete, así que un
error es recuperable a nivel de datos aunque no haya UI de "deshacer" en v1.

[Riesgo: el algoritmo greedy de liquidación no siempre da el número mínimo de transferencias] →
Mitigación: aceptado conscientemente — el problema exacto es NP-difícil y el resultado greedy es
suficientemente bueno para grupos pequeños (el propio Tricount usa el mismo compromiso); se puede
sustituir el algoritmo más adelante sin tocar el modelo de datos, está aislado detrás de una función pura
`simplifyDebts(balances): Transfer[]`.

[Riesgo: `reparto_invitado` es la primera aplicación real de una convención hasta ahora solo documentada]
→ Mitigación: se sigue exactamente la guía ya escrita (rol creado en el realm, no auto-asignado a
`propietario`, solo lectura) — si algo no encaja al aplicarlo, es una señal para revisar la convención,
no un motivo para saltársela aquí.

[Riesgo: tercer nivel de autorización (guard combinado Keycloak-o-token) añade una rama nueva de
middleware que no existe en ningún subapp actual] → Mitigación: aislado en una única función
`authOrGroupToken(groupIdParam)` reutilizada en todas las rutas de gastos/miembros/balances, con tests
unitarios cubriendo las tres combinaciones (JWT válido, token de grupo válido, ninguno válido).
