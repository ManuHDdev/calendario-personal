# Tasks: `pisos` — rastreo de locales comerciales

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~900–1300 (incluye 2 fixtures HTML capturados) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-forecast |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

Cambio cohesivo (un solo campo `tipo` atravesando tipos→schema→DB→portales→filtro→aviso→rutas→frontend); partirlo dejaría slices que no compilan. `review_budget_lines: 20000` ⇒ sin umbral de split. PR único.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | `tipo` end-to-end (vivienda byte-a-byte igual, local rastreable) | PR 1 | `cd pisos/backend && npm test` + `cd pisos/frontend && npm run build` | `npm run smoke -- fotocasa "<zona>" --tipo local` (red real) | rama entera revertible; columnas `tipo` inertes para el código anterior |

## Phase 1: Fundamentos (tipos + schema)

- [x] 1.1 `pisos/backend/src/types/pisos.ts`: `export const TIPOS = ['vivienda','local'] as const`, `export type TipoInmueble = typeof TIPOS[number]`; añadir `tipo: TipoInmueble` a `Busqueda`, `Anuncio`, `AnuncioCrudo`. (satisface: Tipo de inmueble por búsqueda, El anuncio hereda el tipo)
- [x] 1.2 `pisos/backend/src/portales/types.ts`: `CriteriosPortal` gana `tipo: TipoInmueble`. (satisface: Rastreo según el tipo)
- [x] 1.3 `pisos/backend/src/schemas/pisos.schema.ts`: `busquedaBaseSchema` gana `tipo: z.enum(TIPOS).default('vivienda')`; el update pasa a `busquedaBaseSchema.omit({ tipo: true }).partial().strict().refine(...)`. Test (`safeParse` en el `.test.ts` del schema o `busquedas` route test): alta sin `tipo` → `'vivienda'`; alta con `tipo:'local'` ok; alta con `tipo:'garaje'` → error; PATCH con `tipo` → error `Unrecognized key`; PATCH reenviando el mismo `tipo` → (n/a, `omit` lo rechaza) documentar que la re-igualdad se cubre a nivel ruta. (satisface: Tipo por defecto, Tipo inválido rechazado, El tipo es inmutable)

## Phase 2: Base de datos

- [x] 2.1 `pisos/infra/init.sql`: en `busqueda` y `anuncio` añadir `tipo TEXT NOT NULL DEFAULT 'vivienda'` + `CONSTRAINT <tabla>_tipo_valido CHECK (tipo IN ('vivienda','local'))`.
- [x] 2.2 `pisos/backend/src/db/migraciones.ts`: 4 entradas idempotentes — `ALTER TABLE busqueda/anuncio ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'vivienda'` y, para cada tabla, bloque `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='<tabla>_tipo_valido') THEN ALTER TABLE ... ADD CONSTRAINT ... CHECK (tipo IN ('vivienda','local')); END IF; END $$;` (PG15 no admite `ADD CONSTRAINT IF NOT EXISTS`; corre en cada arranque). Test en `queries.test.ts` (o `migraciones.test.ts`): el SQL de migración contiene `IF NOT EXISTS` y la guarda `pg_constraint`; sin `UPDATE` de relleno. (satisface: Migración de datos existentes)
- [x] 2.3 `pisos/backend/src/db/queries.ts`: `tipo` en `COLS_BUSQUEDA` y `COLS_ANUNCIO`; en el INSERT de `createBusqueda`; en el INSERT de `upsertAnuncio` pero **NO** en su `DO UPDATE SET`; allowlist de `updateBusqueda()` **NO** incluye `tipo` (2ª capa de inmutabilidad). `FiltroAnuncios` gana `tipo?` y `listAnuncios` añade `a.tipo = $n`. Tests en `queries.test.ts` sobre `text`/`values`: `tipo` presente en INSERT/SELECT/upsert-insert, ausente del `DO UPDATE`, ausente de la allowlist del update, cláusula `a.tipo = $n` en el filtro. (satisface: El anuncio hereda el tipo, Filtro del feed por tipo)
- [x] 2.4 `pisos/backend/src/db/filas.ts`: **NO se toca** — `tipo` es TEXT, no NUMERIC. (marcar hecho tras confirmar).

## Phase 3: Portales

