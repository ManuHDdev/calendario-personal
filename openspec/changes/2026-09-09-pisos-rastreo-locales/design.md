## Context

`pisos` ya tiene entera la tubería que hace falta: planificador dentro del proceso, conocimiento de cada
portal encerrado en un bloque marcado de `portales/<portal>.ts`, normalización a `AnuncioCrudo` antes del
filtro fino, UPSERT + aviso solo de lo nuevo, y `npm run smoke` como única verificación real contra el
portal. Nada de eso cambia. Lo que cambia es que hoy **el tipo de inmueble está incrustado en tres sitios**:
el segmento de la URL de cada portal (`/es/comprar/viviendas/…`, `/venta/pisos-…`), el conjunto de subtipos
que `pareceAnuncio` rechaza, y los criterios residenciales de `cumpleCriterios`.

`locales/backend/src/portales/{fotocasa,pisoscom}.ts` ya escribió la mitad comercial de ese conocimiento
(sección de URL, `SUBTIPOS_LOCAL`, la rareza del `@type` de pisos.com). Ese material se **porta**, no se
reinventa — con la advertencia de que allí tampoco se verificó contra el portal en vivo salvo el detalle del
JSON-LD de pisos.com.

## Goals / Non-Goals

**Goals**
- Que `tipo` sea un dato que viaja de la búsqueda al portal, al filtro y al aviso, sin duplicar un fichero
  por portal ni un servicio paralelo.
- Que una búsqueda de vivienda existente se comporte **byte a byte igual** tras el cambio.
- Que el modo de fallo esperado (parser comercial medio roto) sea detectable, no silencioso.

**Non-Goals**
- No se toca `locales`, ni entra aquí ninguna lógica de viabilidad o distancia legal.
- No se añade portal nuevo, ni alquiler, ni Idealista.
- Los rangos de m² por defecto de la UI no cambian según el tipo (entrada manual).

## Decisions

### 1. `tipo` es un campo más de `Busqueda`, y llega al provider por `CriteriosPortal`

`Busqueda.tipo` y `Anuncio.tipo` son `TipoInmueble = 'vivienda' | 'local'` (nuevo tipo exportado desde
`types/pisos.ts`, junto a `export const TIPOS = ['vivienda','local'] as const`, espejo de `PORTALES`).
`CriteriosPortal` gana `tipo: TipoInmueble` y `aCriteriosPortal()` en `rastreo.ts` lo copia como una línea
más. `AnuncioCrudo` también lo gana, y **cada provider lo estampa desde `criterios.tipo`**: así la columna
`anuncio.tipo` se llena desde el crudo y el feed puede filtrar sin JOIN ni derivarlo de la búsqueda.

`cumpleCriterios(crudo, busqueda)` ya se llama pasando la `Busqueda` entera como `Criterios` (compatibilidad
estructural). Al añadir `tipo` a las dos interfaces, el campo se propaga **sin tocar la llamada**.

| Alternativa descartada | Por qué |
|---|---|
| Un `PortalProvider` por tipo (`fotocasaViviendaProvider` / `fotocasaLocalProvider`) | Duplica parsers idénticos; es lo que hace `locales` y es justo lo que no queremos importar. |
| Derivar `anuncio.tipo` de la búsqueda con un JOIN en el feed | El filtro del feed se vuelve caro y el DTO deja de ser auto-descriptivo. |

### 2. Cada portal aprende su sección: un mapa `tipo → segmento`, no un segundo fichero

Dentro del bloque de conocimiento de cada portal, una constante y un ternario en `construirUrl`:

```ts
// fotocasa.ts — SIN VERIFICAR para 'local' (portado de locales/, candidato alternativo: 'local-comercial')
const SECCION: Record<TipoInmueble, string> = { vivienda: 'viviendas', local: 'locales' };
const ruta = `/es/comprar/${SECCION[criterios.tipo]}/${zona}/todas-las-zonas/l/${pagina > 1 ? pagina : ''}`;
// pisoscom.ts
const SECCION: Record<TipoInmueble, string> = { vivienda: 'pisos', local: 'locales' };
const ruta = pagina <= 1 ? `/venta/${SECCION[criterios.tipo]}-${zona}/` : `/venta/…/${pagina}/`;
```

