/**
 * Acceso a datos. Consultas directas con `pg`, sin ORM, como el resto del
 * monorepo. Todo listado filtra `activo = true`.
 */

import { pool } from './pool';
import type {
  Anuncio,
  AnuncioCrudo,
  Busqueda,
  Establecimiento,
  NombreMotor,
  PrecisionCoordenadas,
  Umbrales,
  ViabilidadColumnas,
} from '../types/locales';
import type { CajaBusqueda } from '../viabilidad/geo';
import { normalizarFila } from './filas';

/**
 * Lo mínimo que necesita una consulta: `pool` o un `PoolClient` de un batch.
 * Permite que el rastreo abra un solo cliente para toda una vuelta.
 */
export interface Ejecutor {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}

// ---------------------------------------------------------------------------
// Normativa
// ---------------------------------------------------------------------------

interface FilaNormativa {
  comunidad: string;
  zona_excepcion: string | null;
  distancia_farmacias_m: number;
  distancia_centros_sanitarios_m: number | null;
  verificado: boolean;
  fuente_url: string | null;
  notas: string | null;
}

export interface SobreescrituraUmbrales {
  comprobarFarmacias?: boolean;
  comprobarCentrosSanitarios?: boolean;
  distanciaFarmaciasM?: number | null;
  distanciaCentrosSanitariosM?: number | null;
}

/**
 * Umbrales aplicables a una comunidad, con las sobreescrituras de la búsqueda.
 *
 * Sin fila de normativa NO se inventa un 250: se devuelven umbrales nulos y el
 * veredicto dirá que no hay normativa cargada. Rellenar el hueco con el
 * mínimo estatal aquí escondería una comunidad sin sembrar.
 */
export async function getUmbrales(
  comunidad: string | null,
  over: SobreescrituraUmbrales = {},
): Promise<Umbrales> {
  let fila: FilaNormativa | undefined;

  if (comunidad) {
    const { rows } = await pool.query<FilaNormativa>(
      `SELECT comunidad, zona_excepcion, distancia_farmacias_m,
              distancia_centros_sanitarios_m, verificado, fuente_url, notas
         FROM normativa
        WHERE activo AND comunidad = $1 AND zona_excepcion IS NULL`,
      [comunidad],
    );
    fila = rows[0];
  }

  const baseFarmacias = fila?.distancia_farmacias_m ?? null;
  const baseCentros = fila?.distancia_centros_sanitarios_m ?? null;

  const usaOverFarmacias = over.distanciaFarmaciasM !== undefined;
  const usaOverCentros = over.distanciaCentrosSanitariosM !== undefined;

  let distanciaFarmaciasM = usaOverFarmacias ? over.distanciaFarmaciasM ?? null : baseFarmacias;
  let distanciaCentrosSanitariosM = usaOverCentros
    ? over.distanciaCentrosSanitariosM ?? null
    : baseCentros;

  // Apagar una comprobación es distinto de no tener umbral: lo pide el usuario.
  if (over.comprobarFarmacias === false) distanciaFarmaciasM = null;
  if (over.comprobarCentrosSanitarios === false) distanciaCentrosSanitariosM = null;

  const origen: Umbrales['origen'] =
    usaOverFarmacias && usaOverCentros
      ? 'busqueda'
      : usaOverFarmacias || usaOverCentros
        ? 'mixto'
        : 'normativa';

  return {
    comunidad: fila?.comunidad ?? comunidad,
    distanciaFarmaciasM,
    distanciaCentrosSanitariosM,
    origen,
    verificado: fila?.verificado ?? false,
    fuenteUrl: fila?.fuente_url ?? null,
    notas:
      fila?.notas ??
      (comunidad
        ? `No hay normativa cargada para "${comunidad}"; no se ha aplicado ninguna distancia.`
        : 'No se conoce la comunidad autónoma del punto, así que no se ha aplicado ninguna distancia.'),
  };
}