- [x] 3.1 `pisos/backend/src/portales/normalizar.ts`: añadir `extraerSuperficieLocal` con horquilla `[10, 5000]` m² (vs `extraerMetros` `[15, 1000]`), para que una nave grande no caiga a `metros: null` en silencio. Test en `normalizar.test.ts`: 2500 m² pasa con `local`, se rechaza con el extractor de vivienda; <10 y >5000 → `null`. (satisface: Filtro fino según el tipo — datos coherentes)
- [x] 3.2 `pisos/backend/src/portales/fotocasa.ts` (dentro del bloque de conocimiento): `const SECCION: Record<TipoInmueble,string> = { vivienda:'viviendas', local:'locales' }` + ternario en `construirUrl`; `minRooms` **solo** con `tipo==='vivienda'`; `SUBTIPOS_RECHAZADOS: Record<TipoInmueble, Set<string>>` (`vivienda`=set actual intacto, `local`=`flat/apartment/penthouse/duplex/studio/loft/house/chalet/villa/townhouse/countryhouse/rusticproperty`); subtipo desconocido se acepta; etiqueta `SUBTIPO_LEGIBLE[x] ?? (tipo==='local'?'Local':'Vivienda')`; plan B JSON-LD añade `Store/Place/RealEstateListing` cuando `tipo==='local'`; estampar `crudo.tipo = criterios.tipo`. `parsearPagina(html, tipo='vivienda')` conserva el default. Fixture nuevo `fotocasa-locales.html` (ver 3.5). Tests en `fotocasa.test.ts`: URL comercial, acepta subtipo local/nave/oficina, rechaza subtipo vivienda, superficie ampliada; los tests residenciales existentes se reejecutan sin cambios (no-regresión).
- [x] 3.3 `pisos/backend/src/portales/pisoscom.ts`: `const SECCION: Record<TipoInmueble,string> = { vivienda:'pisos', local:'locales' }` + ternario en `construirUrl`; `habitacionesDesde` solo con `vivienda`; rechazo por **slug de URL** (`piso|atico|duplex|chalet|vivienda|apartamento|estudio|casa`) para `local`; **quitar el filtro por `@type` en `mapaGeoPorId`** y exigir `@id` + `geo` (pisos.com etiqueta locales como `SingleFamilyResidence` — único detalle verificado contra el portal real, 2026-09); estampar `crudo.tipo`. Fixture nuevo `pisoscom-locales.html` (ver 3.5). Tests en `pisoscom.test.ts`: URL comercial, rechazo por slug, `mapaGeoPorId` resuelve geo sin `@type`; **el fixture residencial existente prueba que el camino ensanchado no mete basura** (no-regresión).
- [x] 3.4 `pisos/backend/src/portales/wallapop.ts`: `puedeBuscar()` devuelve `{ ok:false, motivo:'Wallapop no distingue local de vivienda en su categoría inmobiliaria' }` para `tipo==='local'` **antes** de la comprobación de coordenadas; cae en `omitidos`. Test en `wallapop.test.ts`: `tipo:'local'` → `ok:false` con motivo, no consulta HTTP. (satisface: Rastreo según el tipo — Wallapop se omite con motivo visible)
- [ ] 3.5 **Captura de fixtures comerciales (requiere RED REAL — lo hace quien implementa, NO en CI).** `npm run smoke -- fotocasa "<zona>" --tipo local` y `... pisos "<zona>" --tipo local`, guardar el HTML servido como `pisos/backend/src/portales/__fixtures__/fotocasa-locales.html` y `pisoscom-locales.html`. Un fixture inventado solo se comprueba a sí mismo. Bloquea a 3.2/3.3 para su verificación final.

## Phase 4: Filtro, rastreo y aviso

- [x] 4.1 `pisos/backend/src/services/criterios.ts`: `Criterios` gana `tipo`. `cumpleCriterios` sigue **pura**; guarda nueva al principio: `anuncio.tipo !== criterios.tipo` → `{ cumple:false, motivo:'no es un '+tipo }`. Para `tipo==='local'` **no** se evalúan `habitaciones_min`, `banos_min`, `exige_ascensor`, `exige_garaje`, `exige_terraza`; sí `ubicacion` (descarta aun desconocida), `precio` (descarta si desconocido habiendo rango), `metros`, `excluir_palabras`. Tests en `criterios.test.ts`: local sin habitaciones/ascensor no se descarta; precio desconocido pasa, fuera de rango descarta; palabra excluida descarta; cruce de tipo descarta. (satisface: Filtro fino según el tipo)
- [x] 4.2 `pisos/backend/src/services/rastreo.ts`: `aCriteriosPortal()` copia `tipo` de la `Busqueda` como una línea más; conservar la semántica de rastreo parcial (un portal que falla degrada, escribe `ultimo_rastreo_error`, no aborta). Test/aserción existente de fallo parcial se reejecuta; añadir caso `tipo:'local'` con pisos.com caído + Fotocasa ok. (satisface: Rastreo según el tipo — fallo parcial)
- [x] 4.3 `pisos/backend/src/telegram/notificador.ts`: cabecera de novedad → `anuncio.tipo === 'local' ? '🏪 <b>Local nuevo</b>' : '🏠 <b>Piso nuevo</b>'`; la línea de características ya usa `.filter(Boolean)` (hab/baños desaparecen solos). Test en `notificador.test.ts`: mensaje de local empieza con 🏪, de vivienda con 🏠. Confirmar que primera pasada / rastreo manual siguen sin notificar (test existente). (satisface: Aviso de Telegram según el tipo)