Query params: en Fotocasa `minPrice`/`maxPrice`/`minSurface`/`maxSurface`/`sortType=publicationDate` y en
pisos.com `precioDesde`/`precioHasta`/`superficieDesde`/`superficieHasta`/`orden=relevancia-desc` valen para
los dos tipos. `minRooms` / `habitacionesDesde` **solo se emiten con `tipo='vivienda'`** — en `local` ese
criterio no existe (decisión 3 del proposal) y mandarlo sería un embudo inventado.

### 3. El filtro de subtipos es una tabla de rechazo por tipo, no dos predicados

`pareceAnuncio(nodo, tipo)` mantiene su forma actual; lo único que cambia es de qué conjunto lee:

```ts
const SUBTIPOS_RECHAZADOS: Record<TipoInmueble, Set<string>> = {
  vivienda: SUBTIPOS_NO_VIVIENDA,          // el set de hoy, intacto
  local: new Set(['flat','apartment','penthouse','duplex','studio','loft','house',
                  'chalet','villa','townhouse','countryhouse','rusticproperty']),
};
```

En ambos casos **un subtipo desconocido se acepta**: la URL ya filtró, y rechazar por silencio perdería
anuncios en silencio (principio transversal de la app). `parsearPagina(html, tipo = 'vivienda')` conserva el
default para no tocar tests ni smoke existentes. La etiqueta del título usa `SUBTIPO_LEGIBLE[subtipo] ??
(tipo === 'local' ? 'Local' : 'Vivienda')`, y el plan B de JSON-LD añade `Store`/`Place`/`RealEstateListing`
a `filtrarPorTipo` cuando `tipo='local'`.

pisos.com no publica subtipo en la tarjeta: se porta el rechazo por **slug de URL**
(`piso|atico|duplex|chalet|vivienda|apartamento|estudio|casa`) que ya usa `locales/portales/pisoscom.ts`.

**Rareza del `@type`**: pisos.com etiqueta también los locales como `SingleFamilyResidence`, así que
`mapaGeoPorId` deja de filtrar por `@type` y pasa a exigir `@id` + `geo` — es lo único de este cambio
**verificado contra el portal real** (2026-09, `/venta/locales-madrid/`). Es un ensanchamiento también para
`vivienda`; se cubre con el fixture residencial existente para probar que no entra basura.

### 4. La superficie de un local no cabe en la horquilla de vivienda

`extraerMetros` descarta fuera de `[15, 1000]` m². Una nave de 2.500 m² pasaría a `metros: null` en
silencio. Se porta `extraerSuperficieLocal` (horquilla `[10, 5000]`) a `pisos/portales/normalizar.ts` y los
parsers eligen extractor según `tipo`. Sin esto el modo de fallo es exactamente el que la app quiere evitar.

### 5. `cumpleCriterios` ramifica, sigue pura y gana una comprobación de coherencia

`Criterios` gana `tipo`. Se evalúan para ambos tipos: `ubicacion` (descarta aunque sea desconocida),
`precio` (descarta si es desconocido habiendo rango), `metros`, `excluir_palabras`. Se saltan con
`tipo === 'local'`: `habitaciones_min`, `banos_min`, `exige_ascensor|garaje|terraza`. Se añade una guarda
nueva al principio: `anuncio.tipo !== criterios.tipo` → `{cumple:false, motivo:'no es un ' + tipo}`. Es la
segunda línea de defensa detrás de la URL y del subtipo, y cuesta una línea.

Wallapop: `puedeBuscar` devuelve `{ok:false, motivo:'Wallapop no distingue local de vivienda en su categoría
inmobiliaria'}` **antes** de la comprobación de coordenadas. Cae en `omitidos`, que la UI ya pinta.

