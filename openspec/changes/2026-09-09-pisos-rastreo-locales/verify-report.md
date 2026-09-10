# Verify Report - 2026-09-09-pisos-rastreo-locales

Verdict: PASS WITH WARNINGS (pass-with-notes)
Mode: openspec (file store; Engram not reachable)
Branch: feature/pisos-rastreo-locales (7 commits ahead of origin/main, tree clean)

## Executive summary

The tipo (vivienda | local) feature is implemented end-to-end and matches spec and
design. Backend builds clean, npm test green (13 files / 136 tests), frontend builds
clean. No CRITICAL issues. Findings: 1 deliberate spec-wording deviation and 4
test-coverage gaps versus tasks.md; none block archive. Tasks 3.5 and 8.3 correctly
left unchecked (real-network).

## Build / test evidence (observed)

- pisos/backend npm run build (tsc): exit 0, clean
- pisos/backend npm test (vitest run): exit 0 - Test Files 13 passed, Tests 136 passed
- pisos/frontend npm run build (tsc && vite build): exit 0 - 48 modules

No route-level or rastreo-level test files exist (pre-existing gap; frontend has no
tests anywhere in the monorepo per CLAUDE.md).

## Per-requirement checklist

- tipo enum on create schema, default vivienda: MET - pisos.schema.ts:26; pisos.schema.test.ts:11-25
- Unknown tipo rejected on create: MET - pisos.schema.test.ts:23
- Default applied when tipo omitted (persist path): MET - queries.ts:64; queries.test.ts:57-64
- tipo immutable, PATCH schema omit-tipo + partial + strict: MET - pisos.schema.ts:113-116; pisos.schema.test.ts:29-37
- tipo immutable, updateBusqueda allowlist excludes tipo: MET - queries.ts:92-100; queries.test.ts:71-75
- tipo immutable, upsertAnuncio DO UPDATE SET excludes tipo: MET - queries.ts:273-275; queries.test.ts:83-88
- PATCH re-sending same tipo -> accepted (spec SHALL): NOT MET, deliberate deviation - strict() rejects; documented pisos.schema.test.ts:34-37; PisosPage handleActualizar strips tipo. See WARNING-1
- Migration ADD COLUMN IF NOT EXISTS + DEFAULT vivienda: MET - migraciones.ts:38,42; migraciones.test.ts:11-16
- Migration CHECK via DO block / pg_constraint guard: MET - migraciones.ts:47-61; migraciones.test.ts:18-27
- Migration no backfill UPDATE for tipo: MET - migraciones.test.ts:29-33
- anuncio.tipo in INSERT + SELECT cols: MET - queries.ts:17,271; queries.test.ts:66-68,83-88
- /listings tipo= filters; 400 on unknown (parity with portal=): MET in code - anuncios.ts:60-65; queries.ts:170-173; queries.test.ts:77-81. Route 400 path not unit-tested, WARNING-4
- cumpleCriterios pure; local skips habitaciones/banos/ascensor/garaje/terraza: MET - criterios.ts:93-117; criterios.test.ts:140-158
- local still discards on ubicacion + precio unknown; exclusions still apply: MET - criterios.ts:67-89,119-124; criterios.test.ts:160-189
- Cross-tipo ad discarded: MET - criterios.ts:67-69; criterios.test.ts:133-138
- Fotocasa construirUrl branches by tipo (commercial segment): MET in code - fotocasa.ts:62,68. Not unit-tested (not exported), WARNING-2
- Fotocasa minRooms only for vivienda: MET - fotocasa.ts:77-79
- Fotocasa subtype reject-set flips by tipo; unknown accepted: MET - fotocasa.ts:88-123; fotocasa.test.ts:68-85
- Fotocasa crudo.tipo stamped; JSON-LD plan B adds Store/Place/RealEstateListing: MET - fotocasa.ts:241,267-271,286; fotocasa.test.ts:75-77
- Fotocasa extraerSuperficieLocal used for local: MET - fotocasa.ts:225,273; fotocasa.test.ts:77
- pisos.com construirUrl branches by tipo: MET in code - pisoscom.ts:49,58-60. Not unit-tested, WARNING-3
- pisos.com habitacionesDesde only for vivienda: MET - pisoscom.ts:68-70
- pisos.com subtype reject by URL slug for local: MET in code - pisoscom.ts:52,180-185. No local fixture/slug test, WARNING-3
- pisos.com crudo.tipo stamped: MET - pisoscom.ts:219
- pisos.com mapaGeoPorId no longer filters by @type: MET - pisoscom.ts:102-123; no-regression via existing residential fixture (SingleFamilyResidence still resolves geo) pisoscom.test.ts:12,55
- extraerSuperficieLocal range 10..5000: MET - normalizar.ts:102-109; normalizar.test green
- pisos.com residential fixture still green (no regression): MET - pisoscom.test.ts:40-65
- wallapop puedeBuscar -> ok:false + motivo for local before coords check: MET - wallapop.ts:184-201; wallapop.test.ts:93-103
- wallapop parsed ad stamped tipo vivienda: MET - wallapop.ts:158-159
- rastreo aCriteriosPortal copies tipo; partial-failure semantics kept: MET in code - rastreo.ts:42-56. No local partial-failure test (task 4.2), WARNING-5
- notificador local icon for local, house icon for vivienda: MET - notificador.ts:60-61; notificador.test.ts:86-98
- first-pass / manual crawl still no-notify: MET - code path unchanged; existing coverage green
- Frontend BusquedaForm disables tipo when editing, hides residential fields for local: MET - BusquedaForm.tsx disabled Boolean(inicial), esLocal guards, sends null/false
- Frontend BusquedaList / AnuncioList badge: MET - ICONO_TIPO in both
- Frontend PisosPage feed filter: MET - filtroTipo state + select + api propagation
- Frontend actualizarBusqueda never sends tipo: MET - BusquedaUpdateData omits tipo; PisosPage handleActualizar strips tipo
- CLAUDE.md ## Pisos documents tipo; states ports/roles/AppLauncher unchanged: MET - new "Tipo de inmueble" subsection + "Lo que NO cambia" paragraph
- Nothing outside pisos/, artifact folder, CLAUDE.md touched: MET - git diff --stat only CLAUDE.md, openspec change dir, pisos/**
- Tasks 3.5 and 8.3 left unchecked: MET - tasks.md both unchecked
- Fotocasa HTML_LOCALES fixture clearly marked placeholder: MET - fotocasa.test.ts:33-39

## Issues

### CRITICAL
None.

### WARNING

1. Spec deviation: PATCH re-sending the current tipo is rejected (400), not accepted.
   Spec "El tipo es inmutable" says it SHALL be accepted. Deliberate and documented
   (design decision 6; tasks 1.3/5.1); frontend never sends tipo on edit. Amend the
   spec scenario or record as accepted deviation at archive.

2. fotocasa.test.ts:65 is an expect(true).toBe(true) filler for the commercial URL
   test. construirUrl is not exported, so the Fotocasa commercial URL segment has no
   automated coverage (only the unverified HTML_LOCALES placeholder fixture + manual
   smoke). Suite is honestly green but this assertion proves nothing.

3. pisos.com local path has no test coverage (task 3.3 promised commercial URL, slug
   rejection, mapaGeoPorId without @type). pisoscom.test.ts untouched. The @type
   removal is implicitly no-regression-tested via the existing residential fixture;
   SLUGS_RESIDENCIALES rejection and the commercial URL segment are not.

4. /listings tipo=nave -> 400 is coded (anuncios.ts:60-65, mirrors portal=) but not
   unit-tested; project has no route-test harness.

5. No local partial-failure test (task 4.2). No rastreo.test.ts exists. The one-line
   aCriteriosPortal change is trivially correct and type-checks.

### SUGGESTION

- Capture the two real commercial fixtures (task 3.5) before merge if a network-capable
  environment is available, converting WARNING 2/3 into real coverage.
- Optional unit test on smoke.ts leerTexto / --tipo handling.

## Design coherence

Implementation follows design.md decisions 1-8 faithfully: single tipo field across
Busqueda/Anuncio/AnuncioCrudo/CriteriosPortal, tipo-to-segmento maps (no per-tipo
provider files), reject-set records, two-layer immutability, additive idempotent
migration with no backfill, filas.ts untouched. No unplanned architectural changes.

## Task completion

Tasks 1.1-8.2 checked and consistent with code. 3.5 and 8.3 correctly unchecked
(real-network). Test sub-clauses of 3.3 and 4.2 partially unmet (WARNING 3, 5); the
code portions are complete.

## Next recommended

sdd-archive - no CRITICAL issues. Resolve WARNING-1 (amend spec scenario or record
deviation) before archive. Post-merge mandatory real-network smoke still gates
"locales scraping verified" per design.md and CLAUDE.md.

## Skill resolution

paths-injected - sdd-verify/SKILL.md + _shared/sdd-phase-common.md loaded.
