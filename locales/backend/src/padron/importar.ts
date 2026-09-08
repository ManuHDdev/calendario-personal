/**
 * Persistencia del padrón: traer las fuentes, guardarlas, fusionarlas y
 * recalcular la cobertura.
 *
 * Tres reglas que gobiernan este fichero:
 *
 *  1. **Una fuente que desaparece se da de baja, no se borra.** Si OSM deja de
 *     servir una farmacia, la fila se marca `activo = false` con su fecha. Un
 *     DELETE dejaría el padrón sin memoria de lo que hubo, y con un dato del
 *     que depende un veredicto legal eso no vale.
 *  2. **Una importación fallida no vacía nada.** La baja por ausencia solo se
 *     aplica si la fuente respondió; si Overpass falla, se conserva lo que hay
 *     y se dice. Vaciar el padrón por un 504 produciría verdes falsos en masa.
 *  3. **La cobertura se recalcula al final, siempre.** Es la salvaguarda
 *     contra el falso verde y no puede quedarse obsoleta tras un import.
 */

import { pool } from '../db/pool';
import { agruparDuplicados, type RegistroPadron } from './fusion';
import { evaluarCobertura } from './cobertura';
import {
  centrosDeComunidad,
  esperarEntreConsultas,
  farmaciasDeComunidad,
  ISO_POR_COMUNIDAD,
  poblacionesDeComunidad,
  type EstablecimientoOsm,
} from './osm';
import { descargarDatasetMadrid, parsearDatasetMadrid } from './oficial/madrid';
import { geocodificar } from '../services/geocoding';

export interface ResumenImportacion {
  comunidad: string;
  farmaciasImportadas: number;
  centrosImportados: number;
  poblacionesImportadas: number;
  duplicadosFusionados: number;
  municipiosEvaluados: number;
  municipiosIncompletos: number;
  errores: string[];
}

interface FilaUpsert {
  fuente: string;
  fuenteId: string;
  nombre: string | null;
  direccion: string | null;
  municipio: string | null;
  provincia: string | null;
  comunidad: string;
  lat: number;
  lng: number;
  precision: string;
  tipo?: string;
}

