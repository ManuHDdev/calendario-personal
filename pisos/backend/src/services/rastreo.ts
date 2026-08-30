/**
 * Un rastreo = una búsqueda guardada, contra todos sus portales habilitados.
 *
 * El objetivo de esta función es que un fallo NUNCA sea silencioso y NUNCA
 * sea total: si Fotocasa devuelve 403 pero pisos.com responde, el rastreo
 * sigue, guarda lo que ha encontrado y deja constancia de qué portal falló.
 * Un rastreo parcial no debe parecerse a uno completo (mismo principio que
 * `plan.fullCoverage` en la subapp `ruta`).
 */

import type { PoolClient } from 'pg';
import { pool } from '../db/pool';
import { getProvider } from '../portales';
import type { CriteriosPortal } from '../portales/types';
import { cumpleCriterios } from './criterios';
import { upsertAnuncio, marcarRastreo } from '../db/queries';
import { normalizarFila } from '../db/filas';
import { PORTALES } from '../types/pisos';
import type { Anuncio, AnuncioCrudo, Busqueda, PortalId } from '../types/pisos';

export interface NovedadAnuncio {
  anuncio: Anuncio;
  /** 'nuevo' = no se había visto nunca; 'bajada' = ya existía y bajó de precio. */
  tipo: 'nuevo' | 'bajada';
}

export interface ResultadoRastreo {
  busquedaId: string;
  busquedaNombre: string;
  /** Anuncios devueltos por los portales, antes de aplicar los criterios. */
  encontrados: number;
  /** Los que pasan el filtro y quedan guardados. */
  guardados: number;
  novedades: NovedadAnuncio[];
  /** Portales que fallaron, con el motivo. Vacío = rastreo completo. */
  fallos: Array<{ portal: PortalId; motivo: string }>;
  /** Portales saltados a propósito (deshabilitados o sin datos suficientes). */
  omitidos: Array<{ portal: PortalId; motivo: string }>;
}

function aCriteriosPortal(b: Busqueda): CriteriosPortal {
  return {
    ubicacion: b.ubicacion,
    latitud: b.latitud,
    longitud: b.longitud,
    radioKm: b.radio_km,
    precioMin: b.precio_min,
    precioMax: b.precio_max,
    metrosMin: b.metros_min,
    metrosMax: b.metros_max,
    habitacionesMin: b.habitaciones_min,
    banosMin: b.banos_min,
  };
}

interface FilaUpsert extends Anuncio {
  es_nuevo: boolean;
}

/**
 * Pide sus anuncios a cada portal habilitado.
 *
 * Cada portal se envuelve en su propio try: un portal caído degrada el
 * resultado, no lo aborta.
 */
async function recolectar(
  busqueda: Busqueda,
  maxPaginas: number,
): Promise<{
  anuncios: AnuncioCrudo[];
  fallos: ResultadoRastreo['fallos'];
  omitidos: ResultadoRastreo['omitidos'];
}> {
  const criterios = aCriteriosPortal(busqueda);
  const anuncios: AnuncioCrudo[] = [];
  const fallos: ResultadoRastreo['fallos'] = [];
  const omitidos: ResultadoRastreo['omitidos'] = [];

  for (const portalId of PORTALES) {
    if (!busqueda.portales?.[portalId]?.enabled) {
      omitidos.push({ portal: portalId, motivo: 'deshabilitado en la búsqueda' });
      continue;
    }

    const provider = getProvider(portalId);
    const disponibilidad = provider.puedeBuscar(criterios);
    if (!disponibilidad.ok) {
      omitidos.push({ portal: portalId, motivo: disponibilidad.motivo });
      continue;
    }

    try {
      anuncios.push(...(await provider.buscar(criterios, { maxPaginas })));
    } catch (err) {
      fallos.push({
        portal: portalId,
        motivo: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { anuncios, fallos, omitidos };
}

export interface OpcionesRastreo {
  maxPaginas?: number;
  /**
   * Si es `false`, se guardan los anuncios pero NO se marcan como novedad.
   * Se usa en el primer rastreo de una búsqueda recién creada: sin esto, la
   * carga inicial mandaría de golpe cien avisos de Telegram de pisos que
   * llevan meses publicados.
   */
  notificarNovedades?: boolean;
}

export async function rastrearBusqueda(
  busqueda: Busqueda,
  opciones: OpcionesRastreo = {},
): Promise<ResultadoRastreo> {
  const maxPaginas = opciones.maxPaginas ?? 2;
  const { anuncios, fallos, omitidos } = await recolectar(busqueda, maxPaginas);

  const novedades: NovedadAnuncio[] = [];
  let guardados = 0;

  const client: PoolClient = await pool.connect();
  try {
    for (const crudo of anuncios) {
      if (!cumpleCriterios(crudo, busqueda).cumple) continue;

      const { text, values } = upsertAnuncio(busqueda.id, crudo);
      const { rows } = await client.query<FilaUpsert>(text, values);
      if (rows.length === 0) continue;

      const fila = normalizarFila(rows[0]);
      guardados++;

      if (!opciones.notificarNovedades) continue;

      if (fila.es_nuevo) {
        novedades.push({ anuncio: fila, tipo: 'nuevo' });
      } else if (
        fila.precio !== null &&
        fila.precio_previo !== null &&
        fila.precio < fila.precio_previo
      ) {
        novedades.push({ anuncio: fila, tipo: 'bajada' });
      }
    }

    // El error se guarda en la búsqueda para que la UI pueda decir "Fotocasa
    // lleva fallando desde ayer" en vez de mostrar un listado corto sin
    // explicación.
    const resumenFallos =
      fallos.length > 0 ? fallos.map((f) => `${f.portal}: ${f.motivo}`).join(' | ') : null;
    const marca = marcarRastreo(busqueda.id, resumenFallos);
    await client.query(marca.text, marca.values);
  } finally {
    client.release();
  }

  return {
    busquedaId: busqueda.id,
    busquedaNombre: busqueda.nombre,
    encontrados: anuncios.length,
    guardados,
    novedades,
    fallos,
    omitidos,
  };
}
