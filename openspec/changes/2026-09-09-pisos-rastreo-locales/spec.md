# Delta de especificación — `pisos`: rastreo de locales comerciales

`pisos` no tiene spec publicada en `openspec/specs/`. Este delta describe solo el
comportamiento NUEVO o MODIFICADO respecto al código actual. Identificadores en inglés.

## ADDED Requirements

### Requirement: Tipo de inmueble por búsqueda
Una búsqueda guardada SHALL declarar `tipo` con valor `vivienda` o `local`, mutuamente
excluyentes. Si `POST /searches` no envía `tipo`, el backend SHALL asumir `vivienda`.
Un `tipo` fuera de ese conjunto SHALL devolver 400/422 y no crear la búsqueda.

#### Scenario: Alta de una búsqueda de local
- **WHEN** se hace `POST /searches` con `tipo: 'local'`, `ubicacion`, y rangos de precio/metros
- **THEN** la búsqueda se crea con `tipo = 'local'` y queda activa para el rastreador

#### Scenario: Tipo por defecto
- **WHEN** se hace `POST /searches` sin campo `tipo`
- **THEN** la búsqueda se persiste con `tipo = 'vivienda'`

#### Scenario: Tipo inválido rechazado
- **WHEN** se hace `POST /searches` con `tipo: 'garaje'`
- **THEN** el backend responde 400/422 y no se crea ninguna fila

### Requirement: El tipo es inmutable
`PATCH /searches/:id` SHALL rechazar con 400/422 cualquier petición que intente cambiar
`tipo`, porque los anuncios ya vinculados serían del tipo de inmueble equivocado. Un
`PATCH` que reenvíe el mismo `tipo` actual SHALL aceptarse.

#### Scenario: Cambio de tipo rechazado
- **WHEN** se hace `PATCH /searches/:id` sobre una búsqueda `vivienda` con `tipo: 'local'`
- **THEN** el backend responde 400/422 y la búsqueda no cambia

### Requirement: El anuncio hereda el tipo de su búsqueda
Cada fila de `anuncio` SHALL llevar `tipo`, copiado de su `busqueda` en el momento de
guardarlo, para que el feed pueda filtrar por él.

#### Scenario: Anuncio de una búsqueda de local
- **WHEN** un rastreo de una búsqueda `tipo = 'local'` guarda un anuncio nuevo
- **THEN** ese `anuncio` se persiste con `tipo = 'local'`

### Requirement: Filtro del feed por tipo
`GET /listings` SHALL aceptar un filtro `tipo` con valores `vivienda` o `local` y devolver
solo los anuncios de ese tipo. Un valor desconocido de `tipo` SHALL devolver 400, no una
lista vacía (mismo principio que el filtro `portal`).

#### Scenario: Filtro válido
- **WHEN** se hace `GET /listings?tipo=local`
- **THEN** la respuesta contiene únicamente anuncios con `tipo = 'local'`

#### Scenario: Filtro desconocido
- **WHEN** se hace `GET /listings?tipo=nave`
- **THEN** el backend responde 400

## MODIFIED Requirements

### Requirement: Migración de datos existentes
Las columnas `tipo` de `busqueda` y `anuncio` SHALL crearse con default `'vivienda'`, y
toda fila preexistente SHALL quedar con `tipo = 'vivienda'`. El comportamiento de rastreo,
filtro y aviso de esas búsquedas SHALL permanecer idéntico al actual.
(Previously: no existía el concepto de `tipo`; todo rastreo era de vivienda en venta.)

#### Scenario: Búsqueda anterior a la migración
- **WHEN** se aplica la migración sobre una BD con búsquedas y anuncios existentes
- **THEN** todos quedan con `tipo = 'vivienda'` y el siguiente rastreo se comporta igual que antes

### Requirement: Rastreo según el tipo de la búsqueda
El rastreo de una búsqueda `tipo = 'local'` SHALL consultar Fotocasa y pisos.com contra su
sección de locales comerciales, con el filtro de subtipos invertido para aceptar
local/nave/oficina en vez de descartarlos. Wallapop `puedeBuscar()` SHALL devolver
`{ ok: false, motivo }` para `tipo = 'local'` y ese portal se omite, mostrando el motivo en
la UI. La semántica de rastreo parcial SHALL conservarse: un portal que falla degrada el
resultado (guarda `busqueda.ultimo_rastreo_error`, se pinta en rojo) y no aborta el rastreo.
(Previously: Fotocasa/pisos.com solo rastreaban la sección de vivienda y `pareceAnuncio`
descartaba explícitamente lo que parecía un local.)