export async function upsertEstablecimientos(
  tabla: 'farmacia' | 'centro_sanitario',
  filas: FilaUpsert[],
): Promise<void> {
  if (filas.length === 0) return;

  // Las dos tablas comparten forma salvo por `tipo`, que solo tienen los
  // centros. Los parámetros se construyen por tabla en vez de mandar siempre
  // los once y dejar uno sin referenciar: Postgres rechaza un parámetro que la
  // sentencia no usa ("could not determine data type of parameter $N").
  const comunes = {
    fuente: filas.map((f) => f.fuente),
    fuenteId: filas.map((f) => f.fuenteId),
    nombre: filas.map((f) => f.nombre),
    direccion: filas.map((f) => f.direccion),
    municipio: filas.map((f) => f.municipio),
    provincia: filas.map((f) => f.provincia),
    comunidad: filas.map((f) => f.comunidad),
    lat: filas.map((f) => f.lat),
    lng: filas.map((f) => f.lng),
    precision: filas.map((f) => f.precision),
  };

  if (tabla === 'centro_sanitario') {
    await pool.query(
      `INSERT INTO centro_sanitario
         (fuente, fuente_id, tipo, nombre, direccion, municipio, provincia, comunidad,
          latitud, longitud, precision_coordenadas, visto_en, activo, deleted_at)
       SELECT t.*, NOW(), TRUE, NULL::timestamptz
         FROM unnest(
           $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
           $7::text[], $8::text[], $9::float8[], $10::float8[], $11::text[]
         ) AS t(fuente, fuente_id, tipo, nombre, direccion, municipio, provincia,
                comunidad, latitud, longitud, precision_coordenadas)
       ON CONFLICT (fuente, fuente_id) DO UPDATE SET
         tipo = EXCLUDED.tipo, nombre = EXCLUDED.nombre, direccion = EXCLUDED.direccion,
         municipio = EXCLUDED.municipio, provincia = EXCLUDED.provincia,
         comunidad = EXCLUDED.comunidad, latitud = EXCLUDED.latitud,
         longitud = EXCLUDED.longitud, precision_coordenadas = EXCLUDED.precision_coordenadas,
         visto_en = NOW(), activo = TRUE, deleted_at = NULL`,
      [
        comunes.fuente,
        comunes.fuenteId,
        filas.map((f) => f.tipo ?? 'primaria'),
        comunes.nombre,
        comunes.direccion,
        comunes.municipio,
        comunes.provincia,
        comunes.comunidad,
        comunes.lat,
        comunes.lng,
        comunes.precision,
      ],
    );
    return;
  }

  await pool.query(
    `INSERT INTO farmacia
       (fuente, fuente_id, nombre, direccion, municipio, provincia, comunidad,
        latitud, longitud, precision_coordenadas, visto_en, activo, deleted_at)
     SELECT t.*, NOW(), TRUE, NULL::timestamptz
       FROM unnest(
         $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
         $7::text[], $8::float8[], $9::float8[], $10::text[]
       ) AS t(fuente, fuente_id, nombre, direccion, municipio, provincia,
              comunidad, latitud, longitud, precision_coordenadas)
     ON CONFLICT (fuente, fuente_id) DO UPDATE SET
       nombre = EXCLUDED.nombre, direccion = EXCLUDED.direccion,
       municipio = EXCLUDED.municipio, provincia = EXCLUDED.provincia,
       comunidad = EXCLUDED.comunidad, latitud = EXCLUDED.latitud,
       longitud = EXCLUDED.longitud, precision_coordenadas = EXCLUDED.precision_coordenadas,
       visto_en = NOW(), activo = TRUE, deleted_at = NULL`,
    [
      comunes.fuente,
      comunes.fuenteId,
      comunes.nombre,
      comunes.direccion,
      comunes.municipio,
      comunes.provincia,
      comunes.comunidad,
      comunes.lat,
      comunes.lng,
      comunes.precision,
    ],
  );
}

/**
 * Da de baja lo que la fuente ya no sirve.
 *
 * Se compara por `visto_en`: cualquier fila de esa fuente y comunidad que no
 * se haya tocado en esta pasada ya no está en el origen.
 */
