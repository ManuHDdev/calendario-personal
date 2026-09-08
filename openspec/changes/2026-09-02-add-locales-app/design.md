## Context

El monorepo tiene doce subapps hermanas en el mismo stack. Tres son precedente directo:

- **`pisos`** aporta la forma entera del rastreador: planificador dentro del propio proceso
  (`setTimeout` encadenado, no `setInterval`), conocimiento de cada portal encerrado en un bloque marcado
  de `portales/<portal>.ts`, normalización a una forma común antes del filtro fino, UPSERT + aviso solo de
  lo nuevo, y el script `npm run smoke` que mide **cobertura por campo** contra el portal real.
- **`ruta`** aporta el trabajo con geometría y proveedores externos: cliente de OpenRouteService, geocodado
  con Nominatim serializado a 1 req/s y cacheado de forma permanente en Postgres, y la disciplina de no
  hacer pasar un resultado parcial por uno completo (`plan.fullCoverage`).
- **`pisos`** además ya estableció el principio de que **un dato desconocido no descarta un anuncio**.

Lo que no existe en ninguna subapp y hay que construir: un padrón geográfico propio que hay que mantener
fresco, y un cálculo cuyo resultado tiene consecuencias caras si se equivoca en la dirección optimista.

## Goals / Non-Goals

**Goals:**
- Enterarse antes que nadie de un local en venta que *pueda* servir para instalar farmacia, en cualquiera
  de las comunidades que interesen, sin abrir un navegador.
- Que el filtro de distancia use el camino real por acera, no la línea recta, y sin intervención humana.
- Que el sistema **nunca dé por bueno un local que no lo es**. Un falso rojo cuesta una oportunidad; un
  falso verde cuesta un viaje, una señal, o peor. La asimetría manda en todo el diseño.
- Poder preguntar puntualmente por una dirección concreta desde el móvil y tener respuesta en segundos.
- Añadir una comunidad autónoma nueva sin tocar código.

**Non-Goals:**
- No sustituye la medición oficial (ver `proposal.md`).
- No modela el módulo poblacional (una farmacia por cada N habitantes) ni el calendario de concursos.
- No intenta adivinar la dirección exacta de un anuncio que el portal ofusca a propósito.

## Decisions

### 1. Una sola subapp con dos tipos de rastreo, no dos subapps

`busqueda.tipo` discrimina `'local'` (portales inmobiliarios) de `'farmacia'` (portales de traspaso).
Comparten el 90% de la tubería —planificador, normalización, UPSERT, deduplicación, notificación, feed,
soft delete— y difieren en el parser de origen y en qué columnas rellenan. Partirlo en dos subapps
duplicaría el planificador y el bot para no compartir nada más que eso.

Las columnas específicas de cada tipo son nullable y la validación Zod es discriminada por `tipo`: un
anuncio de tipo `local` exige superficie y precio; uno de tipo `farmacia` admite facturación y provincia y
**no exige coordenadas**, porque los intermediarios ocultan deliberadamente la ubicación de las farmacias
que venden ("Farmacia en el sur de la Comunidad de Madrid, facturación 620.000 €"). Un anuncio de farmacia
sin coordenadas no pasa por el módulo de viabilidad y no es un fallo: es su forma normal.

### 2. El prefiltro por línea recta es exacto, no una aproximación

La distancia caminando entre dos puntos es siempre **mayor o igual** que la distancia en línea recta. Por
tanto, una farmacia que está a más de `D` metros en línea recta **no puede** estar a menos de `D` metros
caminando. Filtrar candidatas por haversine antes de pedir rutas no introduce ningún falso negativo: es
una implicación matemática, no una heurística.

Esto es lo que hace el problema barato. Se piden rutas solo a las farmacias dentro de un radio haversine de
`D * FACTOR_RODEO` (con `FACTOR_RODEO = 3`, generoso: significa aceptar que el camino real dé hasta tres
veces la vuelta respecto a la recta). En Madrid centro con `D = 250 m` eso deja típicamente entre 5 y 30
candidatas, resolubles en **una sola petición de matriz**.

