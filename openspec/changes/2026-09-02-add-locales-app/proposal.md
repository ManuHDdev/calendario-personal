## Why

El propietario vendió en su día su licencia de farmacéutico y quiere volver a abrir farmacia. Eso son dos
búsquedas simultáneas y hoy manuales:

1. **Un local en venta** donde instalarla, que cumpla la distancia mínima legal respecto a las farmacias ya
   establecidas y a los centros sanitarios — para presentarse a concurso de nueva autorización.
2. **Una farmacia ya en funcionamiento en venta** (jubilación del titular, traspaso), que es la otra vía
   real de volver a tener licencia.

La parte que hoy no puede automatizar de ninguna forma es la segunda mitad del punto 1: la distancia mínima
**no se mide en línea recta, se mide por el camino vial más corto**. Comprobarlo a mano son 10-15 minutos
por anuncio en Google Maps, y un local barato en zona buena dura días. Es exactamente el problema que ya
resolvió `pisos` (enterarse antes), más un filtro que ninguna subapp actual sabe calcular.

`pisos` no sirve: es vivienda en venta, su modelo de datos no tiene superficie comercial ni facturación, y
meterle un motor de rutas peatonal y un padrón de farmacias contaminaría una app que hoy hace una sola cosa.

## What Changes

- Añadir una nueva subapp `locales`: rastreador de **locales comerciales en venta** y de **farmacias en
  venta**, con verificación automática de distancia peatonal a la farmacia y al centro sanitario más
  cercanos.
- **Ámbito nacional desde el diseño, no solo Madrid.** Una búsqueda declara su comunidad autónoma y hereda
  de ahí sus distancias legales. Se siembran Madrid, Andalucía, Comunidad Valenciana, Canarias y Baleares,
  y añadir otra es una fila en una tabla, no un cambio de código.
- **Módulo de viabilidad** (lo nuevo de verdad): dado un punto, calcula la distancia real caminando a las
  farmacias y centros sanitarios cercanos, y emite un veredicto verde/ámbar/rojo contra la normativa de esa
  comunidad. Motor de rutas intercambiable (`ors` | `valhalla`) tras una única interfaz.
- **Padrón de farmacias y centros sanitarios** propio, importado y refrescado semanalmente: OpenStreetMap
  vía Overpass como capa nacional uniforme, más importadores por región donde existe dato oficial abierto
  (Madrid el primero). Con **métrica de cobertura por municipio**, porque una farmacia que falta en el
  padrón produce un falso verde, que es el peor fallo posible de esta app.
- **Bot de Telegram de doble sentido**: emite avisos de anuncios nuevos que pasan el filtro, y además
  responde a consultas — mandarle una ubicación, una dirección o la URL de un anuncio y que devuelva el
  cálculo de distancias sobre ese punto concreto.
- Backend Fastify + TypeScript + Postgres propia vía `pg` + Zod; frontend React + Vite + TS con mapa
  Leaflet; JWT de Keycloak verificado a mano. Mismo stack que `pisos`, `ruta`, `gastos`.

## Capabilities

### New Capabilities
- `locales`: rastreo de locales comerciales y de farmacias en venta, con verificación automática de
  distancia peatonal a farmacias y centros sanitarios contra la normativa autonómica aplicable, avisos por
  Telegram y consulta puntual bajo demanda desde el propio bot.

### Modified Capabilities
(ninguna — cambio aditivo; no se modifica el comportamiento de ninguna subapp existente)

## Impact

- Nuevo directorio `locales/` (backend + frontend) en la raíz del monorepo.
- Nueva base de datos Postgres `locales` (propia, sin ORM, soft delete), local `:5442`.
- Backend `:3013`, frontend `:5185`, rutas bajo `/locales/api`.
- `nginx/calendario.conf`: nuevo location block. **Ojo**: el fichero del servidor ha divergido del repo
  (ver `CLAUDE.md`, aviso de Trader) — el bloque se aplica in situ, no copiando el fichero.
- Las **14 copias de `AppLauncher`**: nueva entrada `locales` con `roles: ['admin']`.
- `infra/docker-compose.local.yml` / `.prod.yml`: servicios `locales-backend`, `locales-frontend`, nueva
  instancia/BD Postgres, y —si se elige ese motor— `locales-valhalla` con su volumen de teselas.
- **No añade ningún rol nuevo a Keycloak.** Solo `admin`, misma postura que Gastos/Ofertas/Ruta/Pisos.
- `CLAUDE.md`: nueva sección `## Locales`, entrada en la tabla de puertos y en la tabla de roles.
- Nueva dependencia externa de datos: Overpass API (OSM) y, opcionalmente, el portal de datos abiertos de
  cada comunidad. Nueva dependencia de cómputo: OpenRouteService (ya en uso por `paraisos` y `ruta`) o una
  instancia propia de Valhalla.

## Non-Goals

- **No certifica nada legalmente.** El método oficial de medición lo fija el reglamento de cada comunidad
  (de qué punto del local a qué punto de la farmacia, qué viales cuentan). Esta app descarta y prioriza; la
  comprobación que vale ante la administración la hace un técnico. La UI lo dice en cada veredicto.
- No se rastrea Idealista (DataDome, misma razón que en `pisos`).
- No hay valoración económica de farmacias (multiplicadores sobre facturación, rentabilidad): se muestra lo
  que publique el anuncio, sin calcular nada encima.
- No hay seguimiento del calendario de concursos autonómicos de nuevas autorizaciones. Es una fuente muy
  distinta (boletines oficiales) y merece su propia decisión; queda como follow-up explícito.