#### Scenario: Fotocasa y pisos.com en sección comercial
- **WHEN** se rastrea una búsqueda `tipo = 'local'`
- **THEN** las URLs de Fotocasa y pisos.com apuntan a su sección de locales y los resultados de subtipo local/nave/oficina se aceptan

#### Scenario: Wallapop se omite con motivo visible
- **WHEN** se rastrea una búsqueda `tipo = 'local'`
- **THEN** Wallapop no se consulta, se registra un motivo y la UI lo muestra sin marcarlo como error de rastreo

#### Scenario: Fallo parcial en búsqueda de local
- **WHEN** durante el rastreo de una búsqueda `tipo = 'local'` pisos.com falla pero Fotocasa responde
- **THEN** se guardan los anuncios de Fotocasa, `ultimo_rastreo_error` recoge el fallo de pisos.com y el rastreo no se aborta

### Requirement: Filtro fino según el tipo
Para `tipo = 'local'`, `cumpleCriterios` SHALL NOT evaluar `habitaciones_min`, `banos_min`,
`exige_ascensor`, `exige_garaje` ni `exige_terraza`; solo aplica `ubicacion`,
`precio_min/max`, `metros_min/max` y `excluir_palabras`. Se conserva el principio de que un
dato desconocido nunca descarta: solo `ubicacion` y `precio` descartan cuando faltan; las
exclusiones de palabras siguen aplicando igual.
(Previously: `cumpleCriterios` evaluaba siempre los criterios residenciales.)

#### Scenario: Criterios residenciales ignorados
- **WHEN** se filtra un anuncio de una búsqueda `tipo = 'local'` que no informa habitaciones ni ascensor
- **THEN** el anuncio no se descarta por esos campos

#### Scenario: Precio desconocido no descarta; fuera de rango sí
- **WHEN** un anuncio de local no informa precio
- **THEN** pasa el filtro; y si informa un precio fuera de `precio_min/max`, se descarta

#### Scenario: Exclusión de palabras en local
- **WHEN** el título de un anuncio de local contiene una palabra de `excluir_palabras`
- **THEN** el anuncio se descarta

### Requirement: Aviso de Telegram según el tipo
El texto del aviso de Telegram SHALL usar 🏪 para anuncios `tipo = 'local'` y 🏠 para
`tipo = 'vivienda'`. La primera pasada de una búsqueda nueva y el rastreo manual
(`POST /searches/:id/rastrear`) SHALL NOT notificar. Un anuncio cuyo envío falla SHALL NOT
marcarse como notificado y se reintenta en la siguiente vuelta.
(Previously: el aviso no distinguía tipo de inmueble.)

#### Scenario: Emoji por tipo
- **WHEN** se notifica un anuncio nuevo de `tipo = 'local'`
- **THEN** el mensaje empieza con 🏪; para `tipo = 'vivienda'` empieza con 🏠

#### Scenario: Primera pasada no notifica
- **WHEN** se ejecuta `POST /searches/:id/rastrear` sobre una búsqueda de local recién creada
- **THEN** los anuncios encontrados se guardan pero no se envía ningún mensaje

### Requirement: El formulario y el listado reflejan el tipo
`BusquedaForm` SHALL ocultar los campos exclusivos de vivienda (habitaciones, baños,
ascensor, garaje, terraza) cuando `tipo = 'local'`. `BusquedaList` y el feed `/listings`
SHALL mostrar el tipo de cada búsqueda y anuncio.
(Previously: el formulario mostraba siempre todos los criterios y la UI no exhibía tipo.)

#### Scenario: Formulario en modo local
- **WHEN** el usuario selecciona `tipo = 'local'` en `BusquedaForm`
- **THEN** desaparecen los campos de habitaciones, baños, ascensor, garaje y terraza

#### Scenario: El listado muestra el tipo
- **WHEN** se carga `BusquedaList` con búsquedas de ambos tipos
- **THEN** cada fila indica si es 🏠 vivienda o 🏪 local