Se descarta la cota "más ajustada" de usar el radio justo `D`: es correcta pero deja el margen a cero, y
cualquier farmacia entre `D` y `D * FACTOR_RODEO` quedaría sin medir, o sea sin poder decir cuánto de lejos
está la más cercana — que es justo el dato que el usuario quiere ver aunque cumpla. Mismo espíritu que la
nota de `ruta/backend/src/services/corridor.ts`: la cota estrecha es la que pierde cosas en silencio.

### 3. Motor de rutas peatonal intercambiable: `ors` hoy, `valhalla` como objetivo

Una interfaz única:

```ts
interface MotorDistancia {
  nombre: 'ors' | 'valhalla';
  matrizPeatonal(origen: Punto, destinos: Punto[]): Promise<(number | null)[]>; // metros, null = sin ruta
}
```

- **`ors`** — `POST /v2/matrix/foot-walking` de OpenRouteService, con la `ORS_API_KEY` que ya usan
  `paraisos` y `ruta`. Cero infraestructura nueva. Límite del plan gratuito: 2.500 peticiones/día y 40
  concurrentes. Con una petición de matriz por anuncio y por tipo de comprobación, cubre holgadamente el
  régimen estacionario (decenas de anuncios nuevos al día), pero **el backfill inicial de una búsqueda
  amplia sí puede rozar el límite**, así que el planificador la trata como recurso contable (ver decisión 6).
- **`valhalla`** — instancia propia en Docker con teselas construidas del extracto OSM de España. Sin
  límite de peticiones, latencia de milisegundos, y el dato deja de depender de un tercero.

Se elige **Valhalla y no OSRM** para el caso self-hosted: OSRM carga el grafo entero en RAM (el perfil
`foot` de España son varios GB residentes), mientras que Valhalla mapea sus teselas en memoria bajo demanda
y convive con las otras doce subapps en el mismo VPS. Valhalla además trae `sources_to_targets`, que es
literalmente la matriz que hace falta, con `costing=pedestrian`.

El motor se elige con `LOCALES_MOTOR_DISTANCIA` (default `ors`). El veredicto guardado registra con qué
motor se calculó (`anuncio.viabilidad_motor`), de modo que al cambiar de motor se sepa qué filas son viejas
y puedan recalcularse, en vez de tener una tabla con dos criterios mezclados y ninguna forma de distinguirlos.

### 4. El veredicto es un semáforo con banda de incertidumbre, nunca un sí/no

Esta es la decisión que más código explica. **La coordenada de un anuncio no es fiable a la escala de 250
metros**: los portales desplazan a propósito la ubicación exacta, a veces cientos de metros. Emitir
"cumple / no cumple" sobre ese dato sería inventarse una precisión que el dato de entrada no tiene.

Cada anuncio y cada farmacia llevan `precision_coordenadas`: `'exacta'` (dirección con número, geocodificada
a portal), `'aproximada'` (el portal da un punto difuso o solo la vía), `'desconocida'`. El veredicto se
calcula sobre la distancia medida `m`, el umbral legal `D` y un margen `E` derivado de la peor precisión
implicada (0 m para `exacta`, 150 m para `aproximada`, 300 m para `desconocida`):

| Condición                | Veredicto  | Significado                                              |
|--------------------------|------------|----------------------------------------------------------|
| `m - E > D`              | **verde**  | Cumple incluso en el peor caso del error de posición      |
| `m + E < D`              | **rojo**   | Incumple incluso en el mejor caso                         |
| en otro caso             | **ámbar**  | El dato de entrada no permite decidir — hay que ir a ver  |
| sin coordenadas / sin ruta | **sin_datos** | No se ha podido calcular, y se dice cuál fue el motivo |

Se notifican verdes y ámbares. Un ámbar **no** es un fallo del sistema: es su respuesta correcta cuando el
portal no da mejor dato, y es la señal de "esto lo compruebas tú con la dirección exacta desde el bot".