export async function bajaPorAusencia(
  tabla: 'farmacia' | 'centro_sanitario',
  fuente: string,
  comunidad: string,
  desde: Date,
): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE ${tabla}
        SET activo = FALSE, deleted_at = NOW()
      WHERE activo AND fuente = $1 AND comunidad = $2 AND visto_en < $3`,
    [fuente, comunidad, desde],
  );
  return rowCount ?? 0;
}

/** Marca duplicados dentro de una comunidad. */
export async function fusionar(tabla: 'farmacia' | 'centro_sanitario', comunidad: string): Promise<number> {
  const { rows } = await pool.query<{ id: number; fuente: string; nombre: string | null; latitud: number; longitud: number }>(
    `SELECT id, fuente, nombre, latitud, longitud FROM ${tabla} WHERE activo AND comunidad = $1`,
    [comunidad],
  );

  const registros: RegistroPadron[] = rows.map((r) => ({
    id: r.id,
    fuente: r.fuente,
    nombre: r.nombre,
    lat: Number(r.latitud),
    lng: Number(r.longitud),
  }));

  const decisiones = agruparDuplicados(registros);

  // Primero se limpia la marca anterior: si una fusión previa se equivocó (o
  // la fuente ha cambiado), reejecutar debe poder deshacerla.
  await pool.query(`UPDATE ${tabla} SET duplicado_de_id = NULL WHERE comunidad = $1`, [comunidad]);

  let total = 0;
  for (const d of decisiones) {
    if (d.duplicadosIds.length === 0) continue;
    await pool.query(
      `UPDATE ${tabla} SET duplicado_de_id = $1 WHERE id = ANY($2::int[])`,
      [d.supervivienteId, d.duplicadosIds],
    );
    total += d.duplicadosIds.length;
  }
  return total;
}

/** Recalcula la cobertura de todos los municipios con datos en el padrón. */
export async function recalcularCobertura(): Promise<{ evaluados: number; incompletos: number }> {
  const { rows } = await pool.query<{
    municipio: string;
    provincia: string | null;
    conocidas: string;
    poblacion: number | null;
  }>(
    `SELECT f.municipio,
            f.provincia,
            count(*)::text AS conocidas,
            max(c.poblacion) AS poblacion
       FROM farmacia f
       LEFT JOIN cobertura_municipio c
              ON c.municipio = f.municipio
             AND c.provincia IS NOT DISTINCT FROM f.provincia
      WHERE f.activo AND f.duplicado_de_id IS NULL AND f.municipio IS NOT NULL
      GROUP BY f.municipio, f.provincia`,
  );

  let incompletos = 0;
  for (const r of rows) {
    const salida = evaluarCobertura({
      municipio: r.municipio,
      provincia: r.provincia,
      farmaciasConocidas: Number(r.conocidas),
      poblacion: r.poblacion === null ? null : Number(r.poblacion),
    });
    if (!salida.suficiente) incompletos++;

    await pool.query(
      `INSERT INTO cobertura_municipio
         (municipio, provincia, farmacias_conocidas, poblacion, farmacias_esperadas, suficiente, motivo, calculado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (municipio, provincia) DO UPDATE SET
         farmacias_conocidas = EXCLUDED.farmacias_conocidas,
         farmacias_esperadas = EXCLUDED.farmacias_esperadas,
         suficiente = EXCLUDED.suficiente,
         motivo = EXCLUDED.motivo,
         calculado_en = NOW()`,
      [
        salida.municipio,
        salida.provincia,
        salida.farmaciasConocidas,
        salida.poblacion,
        salida.farmaciasEsperadas,
        salida.suficiente,
        salida.motivo,
      ],
    );
  }

  return { evaluados: rows.length, incompletos };
}

async function guardarPoblaciones(
  poblaciones: Array<{ municipio: string; poblacion: number }>,
  provincia: string | null,
): Promise<void> {
  for (const p of poblaciones) {
    await pool.query(
      `INSERT INTO cobertura_municipio (municipio, provincia, farmacias_conocidas, poblacion)
       VALUES ($1, $2, 0, $3)
       ON CONFLICT (municipio, provincia) DO UPDATE SET poblacion = EXCLUDED.poblacion`,
      [p.municipio, provincia, p.poblacion],
    );
  }
}

function aFilaUpsert(e: EstablecimientoOsm, comunidad: string, fuente: string): FilaUpsert {
  return {
    fuente,
    fuenteId: e.fuenteId,
    nombre: e.nombre,
    direccion: e.direccion,
    municipio: e.municipio,
    provincia: null,
    comunidad,
    lat: e.lat,
    lng: e.lng,
    precision: e.precision,
    tipo: e.tipo,
  };
}

/**
 * Importa el padrón de una comunidad: OSM siempre, más el oficial si existe.
 *
 * Cada paso captura su propio error: que falle el dataset de Madrid no debe
 * impedir que se guarde lo de OSM, ni al revés.
 */
export async function importarComunidad(comunidad: string): Promise<ResumenImportacion> {
  if (!ISO_POR_COMUNIDAD[comunidad]) {
    throw new Error(`Comunidad desconocida: "${comunidad}"`);
  }

  const resumen: ResumenImportacion = {
    comunidad,
    farmaciasImportadas: 0,
    centrosImportados: 0,
    poblacionesImportadas: 0,
    duplicadosFusionados: 0,
    municipiosEvaluados: 0,
    municipiosIncompletos: 0,
    errores: [],
  };

  const inicio = new Date();

  // --- OSM: farmacias -------------------------------------------------------
  try {
    const farmacias = await farmaciasDeComunidad(comunidad);
    await upsertEstablecimientos(
      'farmacia',
      farmacias.map((f) => aFilaUpsert(f, comunidad, 'osm')),
    );
    resumen.farmaciasImportadas += farmacias.length;
    // Solo se dan de baja ausencias si la fuente respondió (regla 2).
    await bajaPorAusencia('farmacia', 'osm', comunidad, inicio);
  } catch (err) {
    resumen.errores.push(`OSM farmacias: ${err instanceof Error ? err.message : String(err)}`);
  }

  await esperarEntreConsultas();

  // --- OSM: centros sanitarios ---------------------------------------------
  try {
    const centros = await centrosDeComunidad(comunidad);
    await upsertEstablecimientos(
      'centro_sanitario',
      centros.map((c) => aFilaUpsert(c, comunidad, 'osm')),
    );
    resumen.centrosImportados += centros.length;
    await bajaPorAusencia('centro_sanitario', 'osm', comunidad, inicio);
  } catch (err) {
    resumen.errores.push(`OSM centros: ${err instanceof Error ? err.message : String(err)}`);
  }

  await esperarEntreConsultas();

  // --- OSM: poblaciones municipales ----------------------------------------
  try {
    const poblaciones = await poblacionesDeComunidad(comunidad);
    await guardarPoblaciones(poblaciones, null);
    resumen.poblacionesImportadas = poblaciones.length;
  } catch (err) {
    resumen.errores.push(`OSM poblaciones: ${err instanceof Error ? err.message : String(err)}`);
  }

  // --- Fuente oficial, donde la haya ---------------------------------------
  if (comunidad === 'madrid') {
    try {
      const csv = await descargarDatasetMadrid();
      const oficiales = parsearDatasetMadrid(csv);
      const filas: FilaUpsert[] = [];

      for (const f of oficiales) {
        let { lat, lng } = f;
        let precision = f.precision;

        if ((lat === null || lng === null) && f.consultaGeocodificacion) {
          try {
            const g = await geocodificar(f.consultaGeocodificacion);
            lat = g.lat;
            lng = g.lng;
            precision = g.precision;
          } catch {
            // Una dirección que no se puede geocodificar se salta: meterla sin
            // coordenadas no aportaría nada al cálculo de distancias.
            continue;
          }
        }
        if (lat === null || lng === null) continue;

        filas.push({
          fuente: 'oficial_madrid',
          fuenteId: f.fuenteId,
          nombre: f.nombre,
          direccion: f.direccion,
          municipio: f.municipio,
          provincia: 'Madrid',
          comunidad: 'madrid',
          lat,
          lng,
          precision,
        });
      }

      await upsertEstablecimientos('farmacia', filas);
      resumen.farmaciasImportadas += filas.length;
      await bajaPorAusencia('farmacia', 'oficial_madrid', comunidad, inicio);
    } catch (err) {
      resumen.errores.push(`Oficial Madrid: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // --- Fusión y cobertura ---------------------------------------------------
  resumen.duplicadosFusionados =
    (await fusionar('farmacia', comunidad)) + (await fusionar('centro_sanitario', comunidad));

  const cobertura = await recalcularCobertura();
  resumen.municipiosEvaluados = cobertura.evaluados;
  resumen.municipiosIncompletos = cobertura.incompletos;

  return resumen;
}

export async function padronVacio(): Promise<boolean> {
  const { rows } = await pool.query<{ n: string }>(
    'SELECT count(*)::text AS n FROM farmacia WHERE activo',
  );
  return Number(rows[0]?.n ?? 0) === 0;
}
