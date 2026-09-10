## Why

El propietario quiere comprar **un local comercial**: para montar un negocio propio más adelante, o para
convertirlo en vivienda. Hoy esa búsqueda es manual, mientras que la de vivienda ya está automatizada en
`pisos`. Es el mismo problema que `pisos` ya resolvió (enterarse el primero, antes de que el anuncio bueno
desaparezca), sobre las mismas fuentes, con los mismos criterios de precio y superficie.

`locales` no sirve para esto y no se va a tocar: esa subapp existe para **abrir farmacia** — padrón,
distancia peatonal legal, semáforo de viabilidad, normativa autonómica. Un local que se compra para reformar
no necesita nada de eso, y meter ahí una búsqueda sin veredicto ensuciaría la app que sí lo certifica.

## What Changes

- **Una búsqueda declara su `tipo`: `vivienda` | `local`, excluyentes.** No es un interruptor de "busca las
  dos cosas": son criterios distintos, resultados distintos y avisos distintos. Toda búsqueda existente pasa
  a `vivienda` en la migración, así que nada cambia de comportamiento sin tocarla.
- **Fotocasa y pisos.com aprenden su sección de locales.** Hoy `construirUrl` tiene la sección de vivienda
  incrustada y `pareceAnuncio` descarta explícitamente lo que huele a local. Con `tipo=local` se invierten
  las dos cosas: la URL apunta a la sección comercial y el filtro de subtipos acepta local/nave/oficina en
  vez de rechazarlo. El conocimiento del portal sigue viviendo solo dentro de `portales/<portal>.ts`.
- **Wallapop salta las búsquedas de local** con `puedeBuscar()` → `{ok:false, motivo}`, igual que ya salta
  las que no llevan coordenadas: su categoría inmobiliaria no distingue local de vivienda de forma fiable.
  El motivo se enseña en la UI; no es un fallo silencioso.
- **El filtro fino respeta el tipo.** En `tipo=local`, `cumpleCriterios` no evalúa habitaciones, baños ni
  ascensor. Se mantiene intacto el principio de que un dato desconocido no descarta.
- **Los avisos distinguen 🏠 de 🏪** y el formulario y el listado esconden los criterios que no aplican.

## Capabilities

### New Capabilities
(ninguna — no hay subapp nueva)

### Modified Capabilities
- `pisos`: el rastreo deja de ser exclusivamente de vivienda en venta; una búsqueda declara el tipo de
  inmueble que persigue y el rastreo, el filtro y el aviso se comportan según ese tipo. Nota: `pisos` nunca
  llegó a tener spec publicada en `openspec/specs/`, así que el delta se escribe partiendo del
  comportamiento real del código.

## Impact

- `pisos/backend/src/types/pisos.ts`, `schemas/pisos.schema.ts`: campo `tipo` en `Busqueda`, `Anuncio` y
  `AnuncioCrudo`.
- `pisos/backend/src/portales/{fotocasa,pisoscom,wallapop,types}.ts`: `CriteriosPortal` lleva `tipo`.
  El conocimiento de las secciones comerciales **se porta desde `locales/backend/src/portales/`**, donde ya
  está escrito — pero nunca verificado contra el portal en vivo.
- `pisos/backend/src/services/criterios.ts`, `telegram/notificador.ts`.
- `pisos/backend/src/db/migraciones.ts` + `pisos/infra/init.sql`: columna `tipo` con default `'vivienda'`.
- Frontend: `BusquedaForm`, `BusquedaList`, `AnuncioList`, `types/index.ts`.
- Tests: fixture de listado de locales por portal; casos de `criterios` para `tipo=local`.
- `CLAUDE.md`, sección `## Pisos`.
- **Sin puerto nuevo, sin BD nueva, sin rol nuevo en Keycloak, sin entrada nueva en el AppLauncher** — no es
  una subapp, así que la regla de las 15 copias no aplica.

## Non-Goals

- **No se toca `locales`.** Sigue siendo la app de farmacias, con su padrón y su semáforo.
- **Ninguna lógica de viabilidad ni de distancia legal en `pisos`.** Un local aquí es un anuncio con precio y
  metros, nada más; si algún día hace falta el veredicto, ya existe la app que lo da.
- No se rastrea Idealista (DataDome, misma razón de siempre). No se rastrea alquiler.
- No se añaden portales nuevos ni especializados en suelo comercial.

## Open Questions

- **¿Bastan precio y metros para filtrar un local?** Puede que haga falta algún criterio propio
  (`apto_vivienda`, fachada a calle, planta) — se deja como decisión de la fase de diseño, no se cierra aquí.
- El comportamiento de `metros_min/max` sobre un local es el mismo campo con otra escala; queda por decidir
  si la UI cambia los rangos por defecto según el tipo.