### 5. Un padrón incompleto se degrada a ámbar, no a verde

Un falso verde solo puede venir de una farmacia que existe y no está en el padrón. Por eso el padrón se
audita a sí mismo: por cada municipio se guarda cuántas farmacias se conocen y de qué fuentes, y se compara
con una **cota de cordura poblacional** (el módulo general en España es una farmacia por cada ~2.800
habitantes, así que un municipio de 50.000 habitantes con 4 farmacias en el padrón está claramente mal
cubierto). Si la cobertura de un municipio queda por debajo del umbral, **todo veredicto verde en ese
municipio se degrada a ámbar** con el motivo explícito ("padrón incompleto en Getafe: 4 farmacias conocidas,
~18 esperadas").

Fuentes, en orden de confianza, fusionadas por proximidad (dos registros a menos de 40 m son la misma
farmacia):
1. Dataset oficial de la comunidad, donde existe abierto — Madrid lo publica en
   `datos.comunidad.madrid` (`oficinas_farmacia`). Un importador por comunidad, aditivo.
2. OpenStreetMap vía Overpass (`amenity=pharmacy`), capa nacional uniforme, refrescada semanalmente.

Se descarta depender solo de OSM: su cobertura de farmacias en España es buena pero desigual, y "buena pero
desigual" es exactamente lo que no sirve cuando el fallo es asimétrico. Se descarta también depender solo
del dato oficial: no todas las comunidades lo publican en abierto, y el usuario quiere media España.

Los centros sanitarios siguen el mismo esquema, con `amenity=clinic|doctors|hospital` y
`healthcare=centre`, y su propio umbral legal (150 m en Madrid; nullable donde la comunidad no lo regule —
`NULL` significa "esta comunidad no impone esta distancia", no "cero metros").

### 6. La normativa es dato, no código

Tabla `normativa`, una fila por comunidad autónoma, sembrada y editable desde la UI:
`distancia_farmacias_m` (250 en todas las comunidades que interesan), `distancia_centros_sanitarios_m`
(nullable), `notas`, `fuente_url`. Una búsqueda hereda las de su comunidad y puede sobreescribirlas fila a
fila, que es el "poder elegir a cuál hacer caso" que pidió el usuario.

Casos que ya obligan a que sea dato y no una constante: Canarias exige **1.000 m** en zonas farmacéuticas
turísticas de tipo común, frente a los 250 m generales. Eso se modela como filas de excepción por zona
dentro de la misma tabla, no como un `if` en el cálculo.

### 7. El planificador trata las peticiones de ruta como presupuesto

Igual que `ruta` planifica cuántas peticiones a Wallapop se puede permitir, aquí el rastreo lleva un
contador diario de peticiones al motor de distancia. Al agotarse (relevante solo con `ors`), **los anuncios
nuevos se guardan igual, con veredicto `sin_datos` y motivo "presupuesto de rutas agotado"**, y se
recalculan en la siguiente ventana. Nunca se descarta un anuncio por no haber podido medirlo: eso sería
convertir una limitación de cuota en una decisión de negocio silenciosa.

Se cachean las matrices en `ruta_cache` por par (origen redondeado a ~10 m, destino redondeado a ~10 m,
motor), permanentemente: la red peatonal y las farmacias se mueven en años, no en minutos.

### 8. Portales: el mismo bloque de conocimiento aislado que en `pisos`

**Locales en venta** — `fotocasa`, `pisoscom` (ambos ya resueltos en `pisos`, cambia la URL de búsqueda y
el mapeo de campos), `habitaclia` (fuerte en Levante y Baleares, justo las zonas que interesan),
`yaencontre`, `milanuncios`. Idealista queda fuera (DataDome), igual que en `pisos`.

**Farmacias en venta** — `farmaconsulting` y `asefarma` (los dos intermediarios grandes, con listados
públicos), `negociosenventa`, `milanuncios` (sección de traspasos de farmacias) y `tablondeanuncios`.

Milanuncios no busca por coordenadas, así que sus anuncios se geocodifican uno a uno con Nominatim contra
`geocode_cache` — el mismo patrón, cliente y disciplina de 1 req/s que ya usa `ruta`.

**Advertencia de honestidad sobre estos parsers**: se escriben a partir del patrón de `pisos` pero **no se
pueden verificar contra los portales reales desde el entorno de desarrollo**, cuya política de red bloquea
todo el egreso salvo los registros de paquetes. Los tests corren contra fixtures y verifican la lógica de
parseo, no que el portal sirva hoy lo esperado. Por eso `npm run smoke -- <portal> "<zona>"` es parte
entregable de esta feature, no un extra: es el único sitio donde se comprueba la realidad, y hay que
contar con **una ronda de ajuste por portal** tras ejecutarlo por primera vez con red.

### 9. El bot es de doble sentido, a diferencia del de `pisos`

`pisos` tiene un bot que solo emite; `gastos` uno conversacional. Aquí hacen falta las dos cosas, así que se
sigue el patrón de `gastos` (Telegraf con long polling en el mismo proceso Fastify, ignorando en silencio
todo lo que no venga de `TELEGRAM_OWNER_CHAT_ID`):

- **Emite**: anuncios nuevos y bajadas de precio que pasan el filtro, con el veredicto y los metros a la
  farmacia más cercana en el propio mensaje.
- **Responde**: una **ubicación de Telegram** compartida, una dirección en texto (`/comprobar Calle Mayor
  12, Madrid`), o la **URL de un anuncio** reenviada — en los tres casos devuelve las farmacias y centros
  sanitarios cercanos con sus metros caminando, el veredicto y la normativa aplicada. La consulta puntual
  usa `precision_coordenadas = 'exacta'` cuando la dirección lleva número, que es lo que la hace útil: es la
  vía para resolver un ámbar.

Sin `TELEGRAM_BOT_TOKEN`/`TELEGRAM_OWNER_CHAT_ID` el rastreador funciona y guarda anuncios, solo se queda
sin avisos y sin consultas, y lo dice en el log al arrancar — igual que `pisos`.

## Risks / Trade-offs

- **Los parsers nacen sin verificar** (decisión 8). Mitigación: smoke con cobertura por campo, y el
  principio de `pisos` de que un portal caído degrada el rastreo con motivo visible en vez de abortarlo.
- **Los intermediarios de farmacias son webs pequeñas** y su marcado puede ser frágil o cambiar sin aviso.
  Mitigación: son la fuente menos crítica (un traspaso no se agota en horas como un local barato) y su
  fallo queda en `ultimo_rastreo_error` sin tumbar el resto.
- **Valhalla exige recursos en el VPS** (construcción de teselas de España y varios GB de disco). Mitigación:
  el motor es intercambiable y `ors` funciona desde el día uno sin infraestructura nueva.
- **El veredicto puede ser ámbar muy a menudo** si los portales ofuscan mucho. Es el resultado honesto, y
  el bot está diseñado precisamente para convertir ámbares en verdes o rojos con una dirección exacta.
- **La normativa cambia** (Madrid pasó de la Ley 19/1998 a la Ley 13/2022). Mitigación: es dato editable con
  `fuente_url` y `notas`, no constantes repartidas por el código.

## Migration Plan

Aditivo puro: nueva BD, nuevos contenedores, nuevo location de nginx. Nada que migrar. El único paso con
orden es sembrar el padrón (importadores de OSM y del dataset de Madrid) **antes** del primer rastreo, para
que ningún anuncio nazca con veredicto verde calculado contra un padrón vacío. El importador se ejecuta al
arrancar si el padrón está vacío, y el planificador no calcula viabilidad mientras la cobertura de la
comunidad de una búsqueda esté por debajo del umbral.

## Open Questions

Están en el mensaje al usuario, no bloquean escribir el esquema ni los parsers: recursos disponibles en el
VPS (decide `valhalla` ya o `ors` primero), y confirmación de la banda del semáforo (`E` de 150/300 m).
