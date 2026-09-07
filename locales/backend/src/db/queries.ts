/**
 * Acceso a datos. Consultas directas con `pg`, sin ORM, como el resto del
 * monorepo. Todo listado filtra `activo = true`.
 */

import { pool } from './pool';
import type {
  Establecimiento,
  NombreMotor,
  PrecisionCoordenadas,
  Umbrales,
} from '../types/locales';
import type { CajaBusqueda } from '../viabilidad/geo';

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