### 6. Zod: `tipo` entra en el alta con default e **se omite** del PATCH

`busquedaBaseSchema` gana `tipo: z.enum(TIPOS).default('vivienda')`. El update pasa a
`busquedaBaseSchema.omit({ tipo: true }).partial().strict().refine(...)`: con `.strict()`, mandar `tipo` en
un PATCH es un 400 (`Unrecognized key`) en vez de un campo ignorado. `omit` antes de `.partial()` evita
además que el `.default()` se cuele inyectando `'vivienda'` en cada actualización parcial. La allowlist de
`updateBusqueda()` en `queries.ts` tampoco incluye `tipo`: la inmutabilidad queda en dos capas.

### 7. Base de datos: dos columnas aditivas con default, y el CHECK en un `DO` idempotente

`init.sql`: `tipo TEXT NOT NULL DEFAULT 'vivienda'` + `CONSTRAINT <tabla>_tipo_valido CHECK (tipo IN
('vivienda','local'))` en `busqueda` y en `anuncio`. `migraciones.ts` (lista ordenada que corre en **cada**
arranque, así que todo debe ser idempotente y no destructivo) gana cuatro entradas:

```sql
ALTER TABLE busqueda ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'vivienda';
ALTER TABLE anuncio  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'vivienda';
-- ADD CONSTRAINT no admite IF NOT EXISTS en PG15 → guarda explícita
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='busqueda_tipo_valido')
  THEN ALTER TABLE busqueda ADD CONSTRAINT busqueda_tipo_valido CHECK (tipo IN ('vivienda','local'));
END IF; END $$;   -- ídem anuncio_tipo_valido
```

El `DEFAULT` es lo que convierte "toda fila existente pasa a `vivienda`" en un no-evento: no hace falta
`UPDATE` de relleno. `filas.ts` **no se toca**: `tipo` es TEXT, no NUMERIC.

`queries.ts`: `tipo` en `COLS_BUSQUEDA` y `COLS_ANUNCIO`, en el INSERT de `createBusqueda`, y en el INSERT
de `upsertAnuncio` — **no** en su `DO UPDATE SET`: el tipo de una fila ya existente no cambia nunca.
`FiltroAnuncios.tipo` añade `a.tipo = $n` en `listAnuncios`, y `routes/anuncios.ts` valida `?tipo=` contra
`TIPOS` con **el mismo 400-si-desconocido** que ya aplica a `portal`, por la misma razón: una lista vacía
sería indistinguible de "no hay anuncios de ese tipo".

### 8. Aviso y frontend: lo mínimo

`notificador.ts`: la cabecera de novedad pasa a `anuncio.tipo === 'local' ? '🏪 <b>Local nuevo</b>' : '🏠
<b>Piso nuevo</b>'`. La línea de características ya usa `.filter(Boolean)`, así que hab/baños desaparecen
solos en un local. Nada más.

Frontend: `types/index.ts` añade `TipoInmueble`, `Busqueda.tipo`, `Anuncio.tipo`, `BusquedaFormData.tipo`, y
`BusquedaUpdateData = Partial<Omit<BusquedaFormData,'tipo'>>` (la inmutabilidad se ve en el tipo, no solo en
el servidor). `BusquedaForm`: selector 🏠/🏪 arriba, **deshabilitado cuando hay `inicial`** con la nota "el
tipo no se puede cambiar: crea otra búsqueda"; con `local` se ocultan habitaciones, baños y el `fieldset`
de requisitos, y se envían `null`/`false`. `BusquedaList` y `AnuncioList` muestran el icono como distintivo;
`PisosPage` añade un `<select>` de tipo junto al de portal y `api.ts` propaga `tipo` en la query de
`/listings`.

## Testing Strategy