export async function listNormativa(): Promise<FilaNormativa[]> {
  const { rows } = await pool.query<FilaNormativa>(
    `SELECT comunidad, zona_excepcion, distancia_farmacias_m,
            distancia_centros_sanitarios_m, verificado, fuente_url, notas
       FROM normativa
      WHERE activo
      ORDER BY comunidad, zona_excepcion NULLS FIRST`,
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Padrón
// ---------------------------------------------------------------------------

interface FilaEstablecimiento {
  id: number;
  nombre: string | null;
  direccion: string | null;
  municipio: string | null;
  precision_coordenadas: PrecisionCoordenadas;
  fuente: string;
  latitud: number;
  longitud: number;
}

function aEstablecimiento(f: FilaEstablecimiento): Establecimiento {
  return {
    id: f.id,
    nombre: f.nombre,
    direccion: f.direccion,
    municipio: f.municipio,
    precision: f.precision_coordenadas,
    fuente: f.fuente,
    lat: Number(f.latitud),
    lng: Number(f.longitud),
  };
}

/**
 * Establecimientos activos dentro de una caja envolvente.
 *
 * La caja es un embudo barato que aprovecha el índice; el recorte fino por
 * distancia real lo hace `candidatasEnRadio` en memoria. Se excluyen los
 * marcados como duplicado de otra fila, para no contar dos veces la misma
 * farmacia y creer que hay más cobertura de la que hay.
 */
async function establecimientosEnCaja(
  tabla: 'farmacia' | 'centro_sanitario',
  caja: CajaBusqueda,
): Promise<Establecimiento[]> {
  const { rows } = await pool.query<FilaEstablecimiento>(
    `SELECT id, nombre, direccion, municipio, precision_coordenadas, fuente, latitud, longitud
       FROM ${tabla}
      WHERE activo
        AND duplicado_de_id IS NULL
        AND latitud  BETWEEN $1 AND $2
        AND longitud BETWEEN $3 AND $4`,
    [caja.minLat, caja.maxLat, caja.minLng, caja.maxLng],
  );
  return rows.map(aEstablecimiento);
}

export const farmaciasEnCaja = (caja: CajaBusqueda) => establecimientosEnCaja('farmacia', caja);
export const centrosEnCaja = (caja: CajaBusqueda) =>
  establecimientosEnCaja('centro_sanitario', caja);

/** ¿Hay algo sembrado para esta comunidad? Si no, no se calcula viabilidad. */
export async function padronTieneFarmacias(comunidad: string | null): Promise<boolean> {
  const { rows } = await pool.query<{ n: string }>(
    comunidad
      ? 'SELECT count(*)::text AS n FROM farmacia WHERE activo AND comunidad = $1'
      : 'SELECT count(*)::text AS n FROM farmacia WHERE activo',
    comunidad ? [comunidad] : [],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

export interface Cobertura {
  suficiente: boolean;
  motivo: string | null;
}

/**
 * Cobertura del padrón en un municipio.
 *
 * Un municipio del que no se sabe nada NO se da por bueno: sin dato de
 * cobertura no se puede afirmar que el padrón esté completo, y el verde se
 * degradaría igualmente. Es la dirección segura del error.
 */
export async function getCobertura(
  municipio: string | null,
  provincia: string | null,
): Promise<Cobertura> {
  if (!municipio) {
    return {
      suficiente: false,
      motivo: 'No se conoce el municipio del punto, así que no se puede valorar si el padrón de farmacias está completo.',
    };
  }

  const { rows } = await pool.query<{
    suficiente: boolean;
    motivo: string | null;
    farmacias_conocidas: number;
    farmacias_esperadas: number | null;
  }>(
    `SELECT suficiente, motivo, farmacias_conocidas, farmacias_esperadas
       FROM cobertura_municipio
      WHERE municipio = $1 AND provincia IS NOT DISTINCT FROM $2`,
    [municipio, provincia],
  );

  const fila = rows[0];
  if (!fila) {
    return {
      suficiente: false,
      motivo: `No se ha calculado la cobertura del padrón en ${municipio}, así que no se puede afirmar que esté completo.`,
    };
  }

  return {
    suficiente: fila.suficiente,
    motivo:
      fila.motivo ??
      (fila.suficiente
        ? null
        : `Padrón incompleto en ${municipio}: ${fila.farmacias_conocidas} farmacias conocidas` +
          (fila.farmacias_esperadas ? `, ~${fila.farmacias_esperadas} esperadas.` : '.')),
  };
}

// ---------------------------------------------------------------------------
// Caché de distancias peatonales
// ---------------------------------------------------------------------------

export async function leerRutaCache(
  motor: NombreMotor,
  origenGeo: string,
  destinosGeo: string[],
): Promise<Map<string, number | null>> {
  if (destinosGeo.length === 0) return new Map();
  const { rows } = await pool.query<{ destino_geo: string; metros: number | null }>(
    `SELECT destino_geo, metros
       FROM ruta_cache
      WHERE motor = $1 AND origen_geo = $2 AND destino_geo = ANY($3::text[])`,
    [motor, origenGeo, destinosGeo],
  );
  return new Map(rows.map((r) => [r.destino_geo, r.metros === null ? null : Number(r.metros)]));
}

export async function escribirRutaCache(
  motor: NombreMotor,
  origenGeo: string,
  entradas: Array<{ destinoGeo: string; metros: number | null }>,
): Promise<void> {
  if (entradas.length === 0) return;
  await pool.query(
    `INSERT INTO ruta_cache (origen_geo, destino_geo, motor, metros)
     SELECT $2, d.destino, $1, d.metros
       FROM unnest($3::text[], $4::int[]) AS d(destino, metros)
     ON CONFLICT (origen_geo, destino_geo, motor) DO NOTHING`,
    [
      motor,
      origenGeo,
      entradas.map((e) => e.destinoGeo),
      entradas.map((e) => e.metros),
    ],
  );
}

// ---------------------------------------------------------------------------
// Estado del rastreador
// ---------------------------------------------------------------------------

export async function getScraperState(): Promise<{ running: boolean; updatedAt: Date }> {
  const { rows } = await pool.query<{ running: boolean; updated_at: Date }>(
    'SELECT running, updated_at FROM scraper_state WHERE id = TRUE',
  );
  return { running: rows[0]?.running ?? true, updatedAt: rows[0]?.updated_at ?? new Date() };
}

export async function setScraperState(running: boolean): Promise<void> {
  await pool.query(
    `INSERT INTO scraper_state (id, running, updated_at) VALUES (TRUE, $1, NOW())
     ON CONFLICT (id) DO UPDATE SET running = EXCLUDED.running, updated_at = NOW()`,
    [running],
  );
}

// ---------------------------------------------------------------------------
// Búsquedas guardadas
// ---------------------------------------------------------------------------

const COLS_BUSQUEDA = `id, nombre, tipo, comunidad, provincia, municipio, zona_texto,
  latitud, longitud, radio_km, precio_min, precio_max, superficie_min, superficie_max,
  pie_calle, facturacion_min, facturacion_max, comprobar_farmacias,
  comprobar_centros_sanitarios, distancia_farmacias_m, distancia_centros_sanitarios_m,
  portales, habilitada, notificar, ultimo_rastreo, ultimo_rastreo_error,
  created_at, updated_at`;

/** Campos que un alta/edición puede tocar. La allowlist es la defensa real. */
const CAMPOS_BUSQUEDA = [
  'nombre', 'tipo', 'comunidad', 'provincia', 'municipio', 'zona_texto',
  'latitud', 'longitud', 'radio_km', 'precio_min', 'precio_max',
  'superficie_min', 'superficie_max', 'pie_calle', 'facturacion_min', 'facturacion_max',
  'comprobar_farmacias', 'comprobar_centros_sanitarios',
  'distancia_farmacias_m', 'distancia_centros_sanitarios_m',
  'portales', 'habilitada', 'notificar',
] as const;

type CrearBusqueda = Partial<Record<(typeof CAMPOS_BUSQUEDA)[number], unknown>> & {
  nombre: string;
  tipo: 'local' | 'farmacia';
  portales: string[];
};
type ActualizarBusqueda = Partial<Record<(typeof CAMPOS_BUSQUEDA)[number], unknown>>;

function filaBusqueda(fila: Record<string, unknown>): Busqueda {
  return normalizarFila(fila) as unknown as Busqueda;
}

export async function listBusquedas(): Promise<Busqueda[]> {
  const { rows } = await pool.query(
    `SELECT ${COLS_BUSQUEDA} FROM busqueda WHERE activo = true ORDER BY created_at DESC`,
  );
  return rows.map(filaBusqueda);
}

/** Las que el planificador debe rastrear: activas Y no pausadas. */
export async function listBusquedasRastreables(): Promise<Busqueda[]> {
  const { rows } = await pool.query(
    `SELECT ${COLS_BUSQUEDA} FROM busqueda
      WHERE activo = true AND habilitada = true
      ORDER BY created_at ASC`,
  );
  return rows.map(filaBusqueda);
}

export async function getBusqueda(id: number): Promise<Busqueda | null> {
  const { rows } = await pool.query(
    `SELECT ${COLS_BUSQUEDA} FROM busqueda WHERE id = $1 AND activo = true`,
    [id],
  );
  return rows[0] ? filaBusqueda(rows[0]) : null;
}

export async function crearBusqueda(data: CrearBusqueda): Promise<Busqueda> {
  const columnas: string[] = [];
  const marcadores: string[] = [];
  const values: unknown[] = [];
  for (const c of CAMPOS_BUSQUEDA) {
    if (data[c] === undefined) continue;
    columnas.push(c);
    values.push(data[c]);
    marcadores.push(`$${values.length}`);
  }
  const { rows } = await pool.query(
    `INSERT INTO busqueda (${columnas.join(', ')})
     VALUES (${marcadores.join(', ')})
     RETURNING ${COLS_BUSQUEDA}`,
    values,
  );
  return filaBusqueda(rows[0]);
}

export async function actualizarBusqueda(
  id: number,
  data: ActualizarBusqueda,
): Promise<Busqueda | null> {
  const asignaciones: string[] = [];
  const values: unknown[] = [];
  for (const c of CAMPOS_BUSQUEDA) {
    if (data[c] === undefined) continue;
    values.push(data[c]);
    asignaciones.push(`${c} = $${values.length}`);
  }
  if (asignaciones.length === 0) {
    throw new Error('Se debe enviar al menos un campo a actualizar');
  }
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE busqueda SET ${asignaciones.join(', ')}
      WHERE id = $${values.length} AND activo = true
      RETURNING ${COLS_BUSQUEDA}`,
    values,
  );
  return rows[0] ? filaBusqueda(rows[0]) : null;
}

/** Borrado lógico, regla global del monorepo: nunca un DELETE físico. */
export async function borrarBusqueda(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE busqueda SET activo = false, deleted_at = NOW()
      WHERE id = $1 AND activo = true`,
    [id],
  );
  return (rowCount ?? 0) > 0;
}

export async function marcarRastreo(
  id: number,
  error: string | null,
  exec: Ejecutor = pool,
): Promise<void> {
  await exec.query(
    `UPDATE busqueda SET ultimo_rastreo = NOW(), ultimo_rastreo_error = $2 WHERE id = $1`,
    [id, error],
  );
}

// ---------------------------------------------------------------------------
// Anuncios
// ---------------------------------------------------------------------------

const COLS_ANUNCIO = `id, busqueda_id, tipo, portal, portal_id, url, titulo, descripcion,
  precio, precio_anterior, superficie_m2, facturacion, imagen_url,
  direccion, municipio, provincia, comunidad, latitud, longitud, precision_coordenadas,
  veredicto, veredicto_motivo, distancia_farmacia_m, farmacia_mas_cercana_id,
  distancia_centro_m, centro_mas_cercano_id, viabilidad_calculada_en, viabilidad_motor,
  visto, descartado, notificado, created_at, updated_at`;

export interface FiltroAnuncios {
  busquedaId?: number;
  tipo?: 'local' | 'farmacia';
  veredicto?: string;
  soloNuevos?: boolean;
  incluirDescartados?: boolean;
  limite?: number;
}

export function construirListAnuncios(filtro: FiltroAnuncios): { text: string; values: unknown[] } {
  const where = ['a.activo = true', 'b.activo = true'];
  const values: unknown[] = [];

  if (filtro.busquedaId !== undefined) {
    values.push(filtro.busquedaId);
    where.push(`a.busqueda_id = $${values.length}`);
  }
  if (filtro.tipo) {
    values.push(filtro.tipo);
    where.push(`a.tipo = $${values.length}`);
  }
  if (filtro.veredicto) {
    values.push(filtro.veredicto);
    where.push(`a.veredicto = $${values.length}`);
  }
  if (filtro.soloNuevos) where.push('a.visto = false');
  if (!filtro.incluirDescartados) where.push('a.descartado = false');

  values.push(Math.min(Math.max(filtro.limite ?? 200, 1), 500));

  return {
    text: `SELECT ${COLS_ANUNCIO.split(',').map((c) => `a.${c.trim()}`).join(', ')},
                  b.nombre AS busqueda_nombre
             FROM anuncio a
             JOIN busqueda b ON b.id = a.busqueda_id
            WHERE ${where.join(' AND ')}
            ORDER BY a.created_at DESC
            LIMIT $${values.length}`,
    values,
  };
}

export async function listAnuncios(
  filtro: FiltroAnuncios,
): Promise<Array<Anuncio & { busqueda_nombre: string }>> {
  const { text, values } = construirListAnuncios(filtro);
  const { rows } = await pool.query(text, values);
  return rows.map((r) => normalizarFila(r) as unknown as Anuncio & { busqueda_nombre: string });
}

export async function actualizarAnuncio(
  id: number,
  data: { visto?: boolean; descartado?: boolean },
): Promise<Anuncio | null> {
  const asignaciones: string[] = [];
  const values: unknown[] = [];
  for (const c of ['visto', 'descartado'] as const) {
    if (data[c] === undefined) continue;
    values.push(data[c]);
    asignaciones.push(`${c} = $${values.length}`);
  }
  if (asignaciones.length === 0) {
    throw new Error('Se debe enviar al menos un campo a actualizar');
  }
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE anuncio SET ${asignaciones.join(', ')}
      WHERE id = $${values.length} AND activo = true
      RETURNING ${COLS_ANUNCIO}`,
    values,
  );
  return rows[0] ? (normalizarFila(rows[0]) as unknown as Anuncio) : null;
}

export async function marcarTodosVistos(busquedaId: number | null): Promise<number> {
  const values: unknown[] = [];
  let filtro = '';
  if (busquedaId !== null) {
    values.push(busquedaId);
    filtro = ` AND busqueda_id = $${values.length}`;
  }
  const { rowCount } = await pool.query(
    `UPDATE anuncio SET visto = true WHERE activo = true AND visto = false${filtro}`,
    values,
  );
  return rowCount ?? 0;
}

export async function borrarAnuncio(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE anuncio SET activo = false, deleted_at = NOW() WHERE id = $1 AND activo = true`,
    [id],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Alta o refresco de un anuncio en una sola ida y vuelta.
 *
 * `COALESCE(EXCLUDED.x, anuncio.x)` implementa la regla de "un listado más
 * pobre no borra lo que ya sabíamos". `precio_anterior` se calcula dentro del
 * DO UPDATE con el valor ANTERIOR de la fila. No se tocan `visto`/`descartado`
 * /`notificado`: un anuncio que reaparece no vuelve al estado de no visto.
 * `(xmax = 0)` distingue INSERT (novedad real) de UPDATE.
 */
export const SQL_UPSERT_ANUNCIO = `INSERT INTO anuncio
    (busqueda_id, tipo, portal, portal_id, url, titulo, descripcion, precio,
     superficie_m2, facturacion, imagen_url, direccion, municipio, provincia, comunidad,
     latitud, longitud, precision_coordenadas, veredicto, veredicto_motivo,
     distancia_farmacia_m, farmacia_mas_cercana_id, distancia_centro_m, centro_mas_cercano_id,
     viabilidad_calculada_en, viabilidad_motor)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
  ON CONFLICT (busqueda_id, portal, portal_id) DO UPDATE SET
    url = EXCLUDED.url,
    titulo = COALESCE(EXCLUDED.titulo, anuncio.titulo),
    descripcion = COALESCE(EXCLUDED.descripcion, anuncio.descripcion),
    precio = EXCLUDED.precio,
    precio_anterior = CASE
        WHEN EXCLUDED.precio IS DISTINCT FROM anuncio.precio
        THEN anuncio.precio ELSE anuncio.precio_anterior END,
    superficie_m2 = COALESCE(EXCLUDED.superficie_m2, anuncio.superficie_m2),
    facturacion = COALESCE(EXCLUDED.facturacion, anuncio.facturacion),
    imagen_url = COALESCE(EXCLUDED.imagen_url, anuncio.imagen_url),
    direccion = COALESCE(EXCLUDED.direccion, anuncio.direccion),
    municipio = COALESCE(EXCLUDED.municipio, anuncio.municipio),
    provincia = COALESCE(EXCLUDED.provincia, anuncio.provincia),
    comunidad = COALESCE(EXCLUDED.comunidad, anuncio.comunidad),
    latitud = COALESCE(EXCLUDED.latitud, anuncio.latitud),
    longitud = COALESCE(EXCLUDED.longitud, anuncio.longitud),
    precision_coordenadas = EXCLUDED.precision_coordenadas,
    veredicto = EXCLUDED.veredicto,
    veredicto_motivo = EXCLUDED.veredicto_motivo,
    distancia_farmacia_m = EXCLUDED.distancia_farmacia_m,
    farmacia_mas_cercana_id = EXCLUDED.farmacia_mas_cercana_id,
    distancia_centro_m = EXCLUDED.distancia_centro_m,
    centro_mas_cercano_id = EXCLUDED.centro_mas_cercano_id,
    viabilidad_calculada_en = EXCLUDED.viabilidad_calculada_en,
    viabilidad_motor = EXCLUDED.viabilidad_motor,
    activo = true,
    deleted_at = NULL
  RETURNING ${COLS_ANUNCIO}, (xmax = 0) AS es_nuevo`;

export function valoresUpsertAnuncio(
  busquedaId: number,
  a: AnuncioCrudo,
  v: ViabilidadColumnas,
): unknown[] {
  return [
    busquedaId, a.tipo, a.portal, a.portalId, a.url, a.titulo, a.descripcion, a.precio,
    a.superficieM2, a.facturacion, a.imagenUrl, a.direccion, a.municipio, a.provincia, a.comunidad,
    a.latitud, a.longitud, a.precision, v.veredicto, v.veredicto_motivo,
    v.distancia_farmacia_m, v.farmacia_mas_cercana_id, v.distancia_centro_m, v.centro_mas_cercano_id,
    v.viabilidad_calculada_en, v.viabilidad_motor,
  ];
}

export async function upsertAnuncio(
  busquedaId: number,
  a: AnuncioCrudo,
  v: ViabilidadColumnas,
  exec: Ejecutor = pool,
): Promise<(Anuncio & { es_nuevo: boolean }) | null> {
  const { rows } = await exec.query(SQL_UPSERT_ANUNCIO, valoresUpsertAnuncio(busquedaId, a, v));
  return rows[0] ? (normalizarFila(rows[0]) as unknown as Anuncio & { es_nuevo: boolean }) : null;
}

export async function marcarNotificado(id: number, exec: Ejecutor = pool): Promise<void> {
  await exec.query(`UPDATE anuncio SET notificado = true WHERE id = $1`, [id]);
}

// ---------------------------------------------------------------------------
// Recálculo de viabilidad
// ---------------------------------------------------------------------------

/**
 * Anuncios cuya viabilidad conviene recalcular: los que se midieron con otro
 * motor, o hace demasiado (por si el padrón cambió). Acotado con LIMIT para que
 * una vuelta del planificador no se convierta en un recálculo masivo.
 */
export async function anunciosParaRecalcular(
  motorActual: string | null,
  limite = 200,
): Promise<Anuncio[]> {
  const { rows } = await pool.query(
    `SELECT ${COLS_ANUNCIO} FROM anuncio
      WHERE activo = true
        AND latitud IS NOT NULL AND longitud IS NOT NULL
        AND (viabilidad_motor IS DISTINCT FROM $1
             OR viabilidad_calculada_en IS NULL
             OR viabilidad_calculada_en < NOW() - INTERVAL '7 days')
      ORDER BY viabilidad_calculada_en ASC NULLS FIRST
      LIMIT $2`,
    [motorActual, limite],
  );
  return rows.map((r) => normalizarFila(r) as unknown as Anuncio);
}

/** Comunidades que ya tienen algo en el padrón — las que refresca el planificador. */
export async function comunidadesEnPadron(): Promise<string[]> {
  const { rows } = await pool.query<{ comunidad: string }>(
    `SELECT DISTINCT comunidad FROM farmacia WHERE activo AND comunidad IS NOT NULL`,
  );
  return rows.map((r) => r.comunidad);
}

export async function actualizarViabilidad(id: number, v: ViabilidadColumnas): Promise<void> {
  await pool.query(
    `UPDATE anuncio SET
       veredicto = $2, veredicto_motivo = $3,
       distancia_farmacia_m = $4, farmacia_mas_cercana_id = $5,
       distancia_centro_m = $6, centro_mas_cercano_id = $7,
       viabilidad_calculada_en = $8, viabilidad_motor = $9
     WHERE id = $1`,
    [
      id, v.veredicto, v.veredicto_motivo, v.distancia_farmacia_m, v.farmacia_mas_cercana_id,
      v.distancia_centro_m, v.centro_mas_cercano_id, v.viabilidad_calculada_en, v.viabilidad_motor,
    ],
  );
}
