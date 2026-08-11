# Reparto

Gestión de gastos de grupo al estilo Tricount: crea un grupo, apunta quién pagó qué, y consulta quién le
debe a quién sin hacer cuentas a mano. A diferencia del resto de subapps del monorepo, los miembros de un
grupo **no necesitan cuenta en el sistema** — se añaden por nombre libre, igual que en Tricount.

## Quién puede hacer qué

- **Gestor (usuario Keycloak con rol `admin` o `reparto_admin`)**: crea grupos, los administra, añade y
  quita miembros, borra el grupo, y puede regenerar el enlace de acceso del grupo. `reparto_invitado` ve
  todos los grupos del sistema en modo consulta, sin poder crear ni editar.
- **Miembro sin cuenta**: entra al grupo con el enlace que le pasa el gestor, sin login ni registro. Puede
  ver gastos y balances, y añadir/editar/borrar gastos del grupo (soft delete), pero no puede borrar el
  grupo entero ni expulsar miembros — eso es exclusivo del gestor.

## Cómo funciona el enlace de acceso del grupo

Cada grupo tiene una columna `access_token`: una cadena aleatoria de alta entropía
(`crypto.randomBytes(24)` en base64url) generada al crear el grupo. El enlace compartible tiene la forma:

```
https://.../reparto/g/<access_token>
```

Cuando alguien abre ese enlace, el frontend (ruta `/reparto/g/:token`, ver `App.tsx`) llama a
`POST /reparto/api/groups/by-token` con el token. El backend resuelve el grupo comparando el token en
tiempo constante (`crypto.timingSafeEqual`, mismo patrón que usa `ofertas` con `SCRAPER_API_KEY`) y, si es
válido, responde con un **token de sesión de grupo** de corta vida (JWT propio, firmado con
`REPARTO_GROUP_TOKEN_SECRET` — no reutiliza ni comparte secreto con Keycloak) que lleva embebido el
`groupId`. Ese token de sesión se guarda en el cliente y se usa como `Authorization: Bearer <token>` en las
siguientes peticiones — el `access_token` completo del enlace solo viaja una vez, en el primer hit.

Es importante entender que **el token da acceso al grupo, no a una persona concreta**: cualquiera con el
enlace actúa en nombre del grupo entero (puede añadir un gasto y elegir de qué miembro es, editar o borrar
gastos de cualquiera), no de un miembro específico verificado. Es el mismo modelo de confianza que usa el
Tricount real dentro de un grupo — personas que ya confían entre sí (compañeros de viaje o de piso).

Las rutas de gastos, miembros y balances (`/groups/:id/expenses`, `/groups/:id/members`,
`/groups/:id/balances`, `/groups/:id/settlement`) aceptan **cualquiera de los dos mecanismos**: un JWT de
Keycloak con rol `admin`/`reparto_admin`/`reparto_invitado`, o un token de sesión de grupo válido para ese
`groupId` concreto (`authOrGroupToken`, en `reparto/backend/src/middleware/groupToken.ts`). Nunca dan
acceso a otro grupo.

Si el enlace se filtra (captura de pantalla, reenvío accidental), el gestor puede regenerarlo en cualquier
momento desde la pantalla "Compartir grupo" (`POST /reparto/api/groups/:id/rotate-token`) — esto invalida
el enlace anterior al instante sin tocar ningún dato del grupo. El `access_token` nunca se devuelve en
ningún listado ni se expone salvo al gestor en esa pantalla.

## Reparto de gastos

Cada gasto se reparte de una de tres formas (`split_type`):

- **`equal`**: a partes iguales entre los participantes seleccionados; el resto de redondeo (céntimos) se
  asigna de forma estable a los primeros participantes para que la suma cuadre exacto con el importe total.
- **`exact`**: importes exactos por persona — la suma debe coincidir con el importe del gasto.
- **`percentage`**: porcentajes por persona — deben sumar 100% (±0.01 de margen); el importe en euros de
  cada participante se calcula en el servidor.

Los balances (`GET /groups/:id/balances`) y la sugerencia de liquidación (`GET /groups/:id/settlement`) se
calculan en cada lectura, no se persisten — igual que `gastos/totales`. La liquidación usa un algoritmo
greedy (mayor deudor ↔ mayor acreedor) que minimiza razonablemente el número de transferencias sugeridas,
el mismo compromiso que usa el propio Tricount.

## Stack

Ver la sección `## Reparto` en el `CLAUDE.md` de la raíz del monorepo para el detalle completo de stack,
rutas, variables de entorno y roles.