| Capa | Qué | Cómo |
|---|---|---|
| Portales | URL comercial, rechazo de subtipo, superficie ampliada, geo por `@id` sin `@type` | Fixtures **nuevos** `fotocasa-locales.html` y `pisoscom-locales.html`. **Deben capturarse con `npm run smoke` contra el portal real** — un fixture inventado solo se comprueba a sí mismo. Los fixtures residenciales actuales se reejecutan sin cambios: son la prueba de no-regresión. |
| `criterios.test.ts` | `local` ignora hab/baños/ascensor/garaje/terraza; sigue descartando por ubicación, precio desconocido, metros y palabras; descarta cruce de tipo | Función pura, sin BD |
| Esquemas | alta sin `tipo` → `'vivienda'`; alta con `local`; PATCH con `tipo` → 400 | `safeParse` directo |
| `queries.test.ts` | `tipo` en INSERT/SELECT/upsert, ausente del `DO UPDATE`, cláusula del filtro; SQL de migración idempotente | Aserciones sobre `text`/`values` (patrón actual) |
| Rutas | `?tipo=basura` → 400, paridad con `portal` | Test de ruta |
| **Smoke (manual)** | `npm run smoke -- <portal> "<zona>" [--tipo local]`, default `vivienda` | **Único paso que verifica la realidad.** La línea de cobertura omite hab/baños en `local` para no leerse como avería |

## Threat Matrix

N/A — no hay routing, shell, subproceso, automatización de VCS/PR ni clasificación de ficheros ejecutables.
El único borde externo (HTTP saliente a los portales) ya existe y no cambia de forma.

## Migration Plan

Aditivo puro y sin orden: las dos columnas nacen con `DEFAULT 'vivienda'`, así que el despliegue no necesita
ventana ni relleno. Toda búsqueda y todo anuncio existentes quedan `vivienda` y se comportan igual.

**Rollback**: revertir la rama basta. Las columnas `tipo` son inertes para el código anterior (nunca las
selecciona) y pueden quedarse; no hay migración de bajada ni pérdida de datos si se dejan.

**Paso manual obligatorio tras el merge**: ejecutar `npm run smoke -- fotocasa "<zona>" --tipo local` y
`npm run smoke -- pisos "<zona>" --tipo local` contra red real, y **contar con una ronda de ajuste por
portal**. Hasta que eso ocurra, el rastreo de locales es conocimiento portado sin verificar.

## Risks / Trade-offs

- **El conocimiento comercial nace sin verificar.** Las secciones `/es/comprar/locales/…` y
  `/venta/locales-<zona>/` son conjeturas heredadas de `locales`; el candidato alternativo de Fotocasa es
  `local-comercial`. Mitigación: smoke obligatorio y el segmento aislado en una constante de una línea.
- **Fallo silencioso: el parser medio roto.** Un listado comercial que se parsea a medias devuelve anuncios
  con precio y metros a `null`; con `precio=null` el filtro los descarta solo si hay rango de precio, y con
  metros a `null` pasan. El resultado sería una tanda de avisos vacíos. Mitigación: la cobertura por campo
  del smoke es la métrica, no el conteo de anuncios; y la decisión 4 elimina la causa más probable de
  `metros: null` en locales.
- **Ensanchar `mapaGeoPorId`** (quitar el filtro por `@type`) toca también el camino de vivienda. Riesgo
  bajo (se exige `@id` + `geo`) pero real; queda cubierto por el fixture residencial existente.
- **Wallapop desaparece para `local`** por decisión, no por avería: si el usuario espera resultados de ahí,
  el motivo tiene que verse en la UI (ya se muestra vía `omitidos`).

## Open Questions

- [ ] ¿Hace falta algún criterio propio de local (`apto_vivienda`, fachada a calle, planta)? El proposal lo
      dejó abierto; este diseño lo **cierra en negativo para la primera rebanada**: precio + metros +
      ubicación + exclusiones. Añadir uno después es una columna nullable más, no un rediseño.
- [ ] ¿Confirmar el segmento real de la URL de locales en ambos portales? Solo lo responde el smoke.