## Phase 5: Rutas

- [x] 5.1 `pisos/backend/src/routes/busquedas.ts`: `POST` usa el schema con `tipo` default; `PATCH` usa el schema `.omit({tipo}).partial().strict()`. Tests de ruta: `POST` sin `tipo` crea `vivienda`; `POST tipo:'local'` ok; `POST tipo:'garaje'` → 400; `PATCH {tipo:'local'}` sobre vivienda → 400 y sin cambios; `PATCH` reenviando el `tipo` actual → aceptado (validar que la ruta lo tolera o lo ignora sin 400 si el cliente lo manda igual — alinear con `.strict()`; si `.strict()` lo rechaza, el frontend nunca lo envía, dejar constancia en el test). (satisface: El tipo es inmutable)
- [x] 5.2 `pisos/backend/src/routes/anuncios.ts`: `GET /listings` acepta `?tipo=`, validado contra `TIPOS`; valor desconocido → **400** (paridad con la regla existente de `?portal=` desconocido), no lista vacía. Test de ruta: `?tipo=local` filtra; `?tipo=nave` → 400. (satisface: Filtro del feed por tipo)

## Phase 6: Backend build + tests

- [x] 6.1 `cd pisos/backend && npm run build` limpio y `npm test` (vitest) entero en verde. Bloqueante para "done".

## Phase 7: Frontend

- [x] 7.1 `pisos/frontend/src/types/index.ts`: `TipoInmueble` + `TIPOS`; `tipo` en `Busqueda`, `Anuncio`, `BusquedaFormData`; `BusquedaUpdateData = Partial<Omit<BusquedaFormData,'tipo'>>` (inmutabilidad en el tipo).
- [x] 7.2 `pisos/frontend/src/services/api.ts`: propagar `tipo` en la query de `GET /listings`; `crearBusqueda` envía `tipo`; `actualizarBusqueda` nunca envía `tipo` (tipo `BusquedaUpdateData`).
- [x] 7.3 `pisos/frontend/src/components/BusquedaForm.tsx`: selector 🏠/🏪 arriba, **deshabilitado cuando hay `inicial`** con nota "el tipo no se puede cambiar: crea otra búsqueda"; con `tipo==='local'` ocultar habitaciones, baños y el `fieldset` de requisitos (ascensor/garaje/terraza) y enviar `null`/`false` en esos campos. (satisface: El formulario y el listado reflejan el tipo)
- [x] 7.4 `pisos/frontend/src/components/BusquedaList.tsx` y `AnuncioList.tsx`: mostrar el icono 🏠/🏪 como distintivo de cada fila. (satisface: El formulario y el listado reflejan el tipo)
- [x] 7.5 `pisos/frontend/src/pages/PisosPage.tsx`: `<select>` de `tipo` junto al de `portal` en el feed, propaga el filtro a `api.ts`.
- [x] 7.6 Tests de frontend si el proyecto los tiene para estos componentes (BusquedaForm oculta campos en modo local; AnuncioList pinta el icono). `cd pisos/frontend && npm run build` en verde. Bloqueante para "done".

## Phase 8: Smoke y docs

- [x] 8.1 `pisos/backend/src/smoke.ts`: aceptar argumento `--tipo local` (default `vivienda`) para verificar los parsers comerciales en vivo; la línea de cobertura por campo omite hab/baños en `local` para no leerse como avería.
- [x] 8.2 `CLAUDE.md` sección `## Pisos`: documentar el nuevo comportamiento de `tipo` (vivienda|local excluyentes, migración a `vivienda`, secciones comerciales de Fotocasa/pisos.com, Wallapop omite `local` con motivo, filtro fino que ignora criterios residenciales, avisos 🏪/🏠, `smoke --tipo local`). **Indicar explícitamente que NO se tocan**: la tabla de puertos, la tabla de roles, ni las 15 copias del AppLauncher (no es subapp nueva, no hay puerto/rol/BD nuevos).
- [ ] 8.3 **Post-merge obligatorio (RED REAL, fuera de CI):** `npm run smoke -- fotocasa "<zona>" --tipo local` y `npm run smoke -- pisos "<zona>" --tipo local`; **presupuestar una ronda de ajuste por portal** — las secciones `/es/comprar/locales/…` y `/venta/locales-<zona>/` son conocimiento portado de `locales/` sin verificar (candidato alternativo Fotocasa: `local-comercial`). Hasta esto, el rastreo de locales es no verificado.
